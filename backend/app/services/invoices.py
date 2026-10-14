"""Invoices and credit notes.

An issued invoice stores a JSON snapshot of everything printed on it, so the PDF can be regenerated
identically at any time and later edits to products, prices or the order never change it. Issued
documents are never edited: cancellations and returns are handled with credit notes that reference
the original invoice.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Admin, Invoice, Order
from app.models.enums import InvoiceStatus, InvoiceType, OrderStatus
from app.services.audit import record_audit
from app.services.numbering import QATAR_TZ, next_document_number

SNAPSHOT_VERSION = 1


def _money(value: Decimal) -> str:
    return f"{value:.2f}"


def _seller() -> dict:
    s = get_settings()
    return {
        "name": s.business_name,
        "address": s.business_address,
        "phone": s.business_phone,
        "email": s.business_email,
        "registration": s.business_registration,
    }


def _address_lines(order: Order) -> list[str]:
    parts = [
        ", ".join(
            p
            for p in (
                f"Zone {order.delivery_zone}" if order.delivery_zone else "",
                f"Street {order.delivery_street}" if order.delivery_street else "",
                f"Building {order.delivery_building}" if order.delivery_building else "",
            )
            if p
        ),
        f"Flat/villa {order.delivery_unit}" if order.delivery_unit else "",
        f"{order.delivery_area}, Qatar",
    ]
    return [p for p in parts if p]


def invoices_for_order(db: Session, order_id: int) -> list[Invoice]:
    return list(db.scalars(select(Invoice).where(Invoice.order_id == order_id).order_by(Invoice.id)))


def active_invoice(db: Session, order_id: int) -> Invoice | None:
    return db.scalar(
        select(Invoice).where(
            Invoice.order_id == order_id,
            Invoice.invoice_type == InvoiceType.INVOICE,
            Invoice.status == InvoiceStatus.ISSUED,
        )
    )


def credited_total(db: Session, invoice: Invoice) -> Decimal:
    """Sum of credit notes issued against an invoice (exact, from the stored decimal strings)."""
    notes = db.scalars(select(Invoice).where(Invoice.related_invoice_id == invoice.id)).all()
    return sum((Decimal(n.snapshot["total"]) for n in notes), Decimal("0.00"))


def issue_invoice(db: Session, order: Order, admin: Admin | None) -> Invoice:
    """Issue the order's invoice. Idempotent: returns the existing active invoice if there is one."""
    existing = active_invoice(db, order.id)
    if existing is not None:
        return existing
    if order.order_status == OrderStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancelled orders can't be invoiced")

    today = datetime.now(QATAR_TZ).date()
    number = next_document_number(db, "invoice", "INV")
    snapshot = {
        "type": InvoiceType.INVOICE.value,
        "number": number,
        "date": today.isoformat(),
        "order_number": order.order_number,
        "order_date": order.created_at.astimezone(QATAR_TZ).date().isoformat(),
        "seller": _seller(),
        "customer": {
            "name": order.customer_name,
            "phone": order.customer_phone,
            "email": order.customer_email,
            "address": _address_lines(order),
        },
        "lines": [
            {
                "description": item.product_name,
                "sku": item.sku,
                "colour": item.colour,
                "size": item.size,
                "quantity": item.quantity,
                "unit_price": _money(item.unit_price),
                "line_total": _money(item.line_total),
            }
            for item in order.items
        ],
        "subtotal": _money(order.subtotal),
        "delivery_fee": _money(order.delivery_fee),
        "discount": _money(order.discount_amount),
        "coupon_code": order.coupon_code,
        "tax": _money(order.tax_amount),
        "total": _money(order.grand_total),
        "currency": order.currency,
        "payment_method": "Cash on Delivery",
    }
    invoice = Invoice(
        invoice_number=number,
        invoice_type=InvoiceType.INVOICE,
        order_id=order.id,
        invoice_date=today,
        status=InvoiceStatus.ISSUED,
        snapshot=snapshot,
        snapshot_version=SNAPSHOT_VERSION,
        created_by_admin_id=admin.id if admin else None,
    )
    db.add(invoice)
    db.flush()
    record_audit(db, admin, "invoice.issue", "invoice", invoice.id, {"number": number, "order": order.order_number})
    return invoice


def issue_credit_note(
    db: Session, invoice: Invoice, admin: Admin, reason: str, amount: Decimal | None = None
) -> Invoice:
    """Credit all (amount=None) or part of an invoice. A full credit marks the invoice CREDITED."""
    if invoice.invoice_type != InvoiceType.INVOICE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only invoices can be credited")
    if invoice.status == InvoiceStatus.CREDITED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invoice has already been fully credited")

    invoice_total = Decimal(invoice.snapshot["total"])
    remaining = invoice_total - credited_total(db, invoice)
    credit = remaining if amount is None else amount
    if credit <= 0 or credit > remaining:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Credit amount must be between 0.01 and {_money(remaining)} (remaining on the invoice).",
        )
    full = credit == invoice_total and remaining == invoice_total

    today = datetime.now(QATAR_TZ).date()
    number = next_document_number(db, "credit_note", "CN")
    original = invoice.snapshot
    snapshot = {
        "type": InvoiceType.CREDIT_NOTE.value,
        "number": number,
        "date": today.isoformat(),
        "order_number": original["order_number"],
        "order_date": original["order_date"],
        "credited_invoice_number": invoice.invoice_number,
        "credited_invoice_date": original["date"],
        "reason": reason,
        "seller": _seller(),
        "customer": original["customer"],
        "lines": original["lines"] if full else [
            {
                "description": f"Credit against invoice {invoice.invoice_number}: {reason}",
                "sku": "",
                "colour": "",
                "size": "",
                "quantity": 1,
                "unit_price": _money(credit),
                "line_total": _money(credit),
            }
        ],
        "subtotal": original["subtotal"] if full else _money(credit),
        "delivery_fee": original["delivery_fee"] if full else "0.00",
        "discount": original["discount"] if full else "0.00",
        "tax": original["tax"] if full else "0.00",
        "total": _money(credit),
        "currency": original["currency"],
        "payment_method": original["payment_method"],
    }
    note = Invoice(
        invoice_number=number,
        invoice_type=InvoiceType.CREDIT_NOTE,
        order_id=invoice.order_id,
        related_invoice_id=invoice.id,
        invoice_date=today,
        status=InvoiceStatus.ISSUED,
        snapshot=snapshot,
        snapshot_version=SNAPSHOT_VERSION,
        created_by_admin_id=admin.id,
    )
    db.add(note)
    if credit == remaining:
        invoice.status = InvoiceStatus.CREDITED
    db.flush()
    record_audit(
        db, admin, "invoice.credit_note", "invoice", note.id,
        {"number": number, "credits": invoice.invoice_number, "amount": _money(credit), "reason": reason},
    )
    return note
