from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentCustomer, DbSession
from app.core.config import get_settings
from app.core.rate_limit import RateLimiter
from app.core.security import hash_password, password_needs_rehash, verify_password
from app.models import Customer
from app.schemas.account import (
    AccountOrderOut,
    ChangePasswordIn,
    LoginIn,
    ProfileOut,
    ProfileUpdate,
    RegisterIn,
    SessionOut,
)
from app.schemas.orders import normalise_qatar_mobile
from app.services.accounts import account_orders, new_session, now, profile

router = APIRouter(prefix="/account", tags=["storefront-account"])

account_rate_limiter = RateLimiter("account-auth", get_settings().account_rate_limit_per_minute)
BAD_LOGIN = "Incorrect phone number or password."


@router.post("/register", response_model=SessionOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(account_rate_limiter)])
def register(body: RegisterIn, db: DbSession) -> SessionOut:
    customer = db.scalar(select(Customer).where(Customer.phone == body.phone).with_for_update())
    if customer is not None and customer.is_registered:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account already exists for this number. Sign in instead.")
    if customer is None:
        # Someone who has never ordered: a fresh customer record.
        customer = Customer(full_name=body.full_name, phone=body.phone)
        db.add(customer)
    # A guest who ordered before keeps their record (and their orders, once the phone is verified).
    customer.full_name = body.full_name
    customer.email = body.email or customer.email
    customer.password_hash = hash_password(body.password)
    customer.registered_at = now()
    customer.last_login_at = now()
    customer.must_change_password = False
    db.flush()
    session = new_session(customer)
    db.commit()
    return session


@router.post("/login", response_model=SessionOut, dependencies=[Depends(account_rate_limiter)])
def login(body: LoginIn, db: DbSession) -> SessionOut:
    try:
        phone = normalise_qatar_mobile(body.phone)
    except ValueError:
        phone = None
    customer = db.scalar(select(Customer).where(Customer.phone == phone)) if phone else None
    hash_ = customer.password_hash if customer is not None and customer.is_registered else None
    # verify_password checks a dummy hash when there's no account, so timing doesn't reveal which numbers are registered.
    if not verify_password(body.password, hash_):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)
    if password_needs_rehash(hash_):
        customer.password_hash = hash_password(body.password)
    customer.last_login_at = now()
    db.commit()
    return new_session(customer)


@router.get("/me", response_model=ProfileOut)
def me(customer: CurrentCustomer) -> ProfileOut:
    return profile(customer)


@router.patch("/me", response_model=ProfileOut)
def update_me(body: ProfileUpdate, customer: CurrentCustomer, db: DbSession) -> ProfileOut:
    customer.full_name = body.full_name
    customer.email = body.email
    address = body.default_address.model_dump(exclude_none=True) if body.default_address else None
    customer.default_address = address or None
    db.commit()
    return profile(customer)


@router.post("/change-password", response_model=SessionOut)
def change_password(body: ChangePasswordIn, customer: CurrentCustomer, db: DbSession) -> SessionOut:
    if not verify_password(body.current_password, customer.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    customer.password_hash = hash_password(body.new_password)
    customer.must_change_password = False
    customer.token_version += 1  # sign out other devices
    db.commit()
    return new_session(customer)


@router.get("/orders", response_model=list[AccountOrderOut])
def my_orders(customer: CurrentCustomer, db: DbSession) -> list[AccountOrderOut]:
    return account_orders(db, customer)
