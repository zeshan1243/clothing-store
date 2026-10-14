"""Load demo categories, a size guide and products for local development.

Usage:
    python -m scripts.seed_demo

Safe to re-run: does nothing if any product already exists. Images are placeholders.
"""

import sys
from decimal import Decimal
from urllib.parse import quote

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import Category, Product, ProductImage, ProductVariant, SizeGuide, StockMovement
from app.models.enums import ProductStatus, StockMovementType

SIZES = ["S", "M", "L", "XL"]

CATEGORIES = [
    ("Hoodies", "hoodies", "Heavyweight hoodies and zip-ups."),
    ("T-Shirts", "t-shirts", "Oversized and boxy tees."),
    ("Pants", "pants", "Cargos, joggers and denim."),
    ("Accessories", "accessories", "Caps, bags and more."),
]

# Arabic names for the demo catalogue (slug -> (name, description)).
CATEGORIES_AR = {
    "hoodies": ("هوديز", "هوديز ثقيلة وسترات بسحّاب."),
    "t-shirts": ("تيشيرتات", "تيشيرتات واسعة وبقصّة مربعة."),
    "pants": ("بناطيل", "كارغو وجوغرز وجينز."),
    "accessories": ("إكسسوارات", "قبعات وحقائب والمزيد."),
}
PRODUCTS_AR = {
    "Essential Oversized Hoodie": "هودي أساسي واسع",
    "Desert Zip Hoodie": "هودي الصحراء بسحّاب",
    "Doha Skyline Tee": "تيشيرت أفق الدوحة",
    "Blank Boxy Tee": "تيشيرت سادة بقصّة مربعة",
    "Corniche Graphic Tee": "تيشيرت الكورنيش المطبوع",
    "Utility Cargo Pants": "بنطال كارغو عملي",
    "Relaxed Joggers": "جوغرز مريح",
    "Logo Dad Cap": "قبعة الشعار",
}

# name, category slug, base price, sale price, featured, new, colours [(name, hex)], description
PRODUCTS = [
    ("Essential Oversized Hoodie", "hoodies", "220", None, True, True, [("Black", "#111111"), ("Bone", "#e7e1d6")],
     "450gsm brushed-back cotton fleece with a dropped shoulder and double-layer hood."),
    ("Desert Zip Hoodie", "hoodies", "260", "210", True, False, [("Sand", "#c8b38a")],
     "Full-zip hoodie in a washed sand colour. Relaxed fit."),
    ("Doha Skyline Tee", "t-shirts", "95", None, True, True, [("White", "#ffffff"), ("Black", "#111111")],
     "Heavyweight 240gsm boxy tee with a screen-printed skyline graphic."),
    ("Blank Boxy Tee", "t-shirts", "70", None, False, True, [("Black", "#111111"), ("Olive", "#5b5f3a"), ("White", "#ffffff")],
     "The everyday boxy tee. Pre-shrunk, ribbed collar."),
    ("Corniche Graphic Tee", "t-shirts", "110", "85", False, False, [("Navy", "#1e2a44")],
     "Back print inspired by evenings on the Corniche."),
    ("Utility Cargo Pants", "pants", "240", None, True, True, [("Black", "#111111"), ("Khaki", "#8a7f5a")],
     "Relaxed cargo with six pockets and adjustable hems."),
    ("Relaxed Joggers", "pants", "160", None, False, False, [("Grey", "#9a9a9a")],
     "Fleece joggers with a tapered leg."),
    ("Logo Dad Cap", "accessories", "75", None, False, True, [("Black", "#111111"), ("Bone", "#e7e1d6")],
     "Washed cotton cap with an embroidered logo. One size."),
]


def placeholder(name: str, colour_hex: str) -> str:
    bg = colour_hex.lstrip("#")
    fg = "111111" if bg in {"ffffff", "e7e1d6", "c8b38a"} else "ffffff"
    return f"https://placehold.co/800x1000/{bg}/{fg}/png?text={quote(name)}"


def main() -> int:
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Product)):
            print("Products already exist; skipping demo seed.")
            return 0

        categories = {}
        for index, (name, slug, description) in enumerate(CATEGORIES):
            category = db.scalar(select(Category).where(Category.slug == slug))
            if category is None:
                name_ar, description_ar = CATEGORIES_AR.get(slug, (None, None))
                category = Category(
                    name=name, name_ar=name_ar, slug=slug, description=description,
                    description_ar=description_ar, sort_order=index,
                )
                db.add(category)
            categories[slug] = category

        guide = SizeGuide(
            name="Tops — oversized",
            content={
                "unit": "cm",
                "columns": ["Size", "Chest", "Length", "Sleeve"],
                "rows": [["S", "112", "70", "58"], ["M", "118", "72", "60"], ["L", "124", "74", "62"], ["XL", "130", "76", "64"]],
            },
            notes="Measured flat and doubled. Oversized fit — size down for a regular fit.",
        )
        db.add(guide)
        db.flush()

        for name, cat_slug, base, sale, featured, new, colours, description in PRODUCTS:
            product = Product(
                name=name,
                name_ar=PRODUCTS_AR.get(name),
                slug=name.lower().replace(" ", "-"),
                description=description,
                category=categories[cat_slug],
                size_guide=guide if cat_slug in {"hoodies", "t-shirts"} else None,
                base_price=Decimal(base),
                sale_price=Decimal(sale) if sale else None,
                status=ProductStatus.ACTIVE,
                is_featured=featured,
                is_new_arrival=new,
            )
            db.add(product)
            for index, (colour, hex_) in enumerate(colours):
                product.images.append(
                    ProductImage(image_url=placeholder(name, hex_), alt_text=f"{name} in {colour}", colour=colour, sort_order=index)
                )
            sizes = ["ONE SIZE"] if cat_slug == "accessories" else SIZES
            prefix = "".join(word[0] for word in name.split()).upper()
            for c_index, (colour, hex_) in enumerate(colours):
                for s_index, size in enumerate(sizes):
                    # Vary stock so the demo shows in-stock, low-stock and sold-out variants.
                    stock = (c_index * 3 + s_index * 2 + len(name)) % 9
                    variant = ProductVariant(
                        product=product,
                        sku=f"{prefix}-{colour[:3].upper()}-{size.replace(' ', '')}",
                        colour=colour,
                        colour_hex=hex_,
                        size=size,
                        size_sort_order=s_index,
                        stock_quantity=stock,
                    )
                    db.add(variant)
                    db.flush()
                    if stock:
                        db.add(StockMovement(
                            product_variant_id=variant.id,
                            movement_type=StockMovementType.RECEIVED,
                            quantity_change=stock,
                            reason="Demo seed",
                        ))
        db.commit()
        print(f"Seeded {len(CATEGORIES)} categories and {len(PRODUCTS)} products.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
