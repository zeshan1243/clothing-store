import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Admin, Category, Collection, Product, ProductImage, ProductVariant, SizeGuide
from app.models.enums import StockMovementType
from app.schemas.catalog import (
    ColourOption,
    ImageIn,
    ImageOut,
    ProductCardOut,
    ProductCreate,
    ProductDetailOut,
    ProductUpdate,
    PublicVariantOut,
    SizeGuideOut,
    VariantIn,
)
from app.services.inventory import adjust_stock


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value[:170] or "item"


def unique_slug(db: Session, model: type[Product] | type[Category] | type[Collection], base: str, exclude_id: int | None = None) -> str:
    """Return `base`, or `base-2`, `base-3`… if taken by another row."""
    candidate, n = base, 2
    while True:
        query = select(model.id).where(model.slug == candidate)
        if exclude_id is not None:
            query = query.where(model.id != exclude_id)
        if db.scalar(query) is None:
            return candidate
        candidate, n = f"{base}-{n}", n + 1


def ensure_slug_free(db: Session, model, slug: str, exclude_id: int | None = None) -> None:
    query = select(model.id).where(model.slug == slug)
    if exclude_id is not None:
        query = query.where(model.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"The slug '{slug}' is already in use")


def _check_references(db: Session, category_id: int | None, size_guide_id: int | None) -> None:
    if category_id is not None and db.get(Category, category_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Category not found")
    if size_guide_id is not None and db.get(SizeGuide, size_guide_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Size guide not found")


def _replace_images(product: Product, images: list[ImageIn]) -> None:
    product.images.clear()
    for index, image in enumerate(images):
        product.images.append(
            ProductImage(
                image_url=image.image_url,
                alt_text=image.alt_text or product.name,
                colour=image.colour,
                sort_order=image.sort_order if image.sort_order else index,
            )
        )


def _upsert_variants(db: Session, product: Product, variants: list[VariantIn], admin: Admin) -> None:
    existing = {v.id: v for v in product.variants}

    # SKUs must be unique across the whole catalogue, not only within this product.
    incoming_skus = {v.sku: v.id for v in variants}
    clashes = db.execute(
        select(ProductVariant.sku, ProductVariant.id).where(ProductVariant.sku.in_(incoming_skus))
    ).all()
    for sku, variant_id in clashes:
        if incoming_skus[sku] != variant_id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"SKU '{sku}' is already used by another variant")

    # Final colour/size combinations must stay unique per product (DB constraint backs this up).
    final_combos: dict[tuple[str, str], int | None] = {
        (v.colour.lower(), v.size): v.id for v in product.variants
    }
    for v in variants:
        if v.id is not None:
            old = existing.get(v.id)
            if old is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Variant {v.id} does not belong to this product")
            final_combos.pop((old.colour.lower(), old.size), None)
    for v in variants:
        key = (v.colour.lower(), v.size)
        if key in final_combos and final_combos[key] != v.id:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{v.colour} / {v.size} already exists for this product")
        final_combos[key] = v.id

    for v in variants:
        fields = v.model_dump(exclude={"id", "initial_stock"})
        if v.id is not None:
            variant = existing[v.id]
            for key, value in fields.items():
                setattr(variant, key, value)
        else:
            variant = ProductVariant(product=product, stock_quantity=0, reserved_quantity=0, **fields)
            db.add(variant)
            db.flush()
            if v.initial_stock:
                adjust_stock(db, variant.id, v.initial_stock, StockMovementType.RECEIVED, "Initial stock", admin)


def create_product(db: Session, data: ProductCreate, admin: Admin) -> Product:
    _check_references(db, data.category_id, data.size_guide_id)
    if data.slug:
        ensure_slug_free(db, Product, data.slug)
        slug = data.slug
    else:
        slug = unique_slug(db, Product, slugify(data.name))

    product = Product(
        slug=slug,
        **data.model_dump(exclude={"slug", "images", "variants"}),
    )
    db.add(product)
    _replace_images(product, data.images)
    db.flush()
    _upsert_variants(db, product, data.variants, admin)
    return product


def update_product(db: Session, product: Product, data: ProductUpdate, admin: Admin) -> dict:
    """Apply a PATCH and return a summary of changed fields for the audit log."""
    changes = data.model_dump(exclude_unset=True, exclude={"images", "variants"})
    if "category_id" in changes or "size_guide_id" in changes:
        _check_references(db, changes.get("category_id"), changes.get("size_guide_id"))
    if changes.get("slug"):
        ensure_slug_free(db, Product, changes["slug"], exclude_id=product.id)
    elif "slug" in changes:
        changes.pop("slug")
    for required in ("name", "base_price", "status"):
        if required in changes and changes[required] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{required} cannot be empty")

    base = changes.get("base_price", product.base_price)
    sale = changes["sale_price"] if "sale_price" in changes else product.sale_price
    if sale is not None and sale >= base:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Sale price must be lower than the regular price")

    audit = {k: str(v) for k, v in changes.items() if getattr(product, k) != v}
    for key, value in changes.items():
        setattr(product, key, value)

    if data.images is not None:
        _replace_images(product, data.images)
        audit["images"] = len(data.images)
    if data.variants is not None:
        _upsert_variants(db, product, data.variants, admin)
        audit["variants"] = [v.sku for v in data.variants]
    return audit


# ---------- Serialisers for the public storefront ----------


def _active_variants(product: Product) -> list[ProductVariant]:
    return sorted(
        (v for v in product.variants if v.is_active),
        key=lambda v: (v.colour.lower(), v.size_sort_order, v.size),
    )


def product_card(product: Product) -> ProductCardOut:
    variants = _active_variants(product)
    colours: dict[str, ColourOption] = {}
    for v in variants:
        colours.setdefault(v.colour.lower(), ColourOption(name=v.colour, hex=v.colour_hex))
    image = product.images[0] if product.images else None
    return ProductCardOut(
        id=product.id,
        name=product.name,
        name_ar=product.name_ar,
        slug=product.slug,
        price=product.effective_price,
        base_price=product.base_price,
        sale_price=product.sale_price,
        category_slug=product.category.slug if product.category else None,
        image_url=image.image_url if image else None,
        image_alt=(image.alt_text or product.name) if image else None,
        hover_image_url=product.images[1].image_url if len(product.images) > 1 else None,
        colours=list(colours.values()),
        in_stock=any(v.available_quantity > 0 for v in variants),
        total_available=sum(v.available_quantity for v in variants),
        is_new_arrival=product.is_new_arrival,
    )


def product_detail(product: Product) -> ProductDetailOut:
    card = product_card(product)
    return ProductDetailOut(
        **card.model_dump(),
        description=product.description,
        description_ar=product.description_ar,
        category_name=product.category.name if product.category else None,
        category_name_ar=product.category.name_ar if product.category else None,
        meta_title=product.meta_title,
        meta_description=product.meta_description,
        images=[ImageOut.model_validate(i) for i in product.images],
        variants=[
            PublicVariantOut(
                id=v.id,
                sku=v.sku,
                colour=v.colour,
                colour_hex=v.colour_hex,
                size=v.size,
                available_quantity=v.available_quantity,
            )
            for v in _active_variants(product)
        ],
        size_guide=SizeGuideOut.model_validate(product.size_guide) if product.size_guide else None,
    )


def category_product_counts(db: Session) -> dict[int, int]:
    rows = db.execute(select(Product.category_id, func.count()).group_by(Product.category_id)).all()
    return {category_id: count for category_id, count in rows if category_id is not None}
