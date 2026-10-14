import os

# Point the app at the test database before anything imports the engine.
os.environ["ENVIRONMENT"] = "test"
_test_url = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/clothing_store_test"
)
os.environ["DATABASE_URL"] = _test_url

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.api.v1.account import account_rate_limiter  # noqa: E402
from app.api.v1.admin.auth import login_rate_limiter  # noqa: E402
from app.api.v1.public_orders import coupon_rate_limiter, order_rate_limiter, track_rate_limiter  # noqa: E402
from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Admin  # noqa: E402
from app.models.enums import AdminRole  # noqa: E402

TEST_PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    """Build the test schema through Alembic so the migrations themselves are exercised."""
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.set_main_option("sqlalchemy.url", _test_url)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def clean_tables() -> Iterator[None]:
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    login_rate_limiter.reset()
    order_rate_limiter.reset()
    coupon_rate_limiter.reset()
    track_rate_limiter.reset()
    account_rate_limiter.reset()


# Tables are truncated after every test, so seed the delivery areas tests rely on each time.
# "Test Town" (25 km → QAR 10 + 5 × QAR 1 = 15) keeps the long-standing QAR 15 test fee.
TEST_AREAS = [("Al Sadd", 3, True), ("Test Town", 25, False), ("Al Khor", 50, False)]


@pytest.fixture(autouse=True)
def delivery_areas() -> None:
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM delivery_areas"))  # the migration's real Qatar list
        for name, km, free in TEST_AREAS:
            conn.execute(
                text("INSERT INTO delivery_areas (name, distance_km, is_free) VALUES (:n, :km, :free)"),
                {"n": name, "km": km, "free": free},
            )


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin(db: Session) -> Admin:
    admin = Admin(
        name="Founder One",
        email="founder@example.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=AdminRole.OWNER,
    )
    db.add(admin)
    db.commit()
    return admin


@pytest.fixture
def auth_headers(client: TestClient, admin: Admin) -> dict[str, str]:
    res = client.post(
        "/api/v1/admin/auth/login", json={"email": admin.email, "password": TEST_PASSWORD}
    )
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}
