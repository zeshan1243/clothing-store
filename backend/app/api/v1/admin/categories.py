from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import CurrentAdmin, DbSession
from app.models import Category, SizeGuide
from app.schemas.catalog import CategoryAdminOut, CategoryIn, SizeGuideAdminOut, SizeGuideIn
from app.services.audit import record_audit
from app.services.catalog import category_product_counts, ensure_slug_free, slugify, unique_slug

router = APIRouter(tags=["admin-catalog"])


def _category_out(category: Category, counts: dict[int, int]) -> CategoryAdminOut:
    out = CategoryAdminOut.model_validate(category)
    out.product_count = counts.get(category.id, 0)
    return out


@router.get("/categories", response_model=list[CategoryAdminOut])
def list_categories(db: DbSession, _: CurrentAdmin) -> list[CategoryAdminOut]:
    counts = category_product_counts(db)
    categories = db.scalars(select(Category).order_by(Category.sort_order, Category.name))
    return [_category_out(c, counts) for c in categories]


@router.post("/categories", response_model=CategoryAdminOut, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryIn, db: DbSession, admin: CurrentAdmin) -> CategoryAdminOut:
    if body.slug:
        ensure_slug_free(db, Category, body.slug)
        slug = body.slug
    else:
        slug = unique_slug(db, Category, slugify(body.name))
    category = Category(**body.model_dump(exclude={"slug"}), slug=slug)
    db.add(category)
    db.flush()
    record_audit(db, admin, "category.create", "category", category.id, {"name": category.name})
    db.commit()
    return _category_out(category, {})


@router.patch("/categories/{category_id}", response_model=CategoryAdminOut)
def update_category(category_id: int, body: CategoryIn, db: DbSession, admin: CurrentAdmin) -> CategoryAdminOut:
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    changes = body.model_dump(exclude_unset=True)
    if changes.get("slug"):
        ensure_slug_free(db, Category, changes["slug"], exclude_id=category.id)
    else:
        changes.pop("slug", None)
    for key, value in changes.items():
        setattr(category, key, value)
    record_audit(db, admin, "category.update", "category", category.id, {k: str(v) for k, v in changes.items()})
    db.commit()
    return _category_out(category, category_product_counts(db))


@router.get("/size-guides", response_model=list[SizeGuideAdminOut])
def list_size_guides(db: DbSession, _: CurrentAdmin) -> list[SizeGuide]:
    return list(db.scalars(select(SizeGuide).order_by(SizeGuide.name)))


@router.post("/size-guides", response_model=SizeGuideAdminOut, status_code=status.HTTP_201_CREATED)
def create_size_guide(body: SizeGuideIn, db: DbSession, admin: CurrentAdmin) -> SizeGuide:
    if db.scalar(select(SizeGuide.id).where(SizeGuide.name == body.name)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A size guide with this name already exists")
    guide = SizeGuide(**body.model_dump())
    db.add(guide)
    db.flush()
    record_audit(db, admin, "size_guide.create", "size_guide", guide.id, {"name": guide.name})
    db.commit()
    return guide


@router.patch("/size-guides/{guide_id}", response_model=SizeGuideAdminOut)
def update_size_guide(guide_id: int, body: SizeGuideIn, db: DbSession, admin: CurrentAdmin) -> SizeGuide:
    guide = db.get(SizeGuide, guide_id)
    if guide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Size guide not found")
    for key, value in body.model_dump().items():
        setattr(guide, key, value)
    record_audit(db, admin, "size_guide.update", "size_guide", guide.id, {"name": guide.name})
    db.commit()
    return guide
