from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import joinedload

from app.api.deps import CurrentAdmin, DbSession
from app.models import Admin, Product, ProductVariant, StockMovement
from app.models.enums import ProductStatus
from app.schemas.catalog import InventoryRow, StockAdjustmentIn, StockMovementOut
from app.services.audit import record_audit
from app.services.inventory import adjust_stock, low_stock_threshold

router = APIRouter(prefix="/inventory", tags=["admin-inventory"])


@router.get("", response_model=list[InventoryRow])
def list_inventory(
    db: DbSession,
    _: CurrentAdmin,
    q: Annotated[str | None, Query(max_length=100)] = None,
    low_stock_only: bool = False,
    include_archived: bool = False,
) -> list[InventoryRow]:
    query = (
        select(ProductVariant)
        .join(Product)
        .options(joinedload(ProductVariant.product))
        .order_by(Product.name, ProductVariant.colour, ProductVariant.size_sort_order, ProductVariant.size)
    )
    if not include_archived:
        query = query.where(Product.status != ProductStatus.ARCHIVED)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), ProductVariant.sku.ilike(pattern)))

    rows = []
    for v in db.scalars(query):
        threshold = low_stock_threshold(v)
        is_low = v.is_active and v.available_quantity <= threshold
        if low_stock_only and not is_low:
            continue
        rows.append(
            InventoryRow(
                variant_id=v.id,
                product_id=v.product_id,
                product_name=v.product.name,
                product_status=v.product.status,
                sku=v.sku,
                colour=v.colour,
                size=v.size,
                stock_quantity=v.stock_quantity,
                reserved_quantity=v.reserved_quantity,
                available_quantity=v.available_quantity,
                low_stock_threshold=threshold,
                is_low_stock=is_low,
                is_active=v.is_active,
            )
        )
    return rows


@router.post("/adjustments", response_model=StockMovementOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(body: StockAdjustmentIn, db: DbSession, admin: CurrentAdmin) -> StockMovementOut:
    movement = adjust_stock(
        db, body.product_variant_id, body.quantity_change, body.movement_type, body.reason, admin
    )
    db.flush()
    record_audit(
        db,
        admin,
        "inventory.adjust",
        "product_variant",
        body.product_variant_id,
        {"type": body.movement_type.value, "change": body.quantity_change, "reason": body.reason},
    )
    db.commit()
    out = StockMovementOut.model_validate(movement)
    out.created_by_name = admin.name
    return out


@router.get("/variants/{variant_id}/movements", response_model=list[StockMovementOut])
def list_movements(variant_id: int, db: DbSession, _: CurrentAdmin) -> list[StockMovementOut]:
    rows = db.execute(
        select(StockMovement, Admin.name)
        .outerjoin(Admin, StockMovement.created_by_admin_id == Admin.id)
        .where(StockMovement.product_variant_id == variant_id)
        .order_by(StockMovement.id.desc())
        .limit(200)
    ).all()
    result = []
    for movement, admin_name in rows:
        out = StockMovementOut.model_validate(movement)
        out.created_by_name = admin_name
        result.append(out)
    return result
