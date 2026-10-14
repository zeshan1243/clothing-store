import re
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentAdmin, DbSession
from app.models import Admin, Order
from app.models.enums import OrderStatus, PaymentStatus
from app.schemas.admin_orders import (
    AdminOrderDetail,
    AdminOrderItem,
    AdminRef,
    AssignIn,
    CancelIn,
    ConfirmIn,
    NotesIn,
    OrderListItem,
    OrderListPage,
    PaymentIn,
    PaymentOut,
    StatusChangeIn,
    StatusHistoryOut,
)
from app.services.audit import record_audit
from app.services.order_operations import (
    TRANSITIONS,
    assign,
    balance_due,
    change_status,
    lock_order,
    payment_totals,
    record_payment,
)
from app.services.reporting import qatar_day_range

router = APIRouter(tags=["admin-orders"])


def _admin_names(db: Session) -> dict[int, str]:
    return dict(db.execute(select(Admin.id, Admin.name)).all())


def _ref(names: dict[int, str], admin_id: int | None) -> AdminRef | None:
    if admin_id is None:
        return None
    return AdminRef(id=admin_id, name=names.get(admin_id, f"Admin #{admin_id}"))


def _detail(db: Session, order_id: int) -> AdminOrderDetail:
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.payments), selectinload(Order.status_history))
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    names = _admin_names(db)
    collected, refunded = payment_totals(order)
    customer_orders = db.scalar(select(func.count()).where(Order.customer_id == order.customer_id)) or 0
    return AdminOrderDetail(
        id=order.id,
        order_number=order.order_number,
        public_token=order.public_token,
        created_at=order.created_at,
        updated_at=order.updated_at,
        customer_id=order.customer_id,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        customer_email=order.customer_email,
        delivery_area=order.delivery_area,
        delivery_distance_km=order.delivery_distance_km,
        delivery_zone=order.delivery_zone,
        delivery_street=order.delivery_street,
        delivery_building=order.delivery_building,
        delivery_unit=order.delivery_unit,
        delivery_landmark=order.delivery_landmark,
        delivery_instructions=order.delivery_instructions,
        customer_notes=order.customer_notes,
        internal_notes=order.internal_notes,
        items=[AdminOrderItem.model_validate(i) for i in order.items],
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        discount_amount=order.discount_amount,
        coupon_code=order.coupon_code,
        tax_amount=order.tax_amount,
        grand_total=order.grand_total,
        currency=order.currency,
        payment_method=order.payment_method.value,
        payment_status=order.payment_status,
        order_status=order.order_status,
        amount_collected=collected,
        amount_refunded=refunded,
        balance_due=balance_due(order),
        assigned_admin=_ref(names, order.assigned_admin_id),
        cancellation_reason=order.cancellation_reason,
        delivery_failure_reason=order.delivery_failure_reason,
        confirmed_at=order.confirmed_at,
        delivered_at=order.delivered_at,
        cancelled_at=order.cancelled_at,
        payments=[
            PaymentOut(
                id=p.id,
                type=p.type,
                amount=p.amount,
                currency=p.currency,
                method=p.method,
                collected_at=p.collected_at,
                reference=p.reference,
                notes=p.notes,
                recorded_by=_ref(names, p.recorded_by_admin_id),
                created_at=p.created_at,
            )
            for p in order.payments
        ],
        history=[
            StatusHistoryOut(
                id=h.id,
                old_status=h.old_status,
                new_status=h.new_status,
                note=h.note,
                changed_by=_ref(names, h.changed_by_admin_id),
                created_at=h.created_at,
            )
            for h in order.status_history
        ],
        allowed_transitions=sorted(TRANSITIONS[order.order_status], key=list(OrderStatus).index),
        customer_order_count=customer_orders,
    )


@router.get("/admins", response_model=list[AdminRef])
def list_admins(db: DbSession, _: CurrentAdmin) -> list[AdminRef]:
    """Active admins, for the 'assign to founder' dropdown."""
    rows = db.execute(select(Admin.id, Admin.name).where(Admin.is_active.is_(True)).order_by(Admin.name)).all()
    return [AdminRef(id=i, name=n) for i, n in rows]


@router.get("/orders", response_model=OrderListPage)
def list_orders(
    db: DbSession,
    _: CurrentAdmin,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[list[OrderStatus] | None, Query(alias="status")] = None,
    payment_status: PaymentStatus | None = None,
    assigned_admin_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> OrderListPage:
    query = select(Order)
    if q and q.strip():
        term = q.strip()
        conditions = [Order.order_number.ilike(f"%{term}%"), Order.customer_name.ilike(f"%{term}%")]
        digits = re.sub(r"\D", "", term)
        if len(digits) >= 3:
            conditions.append(Order.customer_phone.like(f"%{digits}%"))
        query = query.where(or_(*conditions))
    if status_filter:
        query = query.where(Order.order_status.in_(status_filter))
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    if assigned_admin_id:
        query = query.where(Order.assigned_admin_id == assigned_admin_id)
    if date_from or date_to:
        start, end = qatar_day_range(date_from, date_to)
        if date_from:
            query = query.where(Order.created_at >= start)
        if date_to:
            query = query.where(Order.created_at < end)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    orders = db.scalars(
        query.options(selectinload(Order.items), selectinload(Order.payments))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    names = _admin_names(db)

    items = []
    for o in orders:
        collected, refunded = payment_totals(o)
        items.append(
            OrderListItem(
                id=o.id,
                order_number=o.order_number,
                created_at=o.created_at,
                customer_name=o.customer_name,
                customer_phone=o.customer_phone,
                delivery_area=o.delivery_area,
                item_count=sum(i.quantity for i in o.items),
                grand_total=o.grand_total,
                amount_paid=collected - refunded,
                order_status=o.order_status,
                payment_status=o.payment_status,
                assigned_admin=_ref(names, o.assigned_admin_id),
            )
        )
    return OrderListPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
def get_order(order_id: int, db: DbSession, _: CurrentAdmin) -> AdminOrderDetail:
    return _detail(db, order_id)


@router.post("/orders/{order_id}/confirm", response_model=AdminOrderDetail)
def confirm_order(order_id: int, body: ConfirmIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    change_status(db, order, OrderStatus.CONFIRMED, admin, note=body.note or "Confirmed with customer")
    db.commit()
    return _detail(db, order_id)


@router.patch("/orders/{order_id}/status", response_model=AdminOrderDetail)
def update_status(order_id: int, body: StatusChangeIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    change_status(db, order, body.status, admin, note=body.note, reason=body.reason, collect_cash=body.collect_cash)
    db.commit()
    return _detail(db, order_id)


@router.post("/orders/{order_id}/cancel", response_model=AdminOrderDetail)
def cancel_order(order_id: int, body: CancelIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    change_status(db, order, OrderStatus.CANCELLED, admin, reason=body.reason)
    db.commit()
    return _detail(db, order_id)


@router.post("/orders/{order_id}/assign", response_model=AdminOrderDetail)
def assign_order(order_id: int, body: AssignIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    assignee = None
    if body.admin_id is not None:
        assignee = db.get(Admin, body.admin_id)
        if assignee is None or not assignee.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Admin not found or inactive")
    assign(db, order, assignee, admin)
    db.commit()
    return _detail(db, order_id)


@router.patch("/orders/{order_id}/notes", response_model=AdminOrderDetail)
def update_notes(order_id: int, body: NotesIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    order.internal_notes = body.internal_notes or None
    record_audit(db, admin, "order.notes", "order", order.id)
    db.commit()
    return _detail(db, order_id)


@router.post("/orders/{order_id}/payments", response_model=AdminOrderDetail, status_code=status.HTTP_201_CREATED)
def add_payment(order_id: int, body: PaymentIn, db: DbSession, admin: CurrentAdmin) -> AdminOrderDetail:
    order = lock_order(db, order_id)
    record_payment(db, order, admin, body.type, body.amount, body.collected_at, body.reference, body.notes)
    db.commit()
    return _detail(db, order_id)
