"""Customer accounts: optional, phone + password. Guests keep checking out without one."""

import secrets
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import create_customer_token
from app.models import Customer, Order
from app.schemas.account import AccountOrderOut, AddressIn, ProfileOut, SessionOut

# No look-alike characters (0/O, 1/l/I) so a temporary password can be read out over WhatsApp.
_TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def profile(customer: Customer) -> ProfileOut:
    return ProfileOut(
        id=customer.id,
        full_name=customer.full_name,
        phone=customer.phone,
        email=customer.email,
        default_address=AddressIn.model_validate(customer.default_address) if customer.default_address else None,
        phone_verified=customer.phone_verified_at is not None,
        must_change_password=customer.must_change_password,
        registered_at=customer.registered_at,
    )


def new_session(customer: Customer) -> SessionOut:
    token, expires_at = create_customer_token(customer.id, customer.token_version)
    return SessionOut(token=token, expires_at=expires_at, customer=profile(customer))


def temporary_password() -> str:
    return "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(10))


def visible_orders_query(customer: Customer):
    """Orders an account holder can see: those placed while signed in, plus their earlier guest
    orders once an admin has verified the phone number belongs to them."""
    query = select(Order).where(Order.customer_id == customer.id)
    if customer.phone_verified_at is None:
        query = query.where(Order.placed_signed_in.is_(True))
    return query


def account_orders(db: Session, customer: Customer) -> list[AccountOrderOut]:
    orders = db.scalars(
        visible_orders_query(customer).options(selectinload(Order.items)).order_by(Order.created_at.desc())
    ).all()
    return [
        AccountOrderOut(
            order_number=o.order_number,
            public_token=o.public_token,
            created_at=o.created_at,
            order_status=o.order_status,
            payment_status=o.payment_status,
            grand_total=o.grand_total,
            currency=o.currency,
            item_count=sum(i.quantity for i in o.items),
            item_names=[i.product_name for i in o.items][:3],
            image_url=next((i.image_url for i in o.items if i.image_url), None),
        )
        for o in orders
    ]


def remove_login(customer: Customer) -> None:
    """Delete the account part of a customer (orders and the contact snapshot stay for the records)."""
    customer.password_hash = None
    customer.registered_at = None
    customer.phone_verified_at = None
    customer.must_change_password = False
    customer.default_address = None
    customer.last_login_at = None
    customer.token_version += 1


def now() -> datetime:
    return datetime.now(UTC)



