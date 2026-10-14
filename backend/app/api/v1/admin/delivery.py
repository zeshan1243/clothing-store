from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.core.config import get_settings
from app.models import DeliveryArea
from app.schemas.orders import DeliveryAreaOut
from app.services.audit import record_audit
from app.services.checkout import area_out
from app.services.delivery import distance_fee

router = APIRouter(prefix="/delivery-areas", tags=["admin-delivery"])

AreaName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=120)]


class DeliveryAreaIn(BaseModel):
    name: AreaName
    name_ar: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=120)] = None
    distance_km: Annotated[int, Field(ge=0, le=400)]
    # Set by hand to override the distance formula; null = automatic.
    fixed_fee: Annotated[Decimal | None, Field(ge=0, le=1000, max_digits=7, decimal_places=2)] = None
    is_free: bool = False
    is_active: bool = True


class DeliveryAreaAdminOut(DeliveryAreaOut):
    is_active: bool
    fixed_fee: Decimal | None
    # What the distance formula alone would charge (shown next to a fixed fee).
    distance_fee: Decimal


class DeliveryRates(BaseModel):
    outside_base_fee: str
    fee_per_step: str
    step_km: int


class DeliveryAreasPage(BaseModel):
    rates: DeliveryRates
    areas: list[DeliveryAreaAdminOut]


def _out(area: DeliveryArea) -> DeliveryAreaAdminOut:
    return DeliveryAreaAdminOut(
        **area_out(area).model_dump(),
        is_active=area.is_active,
        fixed_fee=area.fixed_fee.quantize(Decimal("0.01")) if area.fixed_fee is not None else None,
        distance_fee=distance_fee(area.distance_km),
    )


def _ensure_name_free(db, name: str, exclude_id: int | None = None) -> None:
    query = select(DeliveryArea.id).where(func.lower(DeliveryArea.name) == name.lower())
    if exclude_id is not None:
        query = query.where(DeliveryArea.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"An area called '{name}' already exists")


@router.get("", response_model=DeliveryAreasPage)
def list_areas(db: DbSession, _: CurrentAdmin) -> DeliveryAreasPage:
    s = get_settings()
    areas = db.scalars(select(DeliveryArea).order_by(DeliveryArea.is_free.desc(), DeliveryArea.distance_km, DeliveryArea.name))
    return DeliveryAreasPage(
        rates=DeliveryRates(
            outside_base_fee=str(s.delivery_outside_base_fee), fee_per_step=str(s.delivery_fee_per_step), step_km=s.delivery_step_km
        ),
        areas=[_out(a) for a in areas],
    )


@router.post("", response_model=DeliveryAreaAdminOut, status_code=status.HTTP_201_CREATED)
def create_area(body: DeliveryAreaIn, db: DbSession, admin: CurrentAdmin) -> DeliveryAreaAdminOut:
    _ensure_name_free(db, body.name)
    area = DeliveryArea(**body.model_dump())
    db.add(area)
    db.flush()
    record_audit(db, admin, "delivery_area.create", "delivery_area", area.id, body.model_dump(mode="json"))
    db.commit()
    return _out(area)


@router.patch("/{area_id}", response_model=DeliveryAreaAdminOut)
def update_area(area_id: int, body: DeliveryAreaIn, db: DbSession, admin: CurrentAdmin) -> DeliveryAreaAdminOut:
    area = db.get(DeliveryArea, area_id)
    if area is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delivery area not found")
    _ensure_name_free(db, body.name, exclude_id=area.id)
    before = {
        "distance_km": area.distance_km,
        "fixed_fee": str(area.fixed_fee) if area.fixed_fee is not None else None,
        "is_free": area.is_free,
        "is_active": area.is_active,
    }
    for key, value in body.model_dump().items():
        setattr(area, key, value)
    record_audit(db, admin, "delivery_area.update", "delivery_area", area.id, {"before": before, "after": body.model_dump(mode="json")})
    db.commit()
    return _out(area)
