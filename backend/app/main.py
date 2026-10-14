import logging

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import engine
from app.core.observability import (
    RequestLogMiddleware,
    SecurityHeadersMiddleware,
    redact_path,
    configure_logging,
    configure_sentry,
)

logger = logging.getLogger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    is_production = settings.environment == "production"
    configure_logging(settings)
    configure_sentry(settings)

    app = FastAPI(
        title="Clothing Store API",
        version="0.1.0",
        # Interactive docs are handy locally but needn't be public in production.
        docs_url=None if is_production else "/docs",
        redoc_url=None,
        openapi_url=None if is_production else "/openapi.json",
    )

    app.add_middleware(SecurityHeadersMiddleware, hsts=is_production)
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
        # Log the path and error type only: request bodies may contain customer personal data.
        logger.exception("Unhandled error on %s %s", request.method, redact_path(request.url.path))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An unexpected error occurred."},
        )

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(api_router, prefix="/api/v1")
    return app


app = create_app()
