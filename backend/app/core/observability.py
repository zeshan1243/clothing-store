"""Logging, request logs, security headers and optional Sentry error reporting.

Request logs record method, a *redacted* path, status and duration only: no bodies, query strings,
customer tokens or personal data.
"""

import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import Settings

request_logger = logging.getLogger("app.request")

# Public order references are bearer secrets: never write them to logs.
_REDACTIONS = [(re.compile(r"^(/api/v1/orders/)[^/]+"), r"\1[token]")]


def redact_path(path: str) -> str:
    for pattern, replacement in _REDACTIONS:
        path = pattern.sub(replacement, path)
    return path


def configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # Uvicorn's access log prints full URLs (including order tokens); we log requests ourselves.
    logging.getLogger("uvicorn.access").disabled = True


def configure_sentry(settings: Settings) -> None:
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    def scrub(event, _hint):
        request = event.get("request") or {}
        if "url" in request:
            request["url"] = redact_path(request["url"].split("?")[0])
        request.pop("data", None)
        request.pop("cookies", None)
        request.pop("query_string", None)
        headers = request.get("headers") or {}
        headers.pop("Authorization", None)
        headers.pop("authorization", None)
        return event

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False,
        traces_sample_rate=0.0,
        before_send=scrub,
    )


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            if request.url.path != "/health":
                request_logger.info(
                    "%s %s %s %.0fms id=%s",
                    request.method,
                    redact_path(request.url.path),
                    status_code,
                    (time.perf_counter() - start) * 1000,
                    request_id,
                )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, hsts: bool) -> None:
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "no-referrer")
        headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if request.url.path.startswith("/api/v1/admin"):
            headers.setdefault("Cache-Control", "no-store")
        if self.hsts:
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
