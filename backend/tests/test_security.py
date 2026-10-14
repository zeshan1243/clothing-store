import re

import pytest
from fastapi.testclient import TestClient

from app.core.observability import redact_path
from app.main import app
from tests.conftest import TEST_PASSWORD
from tests.test_catalog import make_product

PUBLIC_ADMIN_ROUTES = {"/api/v1/admin/auth/login"}


def _admin_routes() -> list[tuple[str, str]]:
    """Every admin endpoint, from the OpenAPI schema (covers nested routers)."""
    routes = []
    for path, operations in app.openapi()["paths"].items():
        if path.startswith("/api/v1/admin") and path not in PUBLIC_ADMIN_ROUTES:
            for method in operations:
                routes.append((method.upper(), re.sub(r"\{[^}]+\}", "1", path)))
    return sorted(routes)


@pytest.mark.parametrize("method, path", _admin_routes())
def test_every_admin_endpoint_requires_authentication(client: TestClient, method: str, path: str) -> None:
    res = client.request(method, path, json={})
    assert res.status_code == 401, f"{method} {path} returned {res.status_code}"


def test_admin_route_inventory_is_not_empty() -> None:
    # Guards the parametrised test above from silently testing nothing.
    assert len(_admin_routes()) > 30


def test_security_headers(client: TestClient, auth_headers: dict) -> None:
    res = client.get("/api/v1/categories")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"
    assert "X-Request-ID" in res.headers
    assert "Strict-Transport-Security" not in res.headers  # only in production

    admin = client.get("/api/v1/admin/products", headers=auth_headers)
    assert admin.headers["Cache-Control"] == "no-store"


def test_cors_only_allows_configured_origin(client: TestClient) -> None:
    ok = client.options(
        "/api/v1/orders",
        headers={"Origin": "http://localhost:4200", "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:4200"
    bad = client.options(
        "/api/v1/orders",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in bad.headers


def test_order_tokens_are_redacted_from_logs() -> None:
    assert redact_path("/api/v1/orders/abcDEF123_-xyz") == "/api/v1/orders/[token]"
    assert redact_path("/api/v1/admin/orders/5") == "/api/v1/admin/orders/5"


def test_change_password(client: TestClient, auth_headers: dict) -> None:
    url = "/api/v1/admin/auth/change-password"
    assert client.post(url, json={"current_password": "wrong", "new_password": "a-new-long-password"}, headers=auth_headers).status_code == 400
    assert client.post(url, json={"current_password": TEST_PASSWORD, "new_password": "short"}, headers=auth_headers).status_code == 422
    assert client.post(url, json={"current_password": TEST_PASSWORD, "new_password": "a-new-long-password"}, headers=auth_headers).status_code == 204

    login = "/api/v1/admin/auth/login"
    assert client.post(login, json={"email": "founder@example.com", "password": TEST_PASSWORD}).status_code == 401
    assert client.post(login, json={"email": "founder@example.com", "password": "a-new-long-password"}).status_code == 200


def test_sitemap_lists_only_public_pages(client: TestClient, auth_headers: dict) -> None:
    make_product(client, auth_headers, name="Live Hoodie", variants=[])
    make_product(client, auth_headers, name="Secret Draft", status="DRAFT", variants=[])
    res = client.get("/api/v1/seo/sitemap.xml")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/xml")
    assert "/products/live-hoodie" in res.text
    assert "secret-draft" not in res.text
    assert "/admin" not in res.text and "/checkout" not in res.text
