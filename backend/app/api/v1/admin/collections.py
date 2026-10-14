from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import CurrentAdmin, DbSession
from app.models import Collection, Product
from app.models.catalog import collection_products
from app.schemas.catalog import CollectionAdminOut, CollectionIn
from app.services.audit import record_audit
from app.services.catalog import ensure_slug_free, slugify, unique_slug

router = APIRouter(prefix="/collections", tags=["admin-catalog"])


def _out(collection: Collection) -> CollectionAdminOut:
    out = CollectionAdminOut.model_validate(collection)
    out.product_ids = [p.id for p in collection.products]
    out.product_count = len(out.product_ids)
    out.cover_image_url = collection.image_url or next(
        (p.images[0].image_url for p in collection.products if p.images), None
    )
    return out


def _get(db: Session, collection_id: int) -> Collection:
    collection = db.scalar(
        select(Collection)
        .where(Collection.id == collection_id)
        .options(selectinload(Collection.products).selectinload(Product.images))
    )
    if collection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    return collection


def _products(db: Session, ids: list[int]) -> list[Product]:
    unique = list(dict.fromkeys(ids))
    products = list(db.scalars(select(Product).where(Product.id.in_(unique)))) if unique else []
    if len(products) != len(unique):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Some selected products no longer exist")
    return products


@router.get("", response_model=list[CollectionAdminOut])
def list_collections(db: DbSession, _: CurrentAdmin) -> list[CollectionAdminOut]:
    collections = db.scalars(
        select(Collection)
        .options(selectinload(Collection.products).selectinload(Product.images))
        .order_by(Collection.sort_order, Collection.name)
    )
    return [_out(c) for c in collections]


@router.post("", response_model=CollectionAdminOut, status_code=status.HTTP_201_CREATED)
def create_collection(body: CollectionIn, db: DbSession, admin: CurrentAdmin) -> CollectionAdminOut:
    if body.slug:
        ensure_slug_free(db, Collection, body.slug)
        slug = body.slug
    else:
        slug = unique_slug(db, Collection, slugify(body.name))
    collection = Collection(**body.model_dump(exclude={"slug", "product_ids"}), slug=slug)
    collection.products = _products(db, body.product_ids)
    db.add(collection)
    db.flush()
    record_audit(
        db, admin, "collection.create", "collection", collection.id,
        {"name": collection.name, "products": len(body.product_ids)},
    )
    db.commit()
    return _out(_get(db, collection.id))


@router.get("/{collection_id}", response_model=CollectionAdminOut)
def get_collection(collection_id: int, db: DbSession, _: CurrentAdmin) -> CollectionAdminOut:
    return _out(_get(db, collection_id))


@router.patch("/{collection_id}", response_model=CollectionAdminOut)
def update_collection(collection_id: int, body: CollectionIn, db: DbSession, admin: CurrentAdmin) -> CollectionAdminOut:
    collection = _get(db, collection_id)
    changes = body.model_dump(exclude_unset=True, exclude={"product_ids"})
    if changes.get("slug"):
        ensure_slug_free(db, Collection, changes["slug"], exclude_id=collection.id)
    else:
        changes.pop("slug", None)
    for key, value in changes.items():
        setattr(collection, key, value)
    if "product_ids" in body.model_fields_set:
        collection.products = _products(db, body.product_ids)
    record_audit(
        db, admin, "collection.update", "collection", collection.id,
        {**{k: str(v) for k, v in changes.items()}, "products": len(collection.products)},
    )
    db.commit()
    return _out(_get(db, collection.id))


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(collection_id: int, db: DbSession, admin: CurrentAdmin) -> None:
    """Collections aren't referenced by orders, so they can be deleted (products are untouched)."""
    collection = _get(db, collection_id)
    record_audit(db, admin, "collection.delete", "collection", collection.id, {"name": collection.name})
    db.delete(collection)
    db.commit()
