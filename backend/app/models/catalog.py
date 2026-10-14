from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import ProductStatus
from app.models.mixins import Money, TimestampMixin, enum_column


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # Optional Arabic translations; the storefront falls back to English when empty.
    name_ar: Mapped[str | None] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    # Tile image on the homepage; when empty the storefront uses a product photo from the category.
    image_url: Mapped[str | None] = mapped_column(String(1024))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class SizeGuide(TimestampMixin, Base):
    __tablename__ = "size_guides"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    # e.g. {"unit": "cm", "columns": ["Size", "Chest", "Length"], "rows": [["S", "96", "70"], ...]}
    content: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    notes: Mapped[str | None] = mapped_column(Text)


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("base_price >= 0", name="base_price_non_negative"),
        CheckConstraint(
            "sale_price IS NULL OR (sale_price >= 0 AND sale_price < base_price)",
            name="sale_price_below_base",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), index=True)
    size_guide_id: Mapped[int | None] = mapped_column(ForeignKey("size_guides.id"))
    name: Mapped[str] = mapped_column(String(160))
    name_ar: Mapped[str | None] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    base_price: Mapped[Decimal] = mapped_column(Money)
    sale_price: Mapped[Decimal | None] = mapped_column(Money)
    status: Mapped[ProductStatus] = mapped_column(
        enum_column(ProductStatus, "status"), default=ProductStatus.DRAFT, index=True
    )
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_new_arrival: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    meta_title: Mapped[str | None] = mapped_column(String(160))
    meta_description: Mapped[str | None] = mapped_column(String(320))

    category: Mapped[Category | None] = relationship(back_populates="products")
    size_guide: Mapped[SizeGuide | None] = relationship()
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", order_by="ProductImage.sort_order", cascade="all, delete-orphan"
    )
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", order_by="ProductVariant.id"
    )

    @property
    def effective_price(self) -> Decimal:
        return self.sale_price if self.sale_price is not None else self.base_price


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    image_url: Mapped[str] = mapped_column(String(1024))
    # Image CDN identifier (e.g. Cloudinary public_id) so the asset can be transformed or removed.
    public_id: Mapped[str | None] = mapped_column(String(255))
    alt_text: Mapped[str | None] = mapped_column(String(255))
    colour: Mapped[str | None] = mapped_column(String(60))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    product: Mapped[Product] = relationship(back_populates="images")


class ProductVariant(TimestampMixin, Base):
    """One row per product + colour + size.

    Inventory policy: `stock_quantity` is units physically on hand; `reserved_quantity` is units
    held by placed-but-undelivered orders. Available to sell = stock_quantity - reserved_quantity.
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "colour", "size", name="uq_product_variants_product_colour_size"),
        CheckConstraint("stock_quantity >= 0", name="stock_non_negative"),
        CheckConstraint("reserved_quantity >= 0", name="reserved_non_negative"),
        CheckConstraint("reserved_quantity <= stock_quantity", name="reserved_within_stock"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True)
    colour: Mapped[str] = mapped_column(String(60))
    colour_hex: Mapped[str | None] = mapped_column(String(7))
    size: Mapped[str] = mapped_column(String(20))
    size_sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    low_stock_threshold: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    product: Mapped[Product] = relationship(back_populates="variants")

    @property
    def available_quantity(self) -> int:
        return max(self.stock_quantity - self.reserved_quantity, 0)


# A product has one category but can sit in any number of collections (curated drops, edits, sets).
collection_products = Table(
    "collection_products",
    Base.metadata,
    Column("collection_id", ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", ForeignKey("products.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Collection(TimestampMixin, Base):
    """A hand-picked group of products, e.g. "Summer Drop 01" or "Eid Edit"."""

    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    name_ar: Mapped[str | None] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    # Banner on the collection page and homepage card; falls back to a product photo.
    image_url: Mapped[str | None] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Shown in the homepage "Collections" section.
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    products: Mapped[list[Product]] = relationship(secondary=collection_products, order_by="Product.id")
