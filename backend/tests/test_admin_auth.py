from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.admin.auth import login_rate_limiter
from app.core.security import create_access_token
from app.models import Admin, AdminAuditLog
from tests.conftest import TEST_PASSWORD

LOGIN = "/api/v1/admin/auth/login"
ME = "/api/v1/admin/auth/me"


def test_login_returns_token_and_records_audit(client: TestClient, admin: Admin, db: Session) -> None:
    res = client.post(LOGIN, json={"email": "FOUNDER@example.com", "password": TEST_PASSWORD})

    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["admin"]["email"] == admin.email
    assert "password_hash" not in body["admin"]
    assert db.scalar(select(AdminAuditLog.action)) == "admin.login"


def test_login_rejects_wrong_password_and_unknown_email_identically(
    client: TestClient, admin: Admin
) -> None:
    wrong_password = client.post(LOGIN, json={"email": admin.email, "password": "nope"})
    unknown_email = client.post(LOGIN, json={"email": "nobody@example.com", "password": "nope"})

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_inactive_admin_cannot_log_in_or_use_existing_token(
    client: TestClient, admin: Admin, auth_headers: dict[str, str], db: Session
) -> None:
    admin.is_active = False
    db.commit()

    assert client.post(LOGIN, json={"email": admin.email, "password": TEST_PASSWORD}).status_code == 401
    assert client.get(ME, headers=auth_headers).status_code == 401


def test_me_requires_valid_token(client: TestClient, admin: Admin, auth_headers: dict[str, str]) -> None:
    assert client.get(ME).status_code == 401
    assert client.get(ME, headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401

    res = client.get(ME, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["id"] == admin.id


def test_token_for_deleted_admin_is_rejected(client: TestClient) -> None:
    token, _ = create_access_token(admin_id=999)
    assert client.get(ME, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_login_is_rate_limited(client: TestClient, admin: Admin) -> None:
    for _ in range(login_rate_limiter.max_requests):
        client.post(LOGIN, json={"email": admin.email, "password": "wrong"})

    res = client.post(LOGIN, json={"email": admin.email, "password": TEST_PASSWORD})
    assert res.status_code == 429
    assert "Retry-After" in res.headers
