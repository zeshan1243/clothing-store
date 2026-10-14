"""Admin order workflow: status transitions, stock effects, payments and assignment.

Inventory effects (see README "Inventory policy"):
- order placed            -> stock reserved (done at checkout)
- CANCELLED               -> reserved stock released
- DELIVERED               -> reserved stock converted to sold (on-hand stock decreases)
Order status and payment status are independent: delivering does not mark an order paid.
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Admin, Order, OrderStatusHistory, Payment, StockMovement
from app.models.enums import OrderStatus as S
from app.models.enums import PaymentStatus, PaymentType, StockMovementType
from app.models.mixins import ZERO
from app.services.audit import record_audit
from app.services.coupons import release as release_coupon
from app.services.inventory import lock_variant
from app.services.invoices import active_invoice, issue_credit_note, issue_invoice

TRANSITIONS: dict[S, set[S]] = {
    S.PLACED: {S.CONFIRMED, S.CANCELLED},
    S.CONFIRMED: {S.PREPARING, S.OUT_FOR_DELIVERY, S.CANCELLED},
    S.PREPARING: {S.OUT_FOR_DELIVERY, S.CANCELLED},
    S.OUT_FOR_DELIVERY: {S.DELIVERED, S.DELIVERY_FAILED},
    S.DELIVERY_FAILED: {S.OUT_FOR_DELIVERY, S.CANCELLED},
    S.DELIVERED: {S.RETURN_REQUESTED},
    S.RETURN_REQUESTED: {S.DELIVERED},
    S.CANCELLED: set(),
}

# Cash can only be collected once the parcel is with the customer (or on its way).
COLLECTABLE = {S.OUT_FOR_DELIVERY, S.DELIVERED, S.RETURN_REQUESTED}


def lock_order(db: Session, order_id: int) -> Order:
    order = db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .with_for_update(of=Order)
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def payment_totals(order: Order) -> tuple[Decimal, Decimal]:
    collected = sum((p.amount for p in order.payments if p.type == PaymentType.COD_COLLECTION), ZERO)
    refunded = sum((p.amount for p in order.payments if p.type == PaymentType.REFUND), ZERO)
    return collected, refunded


def derive_payment_status(order: Order) -> PaymentStatus:
    collected, refunded = payment_totals(order)
    net = collected - refunded
    if refunded > 0 and net <= 0:
        return PaymentStatus.REFUNDED
    if refunded > 0:
        return PaymentStatus.PARTIALLY_REFUNDED
    if net >= order.grand_total:
        return PaymentStatus.PAID
    return PaymentStatus.PENDING


def balance_due(order: Order) -> Decimal:
    if order.order_status == S.CANCELLED:
        return ZERO
    collected, refunded = payment_totals(order)
    return max(order.grand_total - (collected - refunded), ZERO)


def _history(db: Session, order: Order, old: S | None, new: S, admin: Admin, note: str | None) -> None:
    db.add(
        OrderStatusHistory(order_id=order.id, old_status=old, new_status=new, changed_by_admin_id=admin.id, note=note)
    )


def _move_stock(db: Session, order: Order, admin: Admin, kind: StockMovementType) -> None:
    """RELEASED: give reserved units back. SOLD: reserved units leave on-hand stock."""
    for item in sorted(order.items, key=lambda i: i.product_variant_id or 0):
        if item.product_variant_id is None:
            continue
        variant = lock_variant(db, item.product_variant_id)
        if variant.reserved_quantity < item.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Stock records for {item.sku} are inconsistent (reserved {variant.reserved_quantity}, "
                f"order needs {item.quantity}). Check the inventory history.",
            )
        variant.reserved_quantity -= item.quantity
        if kind == StockMovementType.SOLD:
            variant.stock_quantity -= item.quantity
            change = -item.quantity
        else:
            change = -item.quantity  # reduction of the reservation
        db.add(
            StockMovement(
                product_variant_id=variant.id,
                movement_type=kind,
                quantity_change=change,
                related_order_id=order.id,
                reason=f"{kind.value.title()} for order {order.order_number}",
                created_by_admin_id=admin.id,
            )
        )


def record_payment(
    db: Session,
    order: Order,
    admin: Admin,
    type_: PaymentType,
    amount: Decimal,
    collected_at: datetime | None = None,
    reference: str | None = None,
    notes: str | None = None,
) -> Payment:
    collected, refunded = payment_totals(order)
    net = collected - refunded
    if type_ == PaymentType.COD_COLLECTION:
        if order.order_status not in COLLECTABLE:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Cash can only be recorded once the order is out for delivery or delivered.",
            )
        if net + amount > order.grand_total:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"That would collect more than the order total. Balance due is {order.currency} "
                f"{order.grand_total - net:.2f}.",
            )
    elif type_ == PaymentType.REFUND:
        if amount > net:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Refund exceeds the cash collected ({order.currency} {net:.2f}).",
            )
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unsupported payment type")

    payment = Payment(
        order_id=order.id,
        type=type_,
        amount=amount,
        currency=order.currency,
        method="CASH",
        collected_at=collected_at or datetime.now(UTC),
        recorded_by_admin_id=admin.id,
        reference=reference,
        notes=notes,
    )
    order.payments.append(payment)
    old_status = order.payment_status
    order.payment_status = derive_payment_status(order)
    db.flush()
    record_audit(
        db,
        admin,
        "order.payment_" + ("collect" if type_ == PaymentType.COD_COLLECTION else "refund"),
        "order",
        order.id,
        {"amount": str(amount), "payment_status": f"{old_status.value} -> {order.payment_status.value}"},
    )
    return payment


def change_status(
    db: Session,
    order: Order,
    new: S,
    admin: Admin,
    note: str | None = None,
    reason: str | None = None,
    collect_cash: bool = False,
) -> None:
    old = order.order_status
    if new == old:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is already {old.value}")
    if new not in TRANSITIONS[old]:
        allowed = ", ".join(sorted(s.value for s in TRANSITIONS[old])) or "none"
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Cannot change status from {old.value} to {new.value}. Allowed: {allowed}."
        )
    if new in (S.CANCELLED, S.DELIVERY_FAILED) and not (reason and len(reason.strip()) >= 3):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A reason is required for this status.")

    now = datetime.now(UTC)
    if new == S.CONFIRMED:
        order.confirmed_at = now
    elif new == S.CANCELLED:
        invoice = active_invoice(db, order.id)
        if invoice is not None:
            issue_credit_note(db, invoice, admin, f"Order cancelled: {reason}")
        collected, refunded = payment_totals(order)
        if collected - refunded > 0:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Refund the collected cash before cancelling this order."
            )
        _move_stock(db, order, admin, StockMovementType.RELEASED)
        release_coupon(db, order)
        order.cancelled_at = now
        order.cancellation_reason = reason
    elif new == S.DELIVERY_FAILED:
        order.delivery_failure_reason = reason
    elif new == S.DELIVERED and old == S.OUT_FOR_DELIVERY:
        _move_stock(db, order, admin, StockMovementType.SOLD)
        order.delivered_at = now

    order.order_status = new
    if new == S.CONFIRMED:
        # Invoice is issued at confirmation so it can be printed when packing.
        issue_invoice(db, order, admin)
    _history(db, order, old, new, admin, reason or note)
    record_audit(db, admin, "order.status", "order", order.id, {"from": old.value, "to": new.value, "reason": reason})

    if new == S.DELIVERED and collect_cash:
        due = balance_due(order)
        if due > 0:
            record_payment(db, order, admin, PaymentType.COD_COLLECTION, due, collected_at=now,
                           notes="Collected on delivery")


def assign(db: Session, order: Order, assignee: Admin | None, admin: Admin) -> None:
    previous = order.assigned_admin_id
    order.assigned_admin_id = assignee.id if assignee else None
    record_audit(
        db, admin, "order.assign", "order", order.id,
        {"from": previous, "to": order.assigned_admin_id},
    )
