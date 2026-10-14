from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import (
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    PaymentType,
    StockMovementType,
)
from app.models.mixins import ZERO, CreatedAtMixin, Money, TimestampMixin, enum_column


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    # Normalised E.164 (e.g. +97455551234); guest checkouts with the same phone reuse the record.
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    email: Mapped[str | None] = mapped_column(String(254))

    # Optional account (customers can always check out as guests). A customer with a password has
    # registered; logging in is by phone + password.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set by an admin after confirming the number belongs to this person; only then do guest
    # orders placed before registering appear in the account.
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # After an admin reset, the customer must choose a new password.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Bumped on password change/reset/account deletion so existing sessions stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Saved delivery address used to prefill checkout ({area, zone, street, building, unit, landmark, instructions}).
    default_address: Mapped[dict | None] = mapped_column(JSONB)

    orders: Mapped[list["Order"]] = relationship(back_populates="customer")

    @property
    def is_registered(self) -> bool:
        return self.registered_at is not None and self.password_hash is not None


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("delivery_fee >= 0", name="delivery_fee_non_negative"),
        CheckConstraint("discount_amount >= 0", name="discount_non_negative"),
        CheckConstraint("tax_amount >= 0", name="tax_non_negative"),
        CheckConstraint("grand_total >= 0", name="grand_total_non_negative"),
        Index("ix_orders_created_at_desc", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(32), unique=True)
    # Unguessable token for the customer's confirmation page; never expose sequential IDs publicly.
    public_token: Mapped[str] = mapped_column(String(64), unique=True)
    # Client-supplied key so a double-submitted checkout returns the same order.
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True)
    # Placed while signed in to the customer's account (always shown in their order history).
    placed_signed_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)

    # Customer and delivery snapshot, so historical orders stay stable.
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_phone: Mapped[str] = mapped_column(String(20), index=True)
    customer_email: Mapped[str | None] = mapped_column(String(254))
    delivery_area: Mapped[str] = mapped_column(String(120))
    delivery_zone: Mapped[str | None] = mapped_column(String(20))
    delivery_street: Mapped[str | None] = mapped_column(String(120))
    delivery_building: Mapped[str | None] = mapped_column(String(60))
    delivery_unit: Mapped[str | None] = mapped_column(String(60))
    delivery_landmark: Mapped[str | None] = mapped_column(String(255))
    delivery_instructions: Mapped[str | None] = mapped_column(Text)
    # Distance used for the delivery fee (snapshot; areas can be edited later).
    delivery_distance_km: Mapped[int | None] = mapped_column(Integer)

    subtotal: Mapped[Decimal] = mapped_column(Money)
    delivery_fee: Mapped[Decimal] = mapped_column(Money, default=ZERO)
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=ZERO, server_default="0")
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=ZERO, server_default="0")
    grand_total: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="QAR", server_default="QAR")

    payment_method: Mapped[PaymentMethod] = mapped_column(
        enum_column(PaymentMethod, "payment_method"), default=PaymentMethod.COD
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        enum_column(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING, index=True
    )
    order_status: Mapped[OrderStatus] = mapped_column(
        enum_column(OrderStatus, "order_status"), default=OrderStatus.PLACED, index=True
    )

    assigned_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
    # Coupon applied at checkout (code snapshotted so history survives coupon edits).
    coupon_id: Mapped[int | None] = mapped_column(ForeignKey("coupons.id"))
    coupon_code: Mapped[str | None] = mapped_column(String(32))
    customer_notes: Mapped[str | None] = mapped_column(Text)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    delivery_failure_reason: Mapped[str | None] = mapped_column(Text)

    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", order_by="OrderItem.id", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", order_by="Payment.id")
    status_history: Mapped[list["OrderStatusHistory"]] = relationship(
        back_populates="order", order_by="OrderStatusHistory.id"
    )


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    # Nullable so historical lines survive if a variant is ever removed.
    product_variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))

    # Snapshot at time of purchase.
    product_name: Mapped[str] = mapped_column(String(160))
    product_name_ar: Mapped[str | None] = mapped_column(String(160))
    sku: Mapped[str] = mapped_column(String(64))
    colour: Mapped[str] = mapped_column(String(60))
    size: Mapped[str] = mapped_column(String(20))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    unit_price: Mapped[Decimal] = mapped_column(Money)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Money)

    order: Mapped[Order] = relationship(back_populates="items")


class Payment(CreatedAtMixin, Base):
    """Cash collections, refunds and adjustments, recorded separately from order status."""

    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    type: Mapped[PaymentType] = mapped_column(enum_column(PaymentType, "type"))
    # Always positive; `type` determines direction (REFUND reduces collected cash).
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="QAR", server_default="QAR")
    method: Mapped[str] = mapped_column(String(32), default="CASH", server_default="CASH")
    collected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
    reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="payments")


class OrderStatusHistory(CreatedAtMixin, Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    old_status: Mapped[OrderStatus | None] = mapped_column(enum_column(OrderStatus, "old_status"))
    new_status: Mapped[OrderStatus] = mapped_column(enum_column(OrderStatus, "new_status"))
    changed_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
    note: Mapped[str | None] = mapped_column(Text)

    order: Mapped[Order] = relationship(back_populates="status_history")


class StockMovement(CreatedAtMixin, Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), index=True)
    movement_type: Mapped[StockMovementType] = mapped_column(enum_column(StockMovementType, "movement_type"))
    # Change to on-hand stock (RECEIVED/SOLD/ADJUSTMENT/RETURN) or to reserved stock (RESERVED/RELEASED).
    quantity_change: Mapped[int] = mapped_column(Integer)
    related_order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), index=True)
    related_supplier_bill_id: Mapped[int | None] = mapped_column(ForeignKey("supplier_bills.id"))
    reason: Mapped[str | None] = mapped_column(Text)
    created_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
