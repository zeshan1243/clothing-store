from datetime import date

from sqlalchemy import JSON, Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.enums import InvoiceStatus, InvoiceType
from app.models.mixins import CreatedAtMixin, enum_column


class Invoice(CreatedAtMixin, Base):
    """An issued invoice or credit note.

    `snapshot` holds everything needed to regenerate the PDF deterministically, so the PDF itself
    does not need to be stored. Issued invoices are never edited; corrections use credit notes.
    """

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True)
    invoice_type: Mapped[InvoiceType] = mapped_column(
        enum_column(InvoiceType, "invoice_type"), default=InvoiceType.INVOICE
    )
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    # For credit notes: the invoice being credited.
    related_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id"))
    invoice_date: Mapped[date] = mapped_column(Date)
    status: Mapped[InvoiceStatus] = mapped_column(enum_column(InvoiceStatus, "status"), default=InvoiceStatus.ISSUED)
    snapshot: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    snapshot_version: Mapped[int] = mapped_column(default=1, server_default="1")
    created_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
