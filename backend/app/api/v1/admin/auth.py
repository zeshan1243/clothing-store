from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import CurrentAdmin, DbSession
from app.core.config import get_settings
from app.core.rate_limit import RateLimiter
from app.core.security import (
    create_access_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.models import Admin, AdminAuditLog, Order, OrderStatusHistory, Payment
from app.models.enums import OrderStatus, PaymentType
from app.schemas.auth import (
    ActivityItem,
    AdminNameUpdate,
    AdminOut,
    AdminProfile,
    AdminProfileStats,
    ChangePasswordRequest,
    LoginRequest,
    TeamMember,
    TokenResponse,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["admin-auth"])

login_rate_limiter = RateLimiter("admin-login", get_settings().login_rate_limit_per_minute)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_rate_limiter)])
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    admin = db.scalar(select(Admin).where(func.lower(Admin.email) == body.email.lower()))
    if not verify_password(body.password, admin.password_hash if admin else None) or not admin.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if password_needs_rehash(admin.password_hash):
        admin.password_hash = hash_password(body.password)
    admin.last_login_at = datetime.now(UTC)
    record_audit(db, admin, "admin.login", "admin", admin.id)
    db.commit()

    token, expires_at = create_access_token(admin.id)
    return TokenResponse(access_token=token, expires_at=expires_at, admin=AdminOut.model_validate(admin))


@router.get("/me", response_model=AdminOut)
def me(admin: CurrentAdmin) -> Admin:
    return admin


@router.post("/change-password", status_code=204, dependencies=[Depends(login_rate_limiter)])
def change_password(body: ChangePasswordRequest, admin: CurrentAdmin, db: DbSession) -> None:
    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if body.new_password == body.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different password")
    admin.password_hash = hash_password(body.new_password)
    record_audit(db, admin, "admin.change_password", "admin", admin.id)
    db.commit()


_OPEN = (OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERY_FAILED)
_LABEL_KEYS = ("number", "order", "order_number", "sku", "code", "name", "phone", "reference")


def _label(details: dict | None) -> str | None:
    if not isinstance(details, dict):
        return None
    for key in _LABEL_KEYS:
        value = details.get(key)
        if isinstance(value, str | int) and str(value).strip():
            return str(value)[:80]
    return None


@router.patch("/me", response_model=AdminOut)
def update_me(body: AdminNameUpdate, admin: CurrentAdmin, db: DbSession) -> Admin:
    old = admin.name
    admin.name = body.name.strip()
    record_audit(db, admin, "admin.update_profile", "admin", admin.id, {"from": old, "to": admin.name})
    db.commit()
    return admin


@router.get("/profile", response_model=AdminProfile)
def profile(admin: CurrentAdmin, db: DbSession) -> AdminProfile:
    """The signed-in admin's details, a few work numbers, their recent actions and the team."""
    confirmed = db.scalar(
        select(func.count()).select_from(OrderStatusHistory).where(
            OrderStatusHistory.changed_by_admin_id == admin.id, OrderStatusHistory.new_status == OrderStatus.CONFIRMED
        )
    ) or 0
    delivered = db.scalar(
        select(func.count()).select_from(OrderStatusHistory).where(
            OrderStatusHistory.changed_by_admin_id == admin.id, OrderStatusHistory.new_status == OrderStatus.DELIVERED
        )
    ) or 0
    open_assigned = db.scalar(
        select(func.count()).select_from(Order).where(Order.assigned_admin_id == admin.id, Order.order_status.in_(_OPEN))
    ) or 0
    cash = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.recorded_by_admin_id == admin.id, Payment.type == PaymentType.COD_COLLECTION
        )
    ) or Decimal("0")
    since = datetime.now(UTC) - timedelta(days=30)
    actions = db.scalar(
        select(func.count()).select_from(AdminAuditLog).where(
            AdminAuditLog.admin_id == admin.id, AdminAuditLog.created_at >= since, AdminAuditLog.action != "admin.login"
        )
    ) or 0
    recent = db.scalars(
        select(AdminAuditLog)
        .where(AdminAuditLog.admin_id == admin.id, AdminAuditLog.action != "admin.login")
        .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(15)
    ).all()
    team = db.scalars(select(Admin).order_by(Admin.is_active.desc(), Admin.name)).all()
    return AdminProfile(
        id=admin.id,
        name=admin.name,
        email=admin.email,
        role=admin.role,
        created_at=admin.created_at,
        last_login_at=admin.last_login_at,
        stats=AdminProfileStats(
            orders_confirmed=confirmed,
            deliveries_done=delivered,
            open_assigned=open_assigned,
            cash_collected=f"{Decimal(cash):.2f}",
            actions_30d=actions,
        ),
        recent_activity=[
            ActivityItem(
                id=a.id, action=a.action, entity_type=a.entity_type, entity_id=a.entity_id,
                label=_label(a.details), created_at=a.created_at,
            )
            for a in recent
        ],
        team=[
            TeamMember(id=m.id, name=m.name, role=m.role, is_active=m.is_active, last_login_at=m.last_login_at) for m in team
        ],
    )
