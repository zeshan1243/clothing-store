from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models import Category, Collection, Product, ProductImage, ProductVariant
from app.models.catalog import collection_products
from app.models.enums import ProductStatus
from app.schemas.catalog import (
    CollectionOut,
    CategoryOut,
    ColourOption,
    ProductDetailOut,
    ProductFacets,
    ProductPage,
    ProductSort,
)
from app.services.catalog import product_card, product_detail

router = APIRouter(tags=["storefront"])

_APPAREL_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL"]


def _size_rank(size: str) -> tuple[int, float, str]:
    """Clothing order for filter lists: XS < S < M < L < XL…, then numeric sizes, then the rest."""
    s = size.upper().strip()
    if s in _APPAREL_SIZES:
        return (0, _APPAREL_SIZES.index(s), s)
    try:
        return (1, float(s), s)
    except ValueError:
        return (2, 0, s)


def _visible_products():
    """Active products whose category (if any) is also active."""
    return (
        select(Product)
        .outerjoin(Category, Product.category_id == Category.id)
        .where(Product.status == ProductStatus.ACTIVE)
        .where(or_(Product.category_id.is_(None), Category.is_active.is_(True)))
    )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DbSession) -> list[CategoryOut]:
    categories = list(
        db.scalars(
            select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.name)
        )
    )
    # Fallback tile image: the main photo of the category's featured (else newest) active product.
    fallback = dict(
        db.execute(
            select(Product.category_id, ProductImage.image_url)
            .join(ProductImage, ProductImage.product_id == Product.id)
            .where(Product.status == ProductStatus.ACTIVE, Product.category_id.in_([c.id for c in categories]))
            .order_by(
                Product.category_id,
                Product.is_featured.desc(),
                Product.created_at.desc(),
                ProductImage.sort_order,
                ProductImage.id,
            )
            .ext(distinct_on(Product.category_id))
        ).all()
    )
    out = []
    for category in categories:
        item = CategoryOut.model_validate(category)
        item.cover_image_url = category.image_url or fallback.get(category.id)
        out.append(item)
    return out


def _collection_cards(db: DbSession, collections: list[Collection]) -> list[CollectionOut]:
    """Add the visible product count and a cover image (own banner, else a product photo)."""
    ids = [c.id for c in collections]
    visible = _visible_products().with_only_columns(Product.id).subquery()
    member = collection_products.c
    counts = dict(
        db.execute(
            select(member.collection_id, func.count())
            .where(member.collection_id.in_(ids), member.product_id.in_(select(visible.c.id)))
            .group_by(member.collection_id)
        ).all()
    )
    covers = dict(
        db.execute(
            select(member.collection_id, ProductImage.image_url)
            .join(Product, Product.id == member.product_id)
            .join(ProductImage, ProductImage.product_id == Product.id)
            .where(member.collection_id.in_(ids), Product.id.in_(select(visible.c.id)))
            .order_by(
                member.collection_id,
                Product.is_featured.desc(),
                Product.created_at.desc(),
                ProductImage.sort_order,
                ProductImage.id,
            )
            .ext(distinct_on(member.collection_id))
        ).all()
    )
    out = []
    for c in collections:
        card = CollectionOut.model_validate(c)
        card.product_count = counts.get(c.id, 0)
        card.cover_image_url = c.image_url or covers.get(c.id)
        out.append(card)
    return out


@router.get("/collections", response_model=list[CollectionOut])
def list_collections(db: DbSession, featured: bool | None = None) -> list[CollectionOut]:
    """Active collections that have at least one product on sale; `featured=true` for the homepage."""
    query = select(Collection).where(Collection.is_active.is_(True))
    if featured is not None:
        query = query.where(Collection.is_featured.is_(featured))
    collections = list(db.scalars(query.order_by(Collection.sort_order, Collection.name)))
    return [c for c in _collection_cards(db, collections) if c.product_count]


@router.get("/collections/{slug}", response_model=CollectionOut)
def get_collection(slug: str, db: DbSession) -> CollectionOut:
    collection = db.scalar(select(Collection).where(Collection.slug == slug, Collection.is_active.is_(True)))
    if collection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    return _collection_cards(db, [collection])[0]


@router.get("/products", response_model=ProductPage)
def list_products(
    db: DbSession,
    category: str | None = None,
    collection: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    featured: bool | None = None,
    new: bool | None = None,
    sort: ProductSort = "newest",
    size: Annotated[list[str] | None, Query(max_length=20)] = None,
    colour: Annotated[list[str] | None, Query(max_length=20)] = None,
    min_price: Annotated[Decimal | None, Query(ge=0)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0)] = None,
    in_stock: bool = False,
    exclude: int | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=48)] = 24,
) -> ProductPage:
    query = _filtered(category, q, featured, new, collection)
    # Variant-level filters: a product matches if one active variant matches all of them.
    variant_conditions = []
    if size:
        variant_conditions.append(func.upper(ProductVariant.size).in_([s.upper() for s in size]))
    if colour:
        variant_conditions.append(func.lower(ProductVariant.colour).in_([c.lower() for c in colour]))
    if in_stock:
        variant_conditions.append(ProductVariant.stock_quantity > ProductVariant.reserved_quantity)
    if variant_conditions:
        query = query.where(
            Product.id.in_(
                select(ProductVariant.product_id).where(ProductVariant.is_active.is_(True), *variant_conditions)
            )
        )
    price = func.coalesce(Product.sale_price, Product.base_price)
    if min_price is not None:
        query = query.where(price >= min_price)
    if max_price is not None:
        query = query.where(price <= max_price)
    if exclude:
        query = query.where(Product.id != exclude)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

    order_by = {
        "newest": (Product.created_at.desc(), Product.id.desc()),
        "price_asc": (price.asc(), Product.id),
        "price_desc": (price.desc(), Product.id),
        "name": (Product.name.asc(), Product.id),
    }[sort]
    products = db.scalars(
        query.options(
            selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category)
        )
        .order_by(*order_by)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return ProductPage(items=[product_card(p) for p in products], total=total, page=page, page_size=page_size)


def _filtered(
    category: str | None, q: str | None, featured: bool | None, new: bool | None, collection: str | None = None
):
    query = _visible_products()
    if category:
        query = query.where(Category.slug == category)
    if collection:
        query = query.where(
            Product.id.in_(
                select(collection_products.c.product_id)
                .join(Collection, Collection.id == collection_products.c.collection_id)
                .where(Collection.slug == collection, Collection.is_active.is_(True))
            )
        )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Product.name.ilike(pattern),
                Product.description.ilike(pattern),
                Product.name_ar.ilike(pattern),
                Product.description_ar.ilike(pattern),
            )
        )
    if featured is not None:
        query = query.where(Product.is_featured.is_(featured))
    if new is not None:
        query = query.where(Product.is_new_arrival.is_(new))
    return query


@router.get("/products/facets", response_model=ProductFacets)
def product_facets(
    db: DbSession,
    category: str | None = None,
    collection: str | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    new: bool | None = None,
) -> ProductFacets:
    """Sizes, colours and price range available for the current listing (before size/colour filters)."""
    product_ids = _filtered(category, q, None, new, collection).with_only_columns(Product.id).subquery()
    variants = db.execute(
        select(ProductVariant.size, ProductVariant.colour, ProductVariant.colour_hex)
        .where(ProductVariant.product_id.in_(select(product_ids.c.id)), ProductVariant.is_active.is_(True))
    ).all()
    sizes: set[str] = set()
    colours: dict[str, ColourOption] = {}
    for size, colour, hex_ in variants:
        sizes.add(size)
        colours.setdefault(colour.lower(), ColourOption(name=colour, hex=hex_))
    price = func.coalesce(Product.sale_price, Product.base_price)
    low, high = db.execute(
        select(func.min(price), func.max(price)).where(Product.id.in_(select(product_ids.c.id)))
    ).one()
    return ProductFacets(
        sizes=sorted(sizes, key=_size_rank),
        colours=sorted(colours.values(), key=lambda c: c.name.lower()),
        min_price=low,
        max_price=high,
    )


@router.get("/products/{slug}", response_model=ProductDetailOut)
def get_product(slug: str, db: DbSession) -> ProductDetailOut:
    product = db.scalar(
        _visible_products()
        .where(Product.slug == slug)
        .options(
            selectinload(Product.images),
            selectinload(Product.variants),
            selectinload(Product.category),
            selectinload(Product.size_guide),
        )
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product_detail(product)
