from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.enums import AdminRole
from app.models.mixins import CreatedAtMixin, TimestampMixin, enum_column


class Admin(TimestampMixin, Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[AdminRole] = mapped_column(enum_column(AdminRole, "role"), default=AdminRole.ADMIN)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminAuditLog(CreatedAtMixin, Base):
    __tablename__ = "admin_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("admins.id"), index=True)
    action: Mapped[str] = mapped_column(String(64))
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))


class DocumentCounter(Base):
    """Gap-free yearly counters for human-readable order and invoice numbers.

    Rows are locked with SELECT ... FOR UPDATE inside the creating transaction.
    """

    __tablename__ = "document_counters"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SiteContent(TimestampMixin, Base):
    """Simple key/value content for homepage banners and similar admin-editable copy."""

    __tablename__ = "site_content"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    notes: Mapped[str | None] = mapped_column(Text)
