import secrets
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentAdmin, DbSession
from app.models import Coupon, CouponRedemption, Order
from app.schemas.coupons import CouponDetail, CouponIn, CouponOut, CouponRedemptionOut, CouponState
from app.services.audit import record_audit

router = APIRouter(prefix="/coupons", tags=["admin-coupons"])

# No look-alike characters (0/O, 1/I) so codes are easy to read out loud.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _state(c: Coupon, now: datetime) -> CouponState:
    if not c.is_active:
        return "inactive"
    if c.starts_at and now < c.starts_at:
        return "scheduled"
    if c.ends_at and now >= c.ends_at:
        return "expired"
    if c.usage_limit is not None and c.times_used >= c.usage_limit:
        return "used_up"
    return "active"


def _savings(db: Session) -> dict[int, Decimal]:
    rows = db.execute(
        select(CouponRedemption.coupon_id, func.coalesce(func.sum(CouponRedemption.discount_amount), 0))
        .where(CouponRedemption.voided_at.is_(None))
        .group_by(CouponRedemption.coupon_id)
    ).all()
    return {cid: Decimal(total) for cid, total in rows}


def _out(c: Coupon, savings: dict[int, Decimal]) -> CouponOut:
    out = CouponOut.model_validate(c)
    out.state = _state(c, datetime.now(UTC))
    out.total_savings = savings.get(c.id, Decimal("0"))
    return out


def _get(db: Session, coupon_id: int) -> Coupon:
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    return coupon


@router.get("", response_model=list[CouponOut])
def list_coupons(db: DbSession, _: CurrentAdmin) -> list[CouponOut]:
    savings = _savings(db)
    return [_out(c, savings) for c in db.scalars(select(Coupon).order_by(Coupon.created_at.desc()))]


@router.get("/generate-code")
def generate_code(db: DbSession, _: CurrentAdmin) -> dict[str, str]:
    """A random unused code, e.g. DROP-7KQ2XM."""
    for _attempt in range(10):
        code = "DROP-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if db.scalar(select(Coupon.id).where(Coupon.code == code)) is None:
            return {"code": code}
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not generate a code, try again")


@router.post("", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
def create_coupon(body: CouponIn, db: DbSession, admin: CurrentAdmin) -> CouponOut:
    if db.scalar(select(Coupon.id).where(Coupon.code == body.code)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The code {body.code} already exists")
    coupon = Coupon(**body.model_dump(), created_by_admin_id=admin.id)
    db.add(coupon)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, f"The code {body.code} already exists") from exc
    record_audit(db, admin, "coupon.create", "coupon", coupon.id, {"code": coupon.code})
    db.commit()
    return _out(coupon, {})


@router.get("/{coupon_id}", response_model=CouponDetail)
def get_coupon(coupon_id: int, db: DbSession, _: CurrentAdmin) -> CouponDetail:
    coupon = _get(db, coupon_id)
    rows = db.execute(
        select(CouponRedemption, Order.order_number, Order.customer_name)
        .join(Order, Order.id == CouponRedemption.order_id)
        .where(CouponRedemption.coupon_id == coupon.id)
        .order_by(CouponRedemption.id.desc())
        .limit(200)
    ).all()
    return CouponDetail(
        **_out(coupon, _savings(db)).model_dump(),
        redemptions=[
            CouponRedemptionOut(
                order_id=r.order_id,
                order_number=number,
                customer_name=name,
                discount_amount=r.discount_amount,
                created_at=r.created_at,
                voided=r.voided_at is not None,
            )
            for r, number, name in rows
        ],
    )


@router.patch("/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, body: CouponIn, db: DbSession, admin: CurrentAdmin) -> CouponOut:
    coupon = db.scalar(select(Coupon).where(Coupon.id == coupon_id).with_for_update())
    if coupon is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    if body.code != coupon.code:
        if coupon.times_used > 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "A coupon that has been used can't be renamed")
        if db.scalar(select(Coupon.id).where(Coupon.code == body.code)) is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"The code {body.code} already exists")
    changes = {k: v for k, v in body.model_dump().items() if getattr(coupon, k) != v}
    for key, value in changes.items():
        setattr(coupon, key, value)
    if changes:
        record_audit(db, admin, "coupon.update", "coupon", coupon.id, {k: str(v) for k, v in changes.items()})
    db.commit()
    return _out(coupon, _savings(db))
