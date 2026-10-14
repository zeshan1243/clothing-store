from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token, decode_customer_token
from app.models import Admin, Customer
from app.models.enums import AdminRole

DbSession = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)

_UNAUTHORISED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_admin(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Admin:
    if credentials is None:
        raise _UNAUTHORISED
    admin_id = decode_access_token(credentials.credentials)
    if admin_id is None:
        raise _UNAUTHORISED
    admin = db.get(Admin, admin_id)
    # Deactivating an admin revokes access immediately, even with an unexpired token.
    if admin is None or not admin.is_active:
        raise _UNAUTHORISED
    return admin


CurrentAdmin = Annotated[Admin, Depends(get_current_admin)]


def require_owner(admin: CurrentAdmin) -> Admin:
    if admin.role != AdminRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")
    return admin


OwnerAdmin = Annotated[Admin, Depends(require_owner)]


def _customer_from(db: Session, credentials: HTTPAuthorizationCredentials | None) -> Customer | None:
    if credentials is None:
        return None
    decoded = decode_customer_token(credentials.credentials)
    if decoded is None:
        return None
    customer = db.get(Customer, decoded[0])
    # Password changes/resets and account deletion bump token_version, ending older sessions.
    if customer is None or not customer.is_registered or customer.token_version != decoded[1]:
        return None
    return customer


def get_current_customer(
    db: DbSession, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> Customer:
    customer = _customer_from(db, credentials)
    if customer is None:
        raise _UNAUTHORISED
    return customer


def get_optional_customer(
    db: DbSession, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> Customer | None:
    """For guest-or-signed-in endpoints (checkout): an invalid/expired token just means guest."""
    return _customer_from(db, credentials)


CurrentCustomer = Annotated[Customer, Depends(get_current_customer)]
OptionalCustomer = Annotated[Customer | None, Depends(get_optional_customer)]
