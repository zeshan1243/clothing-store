"""Supplier payables. Kept entirely separate from customer sales and COD collections.

Bills keep their original currency (e.g. PKR). A payment may optionally record its QAR equivalent;
no FX gains/losses are calculated in the MVP.
"""

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Admin, ProductVariant, SupplierBill, SupplierBillItem, SupplierPayment
from app.models.enums import StockMovementType, SupplierBillStatus
from app.services.audit import record_audit
from app.services.inventory import adjust_stock
from app.services.numbering import QATAR_TZ

CENT = Decimal("0.01")


def bill_status(bill: SupplierBill) -> SupplierBillStatus:
    if bill.paid_amount <= 0:
        return SupplierBillStatus.UNPAID
    if bill.paid_amount >= bill.total_amount:
        return SupplierBillStatus.PAID
    return SupplierBillStatus.PARTIALLY_PAID


def is_overdue(bill: SupplierBill) -> bool:
    today = datetime.now(QATAR_TZ).date()
    return bool(bill.due_date and bill.due_date < today and bill.paid_amount < bill.total_amount)


def validate_items(db: Session, items) -> None:
    for item in items:
        if item.product_variant_id is not None and db.get(ProductVariant, item.product_variant_id) is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"Product variant {item.product_variant_id} not found"
            )


def receive_items(
    db: Session, bill: SupplierBill, lines: list[tuple[SupplierBillItem, int]], admin: Admin
) -> None:
    """Add received quantities to stock, linked to the bill. Can't exceed the quantity billed."""
    for item, quantity in lines:
        if item.product_variant_id is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"'{item.description}' isn't linked to a product variant, so it can't be added to stock.",
            )
        if item.quantity_received + quantity > item.quantity:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"'{item.description}': only {item.quantity - item.quantity_received} still to receive.",
            )
        adjust_stock(
            db,
            item.product_variant_id,
            quantity,
            StockMovementType.RECEIVED,
            f"Received from supplier bill {bill.supplier_reference or '#' + str(bill.id)}",
            admin,
            related_supplier_bill_id=bill.id,
        )
        item.quantity_received += quantity
    record_audit(
        db, admin, "supplier_bill.receive", "supplier_bill", bill.id,
        {"lines": [{"item": i.id, "qty": q} for i, q in lines]},
    )


def record_supplier_payment(db: Session, bill: SupplierBill, admin: Admin, data) -> SupplierPayment:
    outstanding = bill.total_amount - bill.paid_amount
    if data.amount > outstanding:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Payment exceeds the outstanding balance ({bill.currency} {outstanding:.2f}).",
        )

    rate, amount_qar = data.exchange_rate_to_qar, data.amount_qar
    if bill.currency == "QAR":
        rate, amount_qar = Decimal("1"), data.amount
    elif rate is not None and amount_qar is None:
        amount_qar = (data.amount * rate).quantize(CENT, ROUND_HALF_UP)
    elif amount_qar is not None and rate is None:
        rate = (amount_qar / data.amount).quantize(Decimal("0.00000001"), ROUND_HALF_UP)

    payment = SupplierPayment(
        supplier_bill_id=bill.id,
        amount=data.amount,
        currency=bill.currency,
        exchange_rate_to_qar=rate,
        amount_qar=amount_qar,
        paid_at=data.paid_at or datetime.now(UTC),
        payment_reference=data.payment_reference,
        notes=data.notes,
        recorded_by_admin_id=admin.id,
    )
    bill.payments.append(payment)
    bill.paid_amount += data.amount
    bill.status = bill_status(bill)
    db.flush()
    record_audit(
        db, admin, "supplier_bill.payment", "supplier_bill", bill.id,
        {"amount": f"{data.amount:.2f}", "currency": bill.currency, "amount_qar": str(amount_qar) if amount_qar else None},
    )
    return payment
