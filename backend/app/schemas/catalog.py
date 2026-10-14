import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    TypeAdapter,
    ValidationError,
    model_validator,
)

from app.models.enums import ProductStatus, StockMovementType

Price = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


def _slug(value: str) -> str:
    slug = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or len(slug) > 180:
        raise ValueError("Use lowercase letters, numbers and single dashes (e.g. oversized-hoodie)")
    return slug


Slug = Annotated[str, AfterValidator(_slug)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
HexColour = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^#[0-9a-fA-F]{6}$")]
Sku = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=64)]


_http_url = TypeAdapter(HttpUrl)


def _valid_url(value: str) -> str:
    """Validate as an http(s) URL but keep it a plain string (clean serialisation)."""
    try:
        return str(_http_url.validate_python(value))
    except ValidationError as exc:
        raise ValueError("Enter a valid http(s) image URL") from exc


ImageUrl = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1024), AfterValidator(_valid_url)]


# ---------- Public storefront ----------


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_ar: str | None = None
    slug: str
    description: str | None
    description_ar: str | None = None
    image_url: str | None = None
    # image_url, or else a photo of one of the category's products (public listing only).
    cover_image_url: str | None = None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    alt_text: str | None
    colour: str | None
    sort_order: int


class ColourOption(BaseModel):
    name: str
    hex: str | None


class PublicVariantOut(BaseModel):
    id: int
    sku: str
    colour: str
    colour_hex: str | None
    size: str
    available_quantity: int


class SizeGuideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    content: dict


class ProductCardOut(BaseModel):
    id: int
    name: str
    name_ar: str | None = None
    slug: str
    price: Decimal
    base_price: Decimal
    sale_price: Decimal | None
    category_slug: str | None
    image_url: str | None
    image_alt: str | None
    # Second image, shown on hover on desktop.
    hover_image_url: str | None = None
    colours: list[ColourOption]
    in_stock: bool
    # Units available across all active variants (drives "Only N left").
    total_available: int = 0
    is_new_arrival: bool


class ProductDetailOut(ProductCardOut):
    description: str | None
    description_ar: str | None = None
    category_name: str | None
    category_name_ar: str | None = None
    meta_title: str | None
    meta_description: str | None
    images: list[ImageOut]
    variants: list[PublicVariantOut]
    size_guide: SizeGuideOut | None


class ProductPage(BaseModel):
    items: list[ProductCardOut]
    total: int
    page: int
    page_size: int


ProductSort = Literal["newest", "price_asc", "price_desc", "name"]


class ProductFacets(BaseModel):
    """Filter options available for a listing (sizes/colours of visible, active variants)."""

    sizes: list[str]
    colours: list[ColourOption]
    min_price: Decimal | None
    max_price: Decimal | None


# ---------- Admin: categories & size guides ----------


OptionalArabic = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=160)]


class CategoryIn(BaseModel):
    name: Name
    name_ar: OptionalArabic = None
    slug: Slug | None = None
    description: str | None = None
    description_ar: str | None = None
    image_url: ImageUrl | None = None
    sort_order: int = 0
    is_active: bool = True


class CategoryAdminOut(CategoryOut):
    sort_order: int
    is_active: bool
    product_count: int = 0


class SizeGuideIn(BaseModel):
    name: Name
    content: dict = Field(description='e.g. {"unit": "cm", "columns": [...], "rows": [[...]]}')
    notes: str | None = None


class SizeGuideAdminOut(SizeGuideOut):
    notes: str | None


# ---------- Admin: products ----------


class ImageIn(BaseModel):
    image_url: ImageUrl
    alt_text: str | None = Field(default=None, max_length=255)
    colour: str | None = Field(default=None, max_length=60)
    sort_order: int = 0


class VariantIn(BaseModel):
    """Upsert a variant. Omit `id` to create; stock changes go through inventory adjustments."""

    id: int | None = None
    sku: Sku
    colour: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    colour_hex: HexColour | None = None
    size: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=1, max_length=20)]
    size_sort_order: int = 0
    low_stock_threshold: int | None = Field(default=None, ge=0)
    is_active: bool = True
    initial_stock: int = Field(default=0, ge=0, description="Only used when creating a variant")


class _ProductFields(BaseModel):
    @model_validator(mode="after")
    def check_variants_and_price(self):
        variants = getattr(self, "variants", None) or []
        combos = [(v.colour.lower(), v.size) for v in variants]
        if len(combos) != len(set(combos)):
            raise ValueError("Each colour + size combination may only appear once")
        skus = [v.sku for v in variants]
        if len(skus) != len(set(skus)):
            raise ValueError("SKUs must be unique")
        base, sale = getattr(self, "base_price", None), getattr(self, "sale_price", None)
        if base is not None and sale is not None and sale >= base:
            raise ValueError("Sale price must be lower than the regular price")
        return self


class ProductCreate(_ProductFields):
    name: Name
    name_ar: OptionalArabic = None
    slug: Slug | None = None
    description: str | None = None
    description_ar: str | None = None
    category_id: int | None = None
    size_guide_id: int | None = None
    base_price: Price
    sale_price: Price | None = None
    status: ProductStatus = ProductStatus.DRAFT
    is_featured: bool = False
    is_new_arrival: bool = False
    meta_title: str | None = Field(default=None, max_length=160)
    meta_description: str | None = Field(default=None, max_length=320)
    images: list[ImageIn] = []
    variants: list[VariantIn] = []


class ProductUpdate(_ProductFields):
    """PATCH: only provided fields change. `images`, if given, replaces the image list.
    `variants`, if given, upserts by id (existing variants not listed are left unchanged)."""

    name: Name | None = None
    name_ar: OptionalArabic = None
    slug: Slug | None = None
    description: str | None = None
    description_ar: str | None = None
    category_id: int | None = None
    size_guide_id: int | None = None
    base_price: Price | None = None
    sale_price: Price | None = None
    status: ProductStatus | None = None
    is_featured: bool | None = None
    is_new_arrival: bool | None = None
    meta_title: str | None = Field(default=None, max_length=160)
    meta_description: str | None = Field(default=None, max_length=320)
    images: list[ImageIn] | None = None
    variants: list[VariantIn] | None = None


class VariantAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sku: str
    colour: str
    colour_hex: str | None
    size: str
    size_sort_order: int
    low_stock_threshold: int | None
    is_active: bool
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int


class ProductAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_ar: str | None
    slug: str
    description: str | None
    description_ar: str | None
    category_id: int | None
    size_guide_id: int | None
    base_price: Decimal
    sale_price: Decimal | None
    status: ProductStatus
    is_featured: bool
    is_new_arrival: bool
    meta_title: str | None
    meta_description: str | None
    images: list[ImageOut]
    variants: list[VariantAdminOut]
    created_at: datetime
    updated_at: datetime


class ProductAdminListItem(BaseModel):
    id: int
    name: str
    slug: str
    status: ProductStatus
    category_name: str | None
    base_price: Decimal
    sale_price: Decimal | None
    image_url: str | None
    variant_count: int
    stock_on_hand: int
    available: int
    is_featured: bool
    is_new_arrival: bool
    updated_at: datetime


# ---------- Admin: inventory ----------


class InventoryRow(BaseModel):
    variant_id: int
    product_id: int
    product_name: str
    product_status: ProductStatus
    sku: str
    colour: str
    size: str
    stock_quantity: int
    reserved_quantity: int
    available_quantity: int
    low_stock_threshold: int
    is_low_stock: bool
    is_active: bool


AdjustableMovement = Literal[
    StockMovementType.RECEIVED, StockMovementType.ADJUSTMENT, StockMovementType.RETURN
]


class StockAdjustmentIn(BaseModel):
    product_variant_id: int
    movement_type: AdjustableMovement
    quantity_change: int = Field(description="Positive adds stock, negative removes it")
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]

    @model_validator(mode="after")
    def check_direction(self):
        if self.quantity_change == 0:
            raise ValueError("Quantity change cannot be zero")
        if self.movement_type in (StockMovementType.RECEIVED, StockMovementType.RETURN) and self.quantity_change < 0:
            raise ValueError("Received and returned stock must be a positive quantity")
        return self


class StockMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_variant_id: int
    movement_type: StockMovementType
    quantity_change: int
    related_order_id: int | None
    reason: str | None
    created_by_admin_id: int | None
    created_by_name: str | None = None
    created_at: datetime


# ---------- Collections ----------


class CollectionOut(BaseModel):
    """Public collection card / page header."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_ar: str | None = None
    slug: str
    description: str | None = None
    description_ar: str | None = None
    image_url: str | None = None
    # image_url, or else a photo of one of its products.
    cover_image_url: str | None = None
    product_count: int = 0


class CollectionIn(BaseModel):
    name: Name
    name_ar: OptionalArabic = None
    slug: Slug | None = None
    description: str | None = None
    description_ar: str | None = None
    image_url: ImageUrl | None = None
    is_active: bool = True
    is_featured: bool = False
    sort_order: int = 0
    product_ids: Annotated[list[int], Field(max_length=500)] = []


class CollectionAdminOut(CollectionOut):
    is_active: bool
    is_featured: bool
    sort_order: int
    product_ids: list[int] = []
    updated_at: datetime
