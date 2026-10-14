import threading
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models import Coupon, CouponRedemption, Invoice, Order
from app.schemas.orders import OrderCreate
from app.services.checkout import place_order
from tests.test_catalog import make_product
from tests.test_checkout import order_body

ADMIN = "/api/v1/admin/coupons"
QUOTE = "/api/v1/cart/quote"
ORDERS = "/api/v1/orders"


@pytest.fixture
def variant(client: TestClient, auth_headers: dict) -> int:
    product = make_product(
        client, auth_headers, base_price="100.00",
        variants=[{"sku": "CP-M", "colour": "Black", "size": "M", "initial_stock": 20}],
    )
    return product["variants"][0]["id"]


def make_coupon(client: TestClient, headers: dict, **overrides) -> dict:
    body = {"code": "drop10", "discount_type": "PERCENT", "value": "10", **overrides}
    res = client.post(ADMIN, json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def quote(client: TestClient, variant: int, qty: int = 2, code: str | None = "DROP10") -> dict:
    res = client.post(QUOTE, json={"items": [{"variant_id": variant, "quantity": qty}], "coupon_code": code, "delivery_area": "Test Town"})
    assert res.status_code == 200, res.text
    return res.json()


def test_admin_creates_and_validates_coupons(client: TestClient, auth_headers: dict) -> None:
    c = make_coupon(client, auth_headers, description="Launch offer")
    assert c["code"] == "DROP10" and c["state"] == "active" and c["times_used"] == 0

    post = lambda **kw: client.post(ADMIN, json={"code": "X1Y", "discount_type": "PERCENT", "value": "10", **kw}, headers=auth_headers)
    assert client.post(ADMIN, json={"code": "Drop10", "discount_type": "FIXED", "value": "5"}, headers=auth_headers).status_code == 409
    assert post(value="150").status_code == 422
    assert post(discount_type="FIXED", value="0").status_code == 422
    assert post(code="no spaces").status_code == 422
    start = datetime.now(UTC)
    assert post(starts_at=start.isoformat(), ends_at=(start - timedelta(days=1)).isoformat()).status_code == 422

    generated = client.get(f"{ADMIN}/generate-code", headers=auth_headers).json()["code"]
    assert generated.startswith("DROP-") and len(generated) == 11

    listed = client.get(ADMIN, headers=auth_headers).json()
    assert [x["code"] for x in listed] == ["DROP10"]


def test_percent_coupon_with_cap_and_case_insensitive_code(client: TestClient, auth_headers: dict, variant: int) -> None:
    make_coupon(client, auth_headers, value="25", max_discount="30")
    q = quote(client, variant, qty=2, code=" drop10 ")  # subtotal 200 → 25% = 50, capped at 30
    assert q["coupon"]["code"] == "DROP10"
    assert (q["subtotal"], q["discount_amount"], q["delivery_fee"], q["grand_total"]) == ("200.00", "30.00", "15.00", "185.00")
    assert q["coupon_error"] is None


def test_fixed_coupon_never_exceeds_subtotal(client: TestClient, auth_headers: dict, variant: int) -> None:
    make_coupon(client, auth_headers, discount_type="FIXED", value="500")
    q = quote(client, variant, qty=1)
    assert (q["discount_amount"], q["grand_total"]) == ("100.00", "15.00")


def test_free_delivery_coupon_waives_fee(client: TestClient, auth_headers: dict, variant: int) -> None:
    make_coupon(client, auth_headers, code="FREESHIP", discount_type="FREE_DELIVERY")
    q = quote(client, variant, qty=1, code="FREESHIP")
    assert (q["delivery_fee"], q["discount_amount"], q["grand_total"]) == ("0.00", "0.00", "100.00")
    assert q["coupon"]["savings"] == "15.00"


@pytest.mark.parametrize(
    "overrides, error",
    [
        ({"is_active": False}, "inactive"),
        ({"starts_at": (datetime.now(UTC) + timedelta(days=1)).isoformat()}, "not_started"),
        ({"ends_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat()}, "expired"),
        ({"min_subtotal": "500"}, "min_subtotal"),
    ],
)
def test_coupon_rule_errors(client: TestClient, auth_headers: dict, variant: int, overrides: dict, error: str) -> None:
    make_coupon(client, auth_headers, **overrides)
    q = quote(client, variant)
    assert q["coupon"] is None
    assert q["coupon_error"]["code"] == error
    assert q["discount_amount"] == "0.00" and q["grand_total"] == "215.00"
    if error == "min_subtotal":
        assert q["coupon_error"]["min_subtotal"] == "500.00"


def test_unknown_code(client: TestClient, variant: int) -> None:
    assert quote(client, variant, code="NOPE")["coupon_error"]["code"] == "not_found"


def test_order_with_coupon_is_snapshotted_and_redeemed(
    client: TestClient, auth_headers: dict, variant: int, db: Session
) -> None:
    coupon = make_coupon(client, auth_headers)
    res = client.post(ORDERS, json=order_body([{"variant_id": variant, "quantity": 2}], coupon_code="drop10"))
    assert res.status_code == 201, res.text
    data = res.json()
    assert (data["discount_amount"], data["grand_total"], data["coupon_code"]) == ("20.00", "195.00", "DROP10")

    order = db.scalar(select(Order))
    assert order.coupon_id == coupon["id"]
    redemption = db.scalar(select(CouponRedemption))
    assert (redemption.order_id, str(redemption.discount_amount)) == (order.id, "20.00")
    assert db.get(Coupon, coupon["id"]).times_used == 1

    # The invoice carries the code next to the discount.
    client.post(f"/api/v1/admin/orders/{order.id}/confirm", json={}, headers=auth_headers)
    db.expire_all()
    assert db.scalar(select(Invoice)).snapshot["coupon_code"] == "DROP10"

    detail = client.get(f"{ADMIN}/{coupon['id']}", headers=auth_headers).json()
    assert detail["total_savings"] == "20.00"
    assert detail["redemptions"][0]["order_number"] == order.order_number

    # A used coupon can't be renamed (history would point at a different code).
    renamed = client.patch(f"{ADMIN}/{coupon['id']}", json={"code": "OTHER", "discount_type": "PERCENT", "value": "10"}, headers=auth_headers)
    assert renamed.status_code == 409


def test_invalid_coupon_blocks_order_and_reserves_nothing(client: TestClient, auth_headers: dict, variant: int, db: Session) -> None:
    make_coupon(client, auth_headers, min_subtotal="1000")
    res = client.post(ORDERS, json=order_body([{"variant_id": variant, "quantity": 1}], coupon_code="DROP10"))
    assert res.status_code == 409
    assert res.json()["detail"]["coupon_error"]["code"] == "min_subtotal"
    assert db.scalar(select(Order)) is None


def test_usage_limit_and_per_customer_limit(client: TestClient, auth_headers: dict, variant: int) -> None:
    make_coupon(client, auth_headers, code="ONCE", per_customer_limit=1)
    make_coupon(client, auth_headers, code="FIRST2", usage_limit=2)

    first = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="ONCE")
    assert client.post(ORDERS, json=first).status_code == 201
    again = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="ONCE")
    res = client.post(ORDERS, json=again)
    assert res.status_code == 409 and res.json()["detail"]["coupon_error"]["code"] == "customer_limit"
    other_customer = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="ONCE")
    other_customer["customer"]["phone"] = "3312 3456"
    assert client.post(ORDERS, json=other_customer).status_code == 201

    for phone in ("5500 0001", "5500 0002"):
        body = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="FIRST2")
        body["customer"]["phone"] = phone
        assert client.post(ORDERS, json=body).status_code == 201
    third = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="FIRST2")
    third["customer"]["phone"] = "5500 0003"
    res = client.post(ORDERS, json=third)
    assert res.status_code == 409 and res.json()["detail"]["coupon_error"]["code"] == "usage_limit"
    assert client.get(ADMIN, headers=auth_headers).json()[0]["state"] == "used_up"


def test_cancelling_an_order_gives_the_coupon_use_back(client: TestClient, auth_headers: dict, variant: int, db: Session) -> None:
    coupon = make_coupon(client, auth_headers, code="SINGLE", usage_limit=1)
    order = client.post(ORDERS, json=order_body([{"variant_id": variant, "quantity": 1}], coupon_code="SINGLE")).json()
    order_id = db.scalar(select(Order.id).where(Order.order_number == order["order_number"]))
    assert client.post(f"/api/v1/admin/orders/{order_id}/cancel", json={"reason": "Customer changed mind"}, headers=auth_headers).status_code == 200

    db.expire_all()
    assert db.get(Coupon, coupon["id"]).times_used == 0
    assert db.scalar(select(CouponRedemption)).voided_at is not None
    again = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="SINGLE")
    assert client.post(ORDERS, json=again).status_code == 201


def test_concurrent_orders_cannot_exceed_usage_limit(client: TestClient, auth_headers: dict, variant: int) -> None:
    make_coupon(client, auth_headers, code="FLASH", usage_limit=1)
    barrier = threading.Barrier(4)
    results: list[str] = []

    def attempt(i: int) -> None:
        body = order_body([{"variant_id": variant, "quantity": 1}], coupon_code="FLASH")
        body["customer"]["phone"] = f"5510 000{i}"
        data = OrderCreate.model_validate(body)
        with SessionLocal() as session:
            barrier.wait()
            try:
                place_order(session, data)
                results.append("ok")
            except HTTPException as exc:
                results.append(exc.detail["coupon_error"]["code"])

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == ["ok", "usage_limit", "usage_limit", "usage_limit"]
