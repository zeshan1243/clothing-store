from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentAdmin, DbSession
from app.core.config import get_settings
from app.models import Admin, Invoice, Order
from app.models.enums import InvoiceStatus, InvoiceType
from app.services.invoice_pdf import render_invoice_pdf, render_shipping_label
from app.services.invoices import active_invoice, credited_total, invoices_for_order, issue_credit_note, issue_invoice
from app.services.order_operations import lock_order

router = APIRouter(tags=["admin-invoices"])


class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    invoice_type: InvoiceType
    status: InvoiceStatus
    invoice_date: date
    order_id: int
    order_number: str
    total: Decimal
    currency: str
    related_invoice_number: str | None
    credited_amount: Decimal | None
    reason: str | None
    created_by: str | None
    created_at: datetime


class CreditNoteIn(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
    # Omit for a full credit of the remaining invoice amount.
    amount: Annotated[Decimal | None, Field(gt=0, max_digits=12, decimal_places=2)] = None


def _out(db: Session, invoice: Invoice) -> InvoiceOut:
    s = invoice.snapshot
    creator = db.get(Admin, invoice.created_by_admin_id) if invoice.created_by_admin_id else None
    return InvoiceOut(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        invoice_type=invoice.invoice_type,
        status=invoice.status,
        invoice_date=invoice.invoice_date,
        order_id=invoice.order_id,
        order_number=s["order_number"],
        total=Decimal(s["total"]),
        currency=s["currency"],
        related_invoice_number=s.get("credited_invoice_number"),
        credited_amount=credited_total(db, invoice) if invoice.invoice_type == InvoiceType.INVOICE else None,
        reason=s.get("reason"),
        created_by=creator.name if creator else None,
        created_at=invoice.created_at,
    )


def _order(db: Session, order_id: int) -> Order:
    order = db.scalar(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items), selectinload(Order.payments))
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def _pdf(content: bytes, filename: str, download: bool) -> Response:
    disposition = "attachment" if download else "inline"
    return Response(
        content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "no-store",  # contains customer personal data
        },
    )


@router.get("/orders/{order_id}/invoices", response_model=list[InvoiceOut])
def list_order_invoices(order_id: int, db: DbSession, _: CurrentAdmin) -> list[InvoiceOut]:
    _order(db, order_id)
    return [_out(db, i) for i in invoices_for_order(db, order_id)]


@router.get("/orders/{order_id}/invoice", response_model=InvoiceOut)
def get_order_invoice(order_id: int, db: DbSession, _: CurrentAdmin) -> InvoiceOut:
    invoice = active_invoice(db, order_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active invoice for this order")
    return _out(db, invoice)


@router.post("/orders/{order_id}/invoice", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_order_invoice(order_id: int, db: DbSession, admin: CurrentAdmin) -> InvoiceOut:
    order = lock_order(db, order_id)
    invoice = issue_invoice(db, order, admin)
    db.commit()
    return _out(db, invoice)


@router.post("/invoices/{invoice_id}/credit-notes", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_credit_note(invoice_id: int, body: CreditNoteIn, db: DbSession, admin: CurrentAdmin) -> InvoiceOut:
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id).with_for_update())
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    note = issue_credit_note(db, invoice, admin, body.reason, body.amount)
    db.commit()
    return _out(db, note)


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(invoice_id: int, db: DbSession, _: CurrentAdmin, download: bool = False) -> Response:
    invoice = db.get(Invoice, invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    content = render_invoice_pdf(invoice, _order(db, invoice.order_id))
    return _pdf(content, f"{invoice.invoice_number}.pdf", download)


@router.get("/orders/{order_id}/label.pdf")
def shipping_label(order_id: int, db: DbSession, _: CurrentAdmin, download: bool = False) -> Response:
    order = _order(db, order_id)
    settings = get_settings()
    content = render_shipping_label(order, settings.business_name, settings.business_phone)
    return _pdf(content, f"label-{order.order_number}.pdf", download)
