from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentAdmin, DbSession
from app.models import OrderItem, Product, ProductImage, ProductVariant, StockMovement, SupplierBillItem
from app.models.enums import ProductStatus
from app.schemas.catalog import (
    ImageIn,
    ProductAdminListItem,
    ProductAdminOut,
    ProductCreate,
    ProductUpdate,
)
from app.services.audit import record_audit
from app.services.catalog import create_product, update_product

router = APIRouter(prefix="/products", tags=["admin-catalog"])


def _load(db, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.images), selectinload(Product.variants))
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


def _commit(db) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This change conflicts with existing data (duplicate slug, SKU or variant).") from exc


@router.get("", response_model=list[ProductAdminListItem])
def list_products(
    db: DbSession,
    _: CurrentAdmin,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[ProductStatus | None, Query(alias="status")] = None,
    category_id: int | None = None,
) -> list[ProductAdminListItem]:
    query = select(Product).options(
        selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category)
    )
    if q:
        pattern = f"%{q.strip()}%"
        sku_match = select(ProductVariant.product_id).where(ProductVariant.sku.ilike(pattern))
        query = query.where(or_(Product.name.ilike(pattern), Product.id.in_(sku_match)))
    if status_filter:
        query = query.where(Product.status == status_filter)
    else:
        query = query.where(Product.status != ProductStatus.ARCHIVED)
    if category_id:
        query = query.where(Product.category_id == category_id)

    return [
        ProductAdminListItem(
            id=p.id,
            name=p.name,
            slug=p.slug,
            status=p.status,
            category_name=p.category.name if p.category else None,
            base_price=p.base_price,
            sale_price=p.sale_price,
            image_url=p.images[0].image_url if p.images else None,
            variant_count=len(p.variants),
            stock_on_hand=sum(v.stock_quantity for v in p.variants),
            available=sum(v.available_quantity for v in p.variants if v.is_active),
            is_featured=p.is_featured,
            is_new_arrival=p.is_new_arrival,
            updated_at=p.updated_at,
        )
        for p in db.scalars(query.order_by(Product.updated_at.desc()))
    ]


@router.post("", response_model=ProductAdminOut, status_code=status.HTTP_201_CREATED)
def create(body: ProductCreate, db: DbSession, admin: CurrentAdmin) -> Product:
    product = create_product(db, body, admin)
    db.flush()
    record_audit(db, admin, "product.create", "product", product.id, {"name": product.name})
    _commit(db)
    return _load(db, product.id)


@router.get("/{product_id}", response_model=ProductAdminOut)
def get(product_id: int, db: DbSession, _: CurrentAdmin) -> Product:
    return _load(db, product_id)


@router.patch("/{product_id}", response_model=ProductAdminOut)
def update(product_id: int, body: ProductUpdate, db: DbSession, admin: CurrentAdmin) -> Product:
    product = _load(db, product_id)
    changes = update_product(db, product, body, admin)
    if changes:
        record_audit(db, admin, "product.update", "product", product.id, changes)
    _commit(db)
    db.expire_all()
    return _load(db, product_id)


@router.delete("/{product_id}/variants/{variant_id}", response_model=ProductAdminOut)
def delete_variant(product_id: int, variant_id: int, db: DbSession, admin: CurrentAdmin) -> Product:
    """Delete a variant that was never sold or received on a supplier bill (e.g. added by mistake).

    Variants with history must stay for the records; untick "Active" to hide them instead.
    """
    product = _load(db, product_id)
    variant = next((v for v in product.variants if v.id == variant_id), None)
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found")
    in_orders = db.scalar(select(exists().where(OrderItem.product_variant_id == variant.id)))
    in_bills = db.scalar(select(exists().where(SupplierBillItem.product_variant_id == variant.id)))
    if in_orders or in_bills or variant.reserved_quantity:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{variant.sku} appears in orders or supplier bills, so it can't be deleted. Untick \"Active\" to hide it instead.",
        )
    record_audit(
        db, admin, "product.variant_delete", "product", product.id,
        {"sku": variant.sku, "colour": variant.colour, "size": variant.size, "stock_quantity": variant.stock_quantity},
    )
    # Its only history is manual stock adjustments (e.g. the initial stock); they go with it.
    db.execute(delete(StockMovement).where(StockMovement.product_variant_id == variant.id))
    db.delete(variant)
    _commit(db)
    db.expire_all()
    return _load(db, product_id)


@router.post("/{product_id}/images", response_model=ProductAdminOut, status_code=status.HTTP_201_CREATED)
def add_image(product_id: int, body: ImageIn, db: DbSession, admin: CurrentAdmin) -> Product:
    """Attach an already-hosted image (e.g. a Cloudinary URL) to the product."""
    product = _load(db, product_id)
    product.images.append(
        ProductImage(
            image_url=body.image_url,
            alt_text=body.alt_text or product.name,
            colour=body.colour,
            sort_order=body.sort_order or len(product.images),
        )
    )
    record_audit(db, admin, "product.image_add", "product", product.id, {"url": body.image_url})
    _commit(db)
    db.expire_all()
    return _load(db, product_id)
