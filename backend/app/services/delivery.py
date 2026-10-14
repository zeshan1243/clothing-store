"""Delivery pricing across Qatar.

In order of precedence:
1. Areas in the free zone (Doha city and the Al Rayyan suburbs) deliver free.
2. An area with a fixed fee set by an admin pays exactly that.
3. Everywhere else pays the standard outside-Doha fee plus a charge per started block of km from
   central Doha, e.g. with the defaults (QAR 10 + QAR 1 per 5 km) Al Khor at 50 km is QAR 20 and
   52 km rounds up to 55 km.
"""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.delivery import DeliveryArea

ZERO = Decimal("0.00")


def fee_for(area: DeliveryArea) -> Decimal:
    if area.is_free:
        return ZERO
    if area.fixed_fee is not None:
        return area.fixed_fee.quantize(Decimal("0.01"))
    return distance_fee(area.distance_km)


def distance_fee(distance_km: int) -> Decimal:
    """The automatic fee for a distance (what an area costs without a fixed fee)."""
    s = get_settings()
    blocks = -(-distance_km // s.delivery_step_km)  # ceiling division
    return (s.delivery_outside_base_fee + s.delivery_fee_per_step * blocks).quantize(Decimal("0.01"))


def find_area(db: Session, name: str | None) -> DeliveryArea | None:
    """Active area by name (case- and space-insensitive)."""
    if not name or not name.strip():
        return None
    return db.scalar(
        select(DeliveryArea).where(
            func.lower(DeliveryArea.name) == name.strip().lower(), DeliveryArea.is_active.is_(True)
        )
    )
