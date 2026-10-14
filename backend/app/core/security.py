from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

_hasher = PasswordHasher()

# Verified against when the email is unknown, so login timing doesn't reveal which emails exist.
_DUMMY_HASH = _hasher.hash("timing-equaliser")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(admin_id: int) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": str(admin_id), "iat": now, "exp": expires_at, "typ": "admin"}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_at


def decode_access_token(token: str) -> int | None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "admin":
        return None
    try:
        return int(payload["sub"])
    except (TypeError, ValueError):
        return None


def create_customer_token(customer_id: int, version: int) -> tuple[str, datetime]:
    """Storefront session. `typ` keeps it from ever passing admin checks; `ver` lets us revoke it."""
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=settings.customer_session_days)
    payload = {"sub": str(customer_id), "iat": now, "exp": expires_at, "typ": "customer", "ver": version}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_at


def decode_customer_token(token: str) -> tuple[int, int] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm], options={"require": ["sub", "exp", "iat"]}
        )
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "customer":
        return None
    try:
        return int(payload["sub"]), int(payload.get("ver", 0))
    except (TypeError, ValueError):
        return None
