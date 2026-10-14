"""Customer (user) management: registered accounts and guest customers."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, StringConstraints, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentAdmin, DbSession
from app.core.security import hash_password
from app.models import Customer, Order
from app.models.enums import OrderStatus, PaymentStatus
from app.schemas.account import AddressIn
from app.schemas.orders import QatarMobile
from app.services.accounts import now, remove_login, temporary_password
from app.services.audit import record_audit

router = APIRouter(prefix="/customers", tags=["admin-customers"])


class CustomerListItem(BaseModel):
    id: int
    full_name: str
    phone: str
    email: str | None
    registered: bool
    registered_at: datetime | None
    phone_verified: bool
    order_count: int
    total_ordered: Decimal
    last_order_at: datetime | None
    created_at: datetime


class CustomerPage(BaseModel):
    items: list[CustomerListItem]
    total: int
    page: int
    page_size: int


class CustomerOrder(BaseModel):
    id: int
    order_number: str
    created_at: datetime
    order_status: OrderStatus
    payment_status: PaymentStatus
    grand_total: Decimal
    placed_signed_in: bool


class CustomerDetail(CustomerListItem):
    default_address: AddressIn | None
    last_login_at: datetime | None
    must_change_password: bool
    orders: list[CustomerOrder]


class CustomerUpdate(BaseModel):
    full_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]
    phone: QatarMobile
    email: EmailStr | None = None
    phone_verified: bool = False

    _blank_email = field_validator("email", mode="before")(lambda v: v or None)


class TemporaryPassword(BaseModel):
    temporary_password: str


def _stats():
    """Per-customer order count, total (excluding cancelled) and last order date."""
    return (
        select(
            Order.customer_id,
            func.count(Order.id).label("order_count"),
            func.coalesce(
                func.sum(Order.grand_total).filter(Order.order_status != OrderStatus.CANCELLED), 0
            ).label("total_ordered"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .group_by(Order.customer_id)
        .subquery()
    )


def _item(c: Customer, order_count: int | None, total: Decimal | None, last: datetime | None) -> dict:
    return {
        "id": c.id,
        "full_name": c.full_name,
        "phone": c.phone,
        "email": c.email,
        "registered": c.is_registered,
        "registered_at": c.registered_at,
        "phone_verified": c.phone_verified_at is not None,
        "order_count": order_count or 0,
        "total_ordered": total or Decimal("0.00"),
        "last_order_at": last,
        "created_at": c.created_at,
    }


def _get(db, customer_id: int) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return customer


def _detail(db, customer: Customer) -> CustomerDetail:
    stats = _stats()
    row = db.execute(select(stats).where(stats.c.customer_id == customer.id)).first()
    orders = db.scalars(select(Order).where(Order.customer_id == customer.id).order_by(Order.created_at.desc())).all()
    return CustomerDetail(
        **_item(customer, row.order_count if row else 0, row.total_ordered if row else None, row.last_order_at if row else None),
        default_address=AddressIn.model_validate(customer.default_address) if customer.default_address else None,
        last_login_at=customer.last_login_at,
        must_change_password=customer.must_change_password,
        orders=[
            CustomerOrder(
                id=o.id, order_number=o.order_number, created_at=o.created_at, order_status=o.order_status,
                payment_status=o.payment_status, grand_total=o.grand_total, placed_signed_in=o.placed_signed_in,
            )
            for o in orders
        ],
    )


@router.get("", response_model=CustomerPage)
def list_customers(
    db: DbSession,
    _: CurrentAdmin,
    q: Annotated[str | None, Query(max_length=100)] = None,
    kind: Literal["registered", "guests", "all"] = "registered",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> CustomerPage:
    stats = _stats()
    query = select(Customer, stats.c.order_count, stats.c.total_ordered, stats.c.last_order_at).outerjoin(
        stats, stats.c.customer_id == Customer.id
    )
    registered = Customer.registered_at.is_not(None) & Customer.password_hash.is_not(None)
    if kind == "registered":
        query = query.where(registered)
    elif kind == "guests":
        query = query.where(~registered)
    if q and q.strip():
        term = q.strip()
        digits = "".join(ch for ch in term if ch.isdigit())
        conditions = [Customer.full_name.ilike(f"%{term}%"), Customer.email.ilike(f"%{term}%")]
        if digits:
            conditions.append(Customer.phone.like(f"%{digits}%"))
        query = query.where(or_(*conditions))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(func.coalesce(Customer.registered_at, Customer.created_at).desc(), Customer.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return CustomerPage(
        items=[CustomerListItem(**_item(c, n, t, last)) for c, n, t, last in rows], total=total, page=page, page_size=page_size
    )


@router.get("/{customer_id}", response_model=CustomerDetail)
def get_customer(customer_id: int, db: DbSession, _: CurrentAdmin) -> CustomerDetail:
    return _detail(db, _get(db, customer_id))


@router.patch("/{customer_id}", response_model=CustomerDetail)
def update_customer(customer_id: int, body: CustomerUpdate, db: DbSession, admin: CurrentAdmin) -> CustomerDetail:
    customer = _get(db, customer_id)
    before = {"full_name": customer.full_name, "phone": customer.phone, "email": customer.email,
              "phone_verified": customer.phone_verified_at is not None}
    customer.full_name = body.full_name
    customer.email = body.email
    if body.phone != customer.phone:
        customer.phone = body.phone
        # A new number hasn't been confirmed yet.
        customer.phone_verified_at = None
    if body.phone_verified and customer.phone_verified_at is None and body.phone == before["phone"]:
        customer.phone_verified_at = now()
    elif not body.phone_verified:
        customer.phone_verified_at = None
    record_audit(db, admin, "customer.update", "customer", customer.id,
                 {"before": before, "after": body.model_dump(mode="json")})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Another customer already uses this phone number.") from exc
    return _detail(db, customer)


@router.post("/{customer_id}/reset-password", response_model=TemporaryPassword)
def reset_password(customer_id: int, db: DbSession, admin: CurrentAdmin) -> TemporaryPassword:
    customer = _get(db, customer_id)
    if not customer.is_registered:
        raise HTTPException(status.HTTP_409_CONFLICT, "This customer doesn't have an account.")
    password = temporary_password()
    customer.password_hash = hash_password(password)
    customer.must_change_password = True
    customer.token_version += 1  # sign out everywhere
    # Never log the password itself.
    record_audit(db, admin, "customer.reset_password", "customer", customer.id, {"phone": customer.phone})
    db.commit()
    return TemporaryPassword(temporary_password=password)


@router.delete("/{customer_id}/account", response_model=CustomerDetail)
def delete_account(customer_id: int, db: DbSession, admin: CurrentAdmin) -> CustomerDetail:
    """Remove the login (password, saved address, verification). Orders are kept for the records."""
    customer = _get(db, customer_id)
    if not customer.is_registered:
        raise HTTPException(status.HTTP_409_CONFLICT, "This customer doesn't have an account.")
    remove_login(customer)
    record_audit(db, admin, "customer.delete_account", "customer", customer.id, {"phone": customer.phone})
    db.commit()
    return _detail(db, customer)
