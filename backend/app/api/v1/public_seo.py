from xml.sax.saxutils import escape

from fastapi import APIRouter, Response
from sqlalchemy import or_, select

from app.api.deps import DbSession
from app.core.config import get_settings
from app.models import Category, Product
from app.models.enums import ProductStatus

router = APIRouter(tags=["seo"])

STATIC_PATHS = [
    "/", "/shop", "/pages/about", "/pages/contact", "/pages/delivery", "/pages/returns",
    "/pages/privacy", "/pages/terms", "/pages/size-guide",
]


@router.get("/seo/sitemap.xml", response_class=Response)
def sitemap(db: DbSession) -> Response:
    """Sitemap of public storefront pages. Serve it at <site>/sitemap.xml (see DEPLOYMENT.md)."""
    base = get_settings().site_url.rstrip("/")
    urls: list[tuple[str, str | None]] = [(base + path, None) for path in STATIC_PATHS]

    for slug in db.scalars(select(Category.slug).where(Category.is_active.is_(True)).order_by(Category.sort_order)):
        urls.append((f"{base}/shop/{slug}", None))
    products = db.execute(
        select(Product.slug, Product.updated_at)
        .outerjoin(Category, Product.category_id == Category.id)
        .where(Product.status == ProductStatus.ACTIVE)
        .where(or_(Product.category_id.is_(None), Category.is_active.is_(True)))
        .order_by(Product.id)
    ).all()
    for slug, updated in products:
        urls.append((f"{base}/products/{slug}", updated.date().isoformat()))

    body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        body.append(f"  <url><loc>{escape(loc)}</loc>" + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "") + "</url>")
    body.append("</urlset>")
    return Response("\n".join(body), media_type="application/xml", headers={"Cache-Control": "public, max-age=3600"})
