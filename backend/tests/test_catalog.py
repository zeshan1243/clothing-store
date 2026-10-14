from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StockMovement

ADMIN = "/api/v1/admin"
PUBLIC = "/api/v1"


def make_category(client: TestClient, headers: dict, name: str = "Hoodies", **extra) -> dict:
    res = client.post(f"{ADMIN}/categories", json={"name": name, **extra}, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def make_product(client: TestClient, headers: dict, **overrides) -> dict:
    body = {
        "name": "Oversized Hoodie",
        "base_price": "180.00",
        "status": "ACTIVE",
        "images": [{"image_url": "https://cdn.example.com/hoodie.jpg"}],
        "variants": [
            {"sku": "HD-BLK-M", "colour": "Black", "colour_hex": "#000000", "size": "m", "initial_stock": 5},
            {"sku": "HD-BLK-L", "colour": "Black", "colour_hex": "#000000", "size": "L", "initial_stock": 0},
        ],
        **overrides,
    }
    res = client.post(f"{ADMIN}/products", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_admin_catalogue_endpoints_require_auth(client: TestClient) -> None:
    assert client.get(f"{ADMIN}/products").status_code == 401
    assert client.post(f"{ADMIN}/categories", json={"name": "X"}).status_code == 401
    assert client.get(f"{ADMIN}/inventory").status_code == 401


def test_create_product_with_variants_records_initial_stock(
    client: TestClient, auth_headers: dict, db: Session
) -> None:
    category = make_category(client, auth_headers)
    product = make_product(client, auth_headers, category_id=category["id"])

    assert product["slug"] == "oversized-hoodie"
    medium = next(v for v in product["variants"] if v["sku"] == "HD-BLK-M")
    assert medium["size"] == "M"
    assert medium["stock_quantity"] == 5
    assert medium["available_quantity"] == 5

    movements = db.scalars(select(StockMovement)).all()
    assert [(m.movement_type, m.quantity_change) for m in movements] == [("RECEIVED", 5)]


def test_duplicate_slugs_get_suffix_and_duplicate_sku_is_rejected(client: TestClient, auth_headers: dict) -> None:
    make_product(client, auth_headers)
    second = make_product(client, auth_headers, variants=[{"sku": "HD2-M", "colour": "Grey", "size": "M"}])
    assert second["slug"] == "oversized-hoodie-2"

    res = client.post(
        f"{ADMIN}/products",
        json={"name": "Clash", "base_price": "10", "variants": [{"sku": "hd-blk-m", "colour": "Red", "size": "S"}]},
        headers=auth_headers,
    )
    assert res.status_code == 409


def test_sale_price_must_be_below_base_price(client: TestClient, auth_headers: dict) -> None:
    res = client.post(
        f"{ADMIN}/products", json={"name": "Tee", "base_price": "50", "sale_price": "60"}, headers=auth_headers
    )
    assert res.status_code == 422

    product = make_product(client, auth_headers)
    res = client.patch(f"{ADMIN}/products/{product['id']}", json={"sale_price": "200"}, headers=auth_headers)
    assert res.status_code == 422


def test_patch_updates_fields_and_upserts_variants(client: TestClient, auth_headers: dict) -> None:
    product = make_product(client, auth_headers)
    medium = next(v for v in product["variants"] if v["sku"] == "HD-BLK-M")

    res = client.patch(
        f"{ADMIN}/products/{product['id']}",
        json={
            "sale_price": "150.00",
            "variants": [
                {"id": medium["id"], "sku": "HD-BLK-M", "colour": "Black", "size": "M", "is_active": False},
                {"sku": "HD-WHT-M", "colour": "White", "size": "M", "initial_stock": 2},
            ],
        },
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["sale_price"] == "150.00"
    by_sku = {v["sku"]: v for v in body["variants"]}
    assert by_sku["HD-BLK-M"]["is_active"] is False
    assert by_sku["HD-BLK-M"]["stock_quantity"] == 5  # stock untouched by product edits
    assert by_sku["HD-WHT-M"]["stock_quantity"] == 2

    # Clearing the sale price with an explicit null.
    res = client.patch(f"{ADMIN}/products/{product['id']}", json={"sale_price": None}, headers=auth_headers)
    assert res.json()["sale_price"] is None


def test_public_listing_shows_only_active_products_in_active_categories(
    client: TestClient, auth_headers: dict
) -> None:
    visible_cat = make_category(client, auth_headers, "Tees")
    hidden_cat = make_category(client, auth_headers, "Hidden", is_active=False)
    make_product(client, auth_headers, name="Visible Tee", category_id=visible_cat["id"])
    make_product(client, auth_headers, name="Draft Tee", status="DRAFT", variants=[])
    make_product(client, auth_headers, name="Hidden Cat Tee", category_id=hidden_cat["id"], variants=[])

    res = client.get(f"{PUBLIC}/products")
    assert res.status_code == 200
    names = [p["name"] for p in res.json()["items"]]
    assert names == ["Visible Tee"]
    assert [c["slug"] for c in client.get(f"{PUBLIC}/categories").json()] == ["tees"]

    assert client.get(f"{PUBLIC}/products/draft-tee").status_code == 404


def test_public_filters_sorting_and_card_fields(client: TestClient, auth_headers: dict) -> None:
    tees = make_category(client, auth_headers, "Tees")
    make_product(client, auth_headers, name="Cheap Tee", base_price="50", category_id=tees["id"],
                 variants=[{"sku": "CT-M", "colour": "White", "size": "M", "initial_stock": 0}])
    make_product(client, auth_headers, name="Sale Hoodie", base_price="200", sale_price="40")

    by_price = client.get(f"{PUBLIC}/products", params={"sort": "price_asc"}).json()["items"]
    assert [p["name"] for p in by_price] == ["Sale Hoodie", "Cheap Tee"]
    assert by_price[0]["price"] == "40.00"
    assert by_price[0]["in_stock"] is True
    assert by_price[1]["in_stock"] is False

    in_tees = client.get(f"{PUBLIC}/products", params={"category": "tees"}).json()
    assert in_tees["total"] == 1 and in_tees["items"][0]["name"] == "Cheap Tee"

    search = client.get(f"{PUBLIC}/products", params={"q": "hood"}).json()
    assert [p["name"] for p in search["items"]] == ["Sale Hoodie"]


def test_public_detail_hides_inactive_variants_and_stock_internals(client: TestClient, auth_headers: dict) -> None:
    product = make_product(client, auth_headers)
    large = next(v for v in product["variants"] if v["sku"] == "HD-BLK-L")
    client.patch(
        f"{ADMIN}/products/{product['id']}",
        json={"variants": [{"id": large["id"], "sku": "HD-BLK-L", "colour": "Black", "size": "L", "is_active": False}]},
        headers=auth_headers,
    )

    detail = client.get(f"{PUBLIC}/products/oversized-hoodie").json()
    assert [v["sku"] for v in detail["variants"]] == ["HD-BLK-M"]
    assert detail["variants"][0]["available_quantity"] == 5
    assert "stock_quantity" not in detail["variants"][0]
    assert "reserved_quantity" not in detail["variants"][0]


def test_stock_adjustments_are_recorded_and_cannot_go_negative(
    client: TestClient, auth_headers: dict, db: Session
) -> None:
    product = make_product(client, auth_headers)
    medium = next(v for v in product["variants"] if v["sku"] == "HD-BLK-M")

    res = client.post(
        f"{ADMIN}/inventory/adjustments",
        json={"product_variant_id": medium["id"], "movement_type": "ADJUSTMENT", "quantity_change": -2, "reason": "Damaged in storage"},
        headers=auth_headers,
    )
    assert res.status_code == 201, res.text
    assert res.json()["created_by_name"] == "Founder One"

    res = client.post(
        f"{ADMIN}/inventory/adjustments",
        json={"product_variant_id": medium["id"], "movement_type": "ADJUSTMENT", "quantity_change": -10, "reason": "Too many"},
        headers=auth_headers,
    )
    assert res.status_code == 409

    res = client.post(
        f"{ADMIN}/inventory/adjustments",
        json={"product_variant_id": medium["id"], "movement_type": "RECEIVED", "quantity_change": -1, "reason": "Wrong sign"},
        headers=auth_headers,
    )
    assert res.status_code == 422

    history = client.get(f"{ADMIN}/inventory/variants/{medium['id']}/movements", headers=auth_headers).json()
    assert [(m["movement_type"], m["quantity_change"]) for m in history] == [("ADJUSTMENT", -2), ("RECEIVED", 5)]


def test_adjustment_cannot_remove_reserved_stock(client: TestClient, auth_headers: dict, db: Session) -> None:
    from app.models import ProductVariant

    product = make_product(client, auth_headers)
    medium_id = next(v["id"] for v in product["variants"] if v["sku"] == "HD-BLK-M")
    variant = db.get(ProductVariant, medium_id)
    variant.reserved_quantity = 4  # held by open orders
    db.commit()

    res = client.post(
        f"{ADMIN}/inventory/adjustments",
        json={"product_variant_id": medium_id, "movement_type": "ADJUSTMENT", "quantity_change": -2, "reason": "Recount"},
        headers=auth_headers,
    )
    assert res.status_code == 409


def test_low_stock_report(client: TestClient, auth_headers: dict) -> None:
    make_product(client, auth_headers)  # M has 5, L has 0; default threshold is 3
    rows = client.get(f"{ADMIN}/inventory", params={"low_stock_only": True}, headers=auth_headers).json()
    assert [r["sku"] for r in rows] == ["HD-BLK-L"]


def test_listing_filters_by_size_colour_price_and_stock(client: TestClient, auth_headers: dict) -> None:
    tees = make_category(client, auth_headers, "Tees")
    make_product(client, auth_headers, name="Black Tee", base_price="80", category_id=tees["id"], variants=[
        {"sku": "BT-S", "colour": "Black", "colour_hex": "#000000", "size": "S", "initial_stock": 0},
        {"sku": "BT-M", "colour": "Black", "colour_hex": "#000000", "size": "M", "initial_stock": 4},
    ])
    make_product(client, auth_headers, name="White Hoodie", base_price="220", variants=[
        {"sku": "WH-L", "colour": "White", "colour_hex": "#ffffff", "size": "L", "initial_stock": 2},
    ], images=[{"image_url": "https://cdn.example.com/a.jpg"}, {"image_url": "https://cdn.example.com/b.jpg"}])

    def names(**params) -> list[str]:
        return sorted(p["name"] for p in client.get(f"{PUBLIC}/products", params=params).json()["items"])

    assert names(size="M") == ["Black Tee"]
    assert names(size=["s", "l"]) == ["Black Tee", "White Hoodie"]
    assert names(colour="white") == ["White Hoodie"]
    assert names(size="S", in_stock=True) == []  # S exists but is sold out
    assert names(min_price="100") == ["White Hoodie"]
    assert names(max_price="100") == ["Black Tee"]

    hoodie = next(p for p in client.get(f"{PUBLIC}/products").json()["items"] if p["name"] == "White Hoodie")
    assert hoodie["total_available"] == 2
    assert hoodie["hover_image_url"] == "https://cdn.example.com/b.jpg"
    assert names(exclude=hoodie["id"]) == ["Black Tee"]

    facets = client.get(f"{PUBLIC}/products/facets").json()
    assert facets["sizes"] == ["S", "M", "L"]
    assert [c["name"] for c in facets["colours"]] == ["Black", "White"]
    assert (facets["min_price"], facets["max_price"]) == ("80.00", "220.00")
    assert client.get(f"{PUBLIC}/products/facets", params={"category": "tees"}).json()["sizes"] == ["S", "M"]


def test_facets_respect_hidden_categories(client: TestClient, auth_headers: dict) -> None:
    hidden = make_category(client, auth_headers, "Hidden", is_active=False)
    make_product(client, auth_headers, name="Secret", category_id=hidden["id"],
                 variants=[{"sku": "SEC-XL", "colour": "Red", "size": "XL"}])
    facets = client.get(f"{PUBLIC}/products/facets").json()
    assert facets["sizes"] == [] and facets["colours"] == []


def test_category_tile_image_falls_back_to_a_product_photo(client: TestClient, auth_headers: dict) -> None:
    hoodies = client.post(f"{ADMIN}/categories", json={"name": "Hoodies"}, headers=auth_headers).json()
    caps = client.post(
        f"{ADMIN}/categories", json={"name": "Caps", "image_url": "https://cdn.example.com/caps-tile.jpg"}, headers=auth_headers
    ).json()
    client.post(f"{ADMIN}/categories", json={"name": "Empty"}, headers=auth_headers)
    make_product(client, auth_headers, category_id=hoodies["id"])
    make_product(
        client, auth_headers, name="Cap", category_id=caps["id"],
        images=[{"image_url": "https://cdn.example.com/cap.jpg"}],
        variants=[{"sku": "CAP-1", "colour": "Black", "size": "One size", "initial_stock": 1}],
    )
    covers = {c["name"]: c["cover_image_url"] for c in client.get("/api/v1/categories").json()}
    assert covers == {
        "Hoodies": "https://cdn.example.com/hoodie.jpg",  # product photo
        "Caps": "https://cdn.example.com/caps-tile.jpg",  # admin-chosen image wins
        "Empty": None,
    }
    bad = client.post(f"{ADMIN}/categories", json={"name": "Bad", "image_url": "not a url"}, headers=auth_headers)
    assert bad.status_code == 422


def test_delete_unused_variant_but_not_one_with_orders(client: TestClient, auth_headers: dict) -> None:
    from tests.test_checkout import order_body

    product = make_product(client, auth_headers)
    medium, large = (v for v in product["variants"] if v["sku"] in ("HD-BLK-M", "HD-BLK-L"))
    url = f"{ADMIN}/products/{product['id']}/variants"
    assert client.delete(f"{url}/{large['id']}").status_code == 401

    # Never ordered → can be deleted, together with its initial-stock movement.
    res = client.delete(f"{url}/{large['id']}", headers=auth_headers)
    assert res.status_code == 200, res.text
    assert [v["sku"] for v in res.json()["variants"]] == ["HD-BLK-M"]

    # Once ordered it must stay (orders keep pointing at it).
    assert client.post("/api/v1/orders", json=order_body([{"variant_id": medium["id"], "quantity": 1}])).status_code == 201
    blocked = client.delete(f"{url}/{medium['id']}", headers=auth_headers)
    assert blocked.status_code == 409 and "Active" in blocked.json()["detail"]

    assert client.delete(f"{url}/999999", headers=auth_headers).status_code == 404
