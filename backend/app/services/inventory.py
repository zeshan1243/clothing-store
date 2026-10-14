"""Variant-level stock changes. Every change locks the variant row and writes a stock movement.

Policy: `stock_quantity` is on hand, `reserved_quantity` is held by open orders, and
available = stock - reserved. See README "Inventory policy".
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Admin, ProductVariant, StockMovement
from app.models.enums import StockMovementType


def lock_variant(db: Session, variant_id: int) -> ProductVariant:
    variant = db.scalar(select(ProductVariant).where(ProductVariant.id == variant_id).with_for_update())
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product variant not found")
    return variant


def adjust_stock(
    db: Session,
    variant_id: int,
    quantity_change: int,
    movement_type: StockMovementType,
    reason: str,
    admin: Admin | None,
    related_supplier_bill_id: int | None = None,
) -> StockMovement:
    """Change on-hand stock (receive, correct, return). Never lets stock drop below what's reserved."""
    variant = lock_variant(db, variant_id)
    new_stock = variant.stock_quantity + quantity_change
    if new_stock < variant.reserved_quantity:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot remove {-quantity_change} units: only {variant.available_quantity} are not "
            f"reserved by open orders (on hand {variant.stock_quantity}, reserved {variant.reserved_quantity}).",
        )
    variant.stock_quantity = new_stock
    movement = StockMovement(
        product_variant_id=variant.id,
        movement_type=movement_type,
        quantity_change=quantity_change,
        related_supplier_bill_id=related_supplier_bill_id,
        reason=reason,
        created_by_admin_id=admin.id if admin else None,
    )
    db.add(movement)
    return movement


def low_stock_threshold(variant: ProductVariant) -> int:
    if variant.low_stock_threshold is not None:
        return variant.low_stock_threshold
    return get_settings().low_stock_threshold
