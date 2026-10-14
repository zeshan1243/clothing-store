from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import CouponType
from app.models.mixins import ZERO, CreatedAtMixin, Money, TimestampMixin, enum_column


class Coupon(TimestampMixin, Base):
    """A discount code. Validation and the discount itself are always computed on the server."""

    __tablename__ = "coupons"
    __table_args__ = (
        CheckConstraint("value >= 0", name="value_non_negative"),
        CheckConstraint("discount_type <> 'PERCENT' OR value <= 100", name="percent_max_100"),
        CheckConstraint("min_subtotal IS NULL OR min_subtotal >= 0", name="min_subtotal_non_negative"),
        CheckConstraint("max_discount IS NULL OR max_discount > 0", name="max_discount_positive"),
        CheckConstraint("usage_limit IS NULL OR usage_limit > 0", name="usage_limit_positive"),
        CheckConstraint("per_customer_limit IS NULL OR per_customer_limit > 0", name="per_customer_limit_positive"),
        CheckConstraint("times_used >= 0", name="times_used_non_negative"),
        CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at", name="valid_window"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Stored upper-case; customers can type it in any case.
    code: Mapped[str] = mapped_column(String(32), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[CouponType] = mapped_column(enum_column(CouponType, "discount_type"))
    # PERCENT: 0–100; FIXED: QAR amount; FREE_DELIVERY: ignored.
    value: Mapped[Decimal] = mapped_column(Money, default=ZERO, server_default="0")
    min_subtotal: Mapped[Decimal | None] = mapped_column(Money)
    # Cap for percentage coupons.
    max_discount: Mapped[Decimal | None] = mapped_column(Money)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    per_customer_limit: Mapped[int | None] = mapped_column(Integer)
    # Live redemptions (cancelled orders give their use back). Updated under a row lock.
    times_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))

    redemptions: Mapped[list["CouponRedemption"]] = relationship(back_populates="coupon")


class CouponRedemption(CreatedAtMixin, Base):
    """One use of a coupon by an order. Voided (not deleted) when the order is cancelled."""

    __tablename__ = "coupon_redemptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    # Value given: the order discount, or the waived delivery fee for FREE_DELIVERY coupons.
    discount_amount: Mapped[Decimal] = mapped_column(Money)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    coupon: Mapped[Coupon] = relationship(back_populates="redemptions")
