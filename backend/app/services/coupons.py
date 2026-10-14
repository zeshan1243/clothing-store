"""Coupon validation and discount calculation (always server-side).

Rules: active, inside its start/end window, cart subtotal ≥ min_subtotal, total uses below
usage_limit, and (at order time, once the customer is known) the customer's uses below
per_customer_limit. Discounts apply to the item subtotal only; FREE_DELIVERY waives the delivery fee.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Coupon, CouponRedemption, Order
from app.models.enums import CouponType
from app.models.mixins import ZERO

CENT = Decimal("0.01")


def normalise_code(code: str) -> str:
    return code.strip().upper()


@dataclass
class CouponError(Exception):
    """Why a coupon can't be used. `code` is stable for the storefront to translate."""

    code: str  # not_found | inactive | not_started | expired | min_subtotal | usage_limit | customer_limit
    min_subtotal: Decimal | None = None


@dataclass
class CouponResult:
    coupon: Coupon
    discount: Decimal  # off the item subtotal
    delivery_fee: Decimal  # after a FREE_DELIVERY waiver

    @property
    def value_given(self) -> Decimal:
        """Total benefit to the customer (discount, or the waived delivery fee)."""
        return self.discount if self.coupon.discount_type != CouponType.FREE_DELIVERY else self.waived

    waived: Decimal = ZERO


def find_coupon(db: Session, code: str, lock: bool = False) -> Coupon:
    query = select(Coupon).where(Coupon.code == normalise_code(code))
    if lock:
        query = query.with_for_update()
    coupon = db.scalar(query)
    if coupon is None:
        raise CouponError("not_found")
    return coupon


def evaluate(coupon: Coupon, subtotal: Decimal, delivery_fee: Decimal, now: datetime | None = None) -> CouponResult:
    """Check the coupon's own rules against a cart and compute the discount."""
    now = now or datetime.now(UTC)
    if not coupon.is_active:
        raise CouponError("inactive")
    if coupon.starts_at and now < coupon.starts_at:
        raise CouponError("not_started")
    if coupon.ends_at and now >= coupon.ends_at:
        raise CouponError("expired")
    if coupon.usage_limit is not None and coupon.times_used >= coupon.usage_limit:
        raise CouponError("usage_limit")
    if coupon.min_subtotal is not None and subtotal < coupon.min_subtotal:
        raise CouponError("min_subtotal", min_subtotal=coupon.min_subtotal)

    if coupon.discount_type == CouponType.FREE_DELIVERY:
        return CouponResult(coupon, discount=ZERO, delivery_fee=ZERO, waived=delivery_fee)

    if coupon.discount_type == CouponType.PERCENT:
        discount = (subtotal * coupon.value / Decimal(100)).quantize(CENT, ROUND_HALF_UP)
        if coupon.max_discount is not None:
            discount = min(discount, coupon.max_discount)
    else:  # FIXED
        discount = coupon.value
    # Never discount more than the items cost.
    discount = min(discount, subtotal).quantize(CENT)
    return CouponResult(coupon, discount=discount, delivery_fee=delivery_fee)


def customer_uses(db: Session, coupon: Coupon, customer_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(CouponRedemption)
            .where(
                CouponRedemption.coupon_id == coupon.id,
                CouponRedemption.customer_id == customer_id,
                CouponRedemption.voided_at.is_(None),
            )
        )
        or 0
    )


def redeem(db: Session, result: CouponResult, order: Order) -> None:
    """Record the use. Caller holds the coupon row lock (see place_order)."""
    db.add(
        CouponRedemption(
            coupon_id=result.coupon.id,
            order_id=order.id,
            customer_id=order.customer_id,
            discount_amount=result.value_given,
        )
    )
    result.coupon.times_used += 1


def release(db: Session, order: Order) -> None:
    """Give a cancelled order's coupon use back."""
    redemption = db.scalar(
        select(CouponRedemption).where(CouponRedemption.order_id == order.id, CouponRedemption.voided_at.is_(None))
    )
    if redemption is None:
        return
    coupon = db.scalar(select(Coupon).where(Coupon.id == redemption.coupon_id).with_for_update())
    redemption.voided_at = datetime.now(UTC)
    if coupon is not None and coupon.times_used > 0:
        coupon.times_used -= 1
