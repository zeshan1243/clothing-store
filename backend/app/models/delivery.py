from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import Money, TimestampMixin


class DeliveryArea(TimestampMixin, Base):
    """An area customers pick at checkout. The fee comes from its distance (see services/delivery)."""

    __tablename__ = "delivery_areas"
    __table_args__ = (
        CheckConstraint("distance_km >= 0", name="distance_non_negative"),
        CheckConstraint("fixed_fee IS NULL OR fixed_fee >= 0", name="fixed_fee_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    name_ar: Mapped[str | None] = mapped_column(String(120))
    # Approximate road distance from central Doha.
    distance_km: Mapped[int] = mapped_column(Integer)
    # Inside the free-delivery zone (Doha city and Al Rayyan suburbs).
    # Charge set by hand for this area (QAR); overrides the distance formula. Null = automatic.
    fixed_fee: Mapped[Decimal | None] = mapped_column(Money)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
