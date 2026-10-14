from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import SupplierBillStatus
from app.models.mixins import ZERO, CreatedAtMixin, Money, TimestampMixin, enum_column


class Supplier(TimestampMixin, Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(254))
    default_currency: Mapped[str] = mapped_column(String(3), default="PKR", server_default="PKR")
    payment_terms: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    bills: Mapped[list["SupplierBill"]] = relationship(back_populates="supplier")


class SupplierBill(TimestampMixin, Base):
    """A payable to a supplier, kept in the supplier's original currency."""

    __tablename__ = "supplier_bills"
    __table_args__ = (
        CheckConstraint("total_amount >= 0", name="total_non_negative"),
        CheckConstraint("paid_amount >= 0", name="paid_non_negative"),
        CheckConstraint("paid_amount <= total_amount", name="paid_within_total"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    supplier_reference: Mapped[str | None] = mapped_column(String(120))
    bill_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3))
    total_amount: Mapped[Decimal] = mapped_column(Money)
    # Denormalised sum of supplier_payments.amount, maintained in the same transaction.
    paid_amount: Mapped[Decimal] = mapped_column(Money, default=ZERO, server_default="0")
    status: Mapped[SupplierBillStatus] = mapped_column(
        enum_column(SupplierBillStatus, "status"), default=SupplierBillStatus.UNPAID, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))

    supplier: Mapped[Supplier] = relationship(back_populates="bills")
    items: Mapped[list["SupplierBillItem"]] = relationship(
        back_populates="bill", order_by="SupplierBillItem.id", cascade="all, delete-orphan"
    )
    payments: Mapped[list["SupplierPayment"]] = relationship(
        back_populates="bill", order_by="SupplierPayment.id"
    )

    @property
    def outstanding_amount(self) -> Decimal:
        return self.total_amount - self.paid_amount


class SupplierBillItem(Base):
    """Goods on a supplier bill; lines linked to a variant add stock when received."""

    __tablename__ = "supplier_bill_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("quantity_received >= 0", name="received_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_bill_id: Mapped[int] = mapped_column(
        ForeignKey("supplier_bills.id", ondelete="CASCADE"), index=True
    )
    product_variant_id: Mapped[int | None] = mapped_column(ForeignKey("product_variants.id"))
    description: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer)
    quantity_received: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    unit_cost: Mapped[Decimal | None] = mapped_column(Money)

    bill: Mapped[SupplierBill] = relationship(back_populates="items")


class SupplierPayment(CreatedAtMixin, Base):
    __tablename__ = "supplier_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_bill_id: Mapped[int] = mapped_column(ForeignKey("supplier_bills.id"), index=True)
    # In the bill's currency.
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3))
    # Optional QAR equivalent at the time of payment (no FX accounting in the MVP).
    exchange_rate_to_qar: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    amount_qar: Mapped[Decimal | None] = mapped_column(Money)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payment_reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))

    bill: Mapped[SupplierBill] = relationship(back_populates="payments")
