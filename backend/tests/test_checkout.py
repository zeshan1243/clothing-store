import secrets
import threading
from decimal import Decimal

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.public_orders import order_rate_limiter
from app.core.db import SessionLocal
from app.models import Customer, Order, OrderStatusHistory, ProductVariant, StockMovement
from app.schemas.orders import OrderCreate
from app.services.checkout import place_order
from tests.test_catalog import make_product

ORDERS = "/api/v1/orders"


@pytest.fixture
def product(client: TestClient, auth_headers: dict) -> dict:
    return make_product(
        client,
        auth_headers,
        base_price="180.00",
        sale_price="150.00",
        variants=[
            {"sku": "HD-BLK-M", "colour": "Black", "size": "M", "initial_stock": 5},
            {"sku": "HD-BLK-L", "colour": "Black", "size": "L", "initial_stock": 1},
        ],
    )


def variant_id(product: dict, sku: str) -> int:
    return next(v["id"] for v in product["variants"] if v["sku"] == sku)


def order_body(items: list[dict], **overrides) -> dict:
    body = {
        "idempotency_key": secrets.token_urlsafe(16),
        "customer": {"full_name": "Aisha Khan", "phone": "5512 3456", "email": ""},
        "delivery": {"area": "Test Town", "zone": "38", "street": "Al Sadd St", "building": "12", "landmark": ""},
        "items": items,
    }
    body.update(overrides)
    return body


def test_quote_uses_server_prices_and_flags_stock_problems(client: TestClient, product: dict) -> None:
    res = client.post(
        "/api/v1/cart/quote",
        json={"items": [
            {"variant_id": variant_id(product, "HD-BLK-M"), "quantity": 2},
            {"variant_id": variant_id(product, "HD-BLK-L"), "quantity": 3},
            {"variant_id": 999999, "quantity": 1},
        ], "delivery_area": "test town"},
    )
    assert res.status_code == 200
    body = res.json()
    lines = body["lines"]
    assert lines[0]["unit_price"] == "150.00" and lines[0]["line_total"] == "300.00"
    assert lines[1]["problem"] == "Only 1 left." and lines[1]["quantity"] == 1
    assert lines[2]["problem"] == "This item is no longer available."
    assert body["ok"] is False
    assert body["subtotal"] == "450.00"
    assert body["delivery_fee"] == "15.00"
    assert body["grand_total"] == "465.00"


def test_place_order_snapshots_reserves_and_records_history(
    client: TestClient, product: dict, db: Session
) -> None:
    medium = variant_id(product, "HD-BLK-M")
    # Extra price fields from the browser must be ignored.
    body = order_body([{"variant_id": medium, "quantity": 2, "unit_price": "0.01"}], grand_total="1.00")
    res = client.post(ORDERS, json=body)

    assert res.status_code == 201, res.text
    data = res.json()
    assert data["order_number"].startswith("ORD-") and data["order_number"].endswith("-00001")
    assert data["grand_total"] == "315.00"  # 2 × 150 + 15 delivery
    assert data["payment_method"] == "COD"
    assert data["payment_status"] == "PENDING"
    assert data["order_status"] == "PLACED"
    assert data["customer_first_name"] == "Aisha"
    assert "customer_phone" not in data and "delivery_street" not in data

    order = db.scalar(select(Order))
    assert order.customer_phone == "+97455123456"
    assert order.customer_email is None
    assert order.items[0].product_name == "Oversized Hoodie"
    assert order.items[0].unit_price == Decimal("150.00")

    variant = db.get(ProductVariant, medium)
    assert (variant.stock_quantity, variant.reserved_quantity) == (5, 2)
    reserved = db.scalars(select(StockMovement).where(StockMovement.movement_type == "RESERVED")).all()
    assert [(m.quantity_change, m.related_order_id) for m in reserved] == [(2, order.id)]
    history = db.scalars(select(OrderStatusHistory)).all()
    assert [(h.old_status, h.new_status) for h in history] == [(None, "PLACED")]


def test_orders_are_numbered_sequentially_and_reuse_customer_by_phone(
    client: TestClient, product: dict, db: Session
) -> None:
    medium = variant_id(product, "HD-BLK-M")
    first = client.post(ORDERS, json=order_body([{"variant_id": medium, "quantity": 1}])).json()
    second_body = order_body([{"variant_id": medium, "quantity": 1}])
    second_body["customer"] = {"full_name": "Aisha K.", "phone": "+974 5512 3456", "email": "a@example.com"}
    second = client.post(ORDERS, json=second_body).json()

    assert first["order_number"].endswith("-00001")
    assert second["order_number"].endswith("-00002")
    assert db.scalar(select(func.count()).select_from(Customer)) == 1
    customer = db.scalar(select(Customer))
    assert (customer.full_name, customer.email) == ("Aisha K.", "a@example.com")


def test_same_idempotency_key_returns_same_order_without_double_reserving(
    client: TestClient, product: dict, db: Session
) -> None:
    medium = variant_id(product, "HD-BLK-M")
    body = order_body([{"variant_id": medium, "quantity": 2}])

    first = client.post(ORDERS, json=body)
    again = client.post(ORDERS, json=body)

    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["order_number"] == again.json()["order_number"]
    assert db.scalar(select(func.count()).select_from(Order)) == 1
    assert db.get(ProductVariant, medium).reserved_quantity == 2


def test_insufficient_stock_is_rejected_and_nothing_is_reserved(
    client: TestClient, product: dict, db: Session
) -> None:
    large = variant_id(product, "HD-BLK-L")
    res = client.post(ORDERS, json=order_body([{"variant_id": large, "quantity": 2}]))

    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["problems"] == [
        {"variant_id": large, "problem": "Only 1 left.", "problem_code": "limited", "available_quantity": 1}
    ]
    assert db.scalar(select(func.count()).select_from(Order)) == 0
    assert db.get(ProductVariant, large).reserved_quantity == 0


def test_unpublished_or_inactive_items_cannot_be_ordered(
    client: TestClient, auth_headers: dict, product: dict
) -> None:
    client.patch(f"/api/v1/admin/products/{product['id']}", json={"status": "DRAFT"}, headers=auth_headers)
    res = client.post(ORDERS, json=order_body([{"variant_id": variant_id(product, "HD-BLK-M"), "quantity": 1}]))
    assert res.status_code == 409


@pytest.mark.parametrize(
    "phone, ok",
    [("55123456", True), ("+97433123456", True), ("00974 7012 3456", True),
     ("44123456", False), ("+923001234567", False), ("123", False)],
)
def test_qatar_mobile_validation(client: TestClient, product: dict, phone: str, ok: bool) -> None:
    body = order_body([{"variant_id": variant_id(product, "HD-BLK-M"), "quantity": 1}])
    body["customer"]["phone"] = phone
    res = client.post(ORDERS, json=body)
    assert (res.status_code == 201) is ok, res.text


def test_required_checkout_fields(client: TestClient, product: dict) -> None:
    medium = variant_id(product, "HD-BLK-M")
    assert client.post(ORDERS, json=order_body([])).status_code == 422
    body = order_body([{"variant_id": medium, "quantity": 1}])
    body["delivery"]["area"] = "  "
    assert client.post(ORDERS, json=body).status_code == 422
    body = order_body([{"variant_id": medium, "quantity": 1}], idempotency_key="short")
    assert client.post(ORDERS, json=body).status_code == 422


def test_concurrent_checkouts_cannot_oversell(client: TestClient, product: dict) -> None:
    """Five customers race for the last unit: exactly one order succeeds."""
    large = variant_id(product, "HD-BLK-L")  # stock 1
    barrier = threading.Barrier(5)
    results: list[str] = []

    def attempt() -> None:
        data = OrderCreate.model_validate(order_body([{"variant_id": large, "quantity": 1}]))
        with SessionLocal() as session:
            barrier.wait()
            try:
                place_order(session, data)
                results.append("ok")
            except HTTPException as exc:
                results.append(str(exc.status_code))

    threads = [threading.Thread(target=attempt) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == ["409", "409", "409", "409", "ok"]
    with SessionLocal() as session:
        variant = session.get(ProductVariant, large)
        assert (variant.stock_quantity, variant.reserved_quantity) == (1, 1)
        numbers = session.scalars(select(Order.order_number)).all()
        assert len(numbers) == 1


def test_confirmation_lookup_by_token(client: TestClient, product: dict) -> None:
    created = client.post(ORDERS, json=order_body([{"variant_id": variant_id(product, "HD-BLK-M"), "quantity": 1}])).json()

    res = client.get(f"{ORDERS}/{created['public_token']}")
    assert res.status_code == 200
    assert res.json()["order_number"] == created["order_number"]
    assert client.get(f"{ORDERS}/{'x' * 32}").status_code == 404
    assert client.get(f"{ORDERS}/1").status_code == 422  # never by sequential id


def test_order_creation_is_rate_limited(client: TestClient, product: dict) -> None:
    for _ in range(order_rate_limiter.max_requests):
        client.post(ORDERS, json=order_body([]))
    assert client.post(ORDERS, json=order_body([])).status_code == 429


def test_arabic_names_flow_from_catalogue_to_order_snapshot(client: TestClient, auth_headers: dict) -> None:
    from tests.test_catalog import make_category

    cat = make_category(client, auth_headers, "Hoodies", name_ar="هوديز")
    product = make_product(
        client, auth_headers, name="Desert Hoodie", name_ar="هودي الصحراء", description_ar="قطن ثقيل",
        category_id=cat["id"], variants=[{"sku": "DH-M", "colour": "Sand", "size": "M", "initial_stock": 3}],
    )
    assert product["name_ar"] == "هودي الصحراء"

    detail = client.get("/api/v1/products/desert-hoodie").json()
    assert (detail["name_ar"], detail["description_ar"], detail["category_name_ar"]) == ("هودي الصحراء", "قطن ثقيل", "هوديز")
    assert client.get("/api/v1/categories").json()[0]["name_ar"] == "هوديز"

    variant = product["variants"][0]["id"]
    quote = client.post("/api/v1/cart/quote", json={"items": [{"variant_id": variant, "quantity": 5}]}).json()
    assert quote["lines"][0]["product_name_ar"] == "هودي الصحراء"
    assert quote["lines"][0]["problem_code"] == "limited"

    order = client.post(ORDERS, json=order_body([{"variant_id": variant, "quantity": 1}])).json()
    assert order["items"][0]["product_name_ar"] == "هودي الصحراء"
