from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AdminAuditLog, ProductVariant, StockMovement
from tests.test_catalog import make_product
from tests.test_checkout import order_body

ADMIN = "/api/v1/admin"


@pytest.fixture
def variant(client: TestClient, auth_headers: dict) -> int:
    product = make_product(
        client, auth_headers, base_price="100.00",
        variants=[{"sku": "TEE-M", "colour": "Black", "size": "M", "initial_stock": 10}],
    )
    return product["variants"][0]["id"]


@pytest.fixture
def order(client: TestClient, variant: int) -> dict:
    """A placed order for 2 × QAR 100 + QAR 15 delivery = QAR 215, returned as admin detail."""
    res = client.post("/api/v1/orders", json=order_body([{"variant_id": variant, "quantity": 2}]))
    assert res.status_code == 201
    return res.json()


def order_id(client: TestClient, headers: dict) -> int:
    return client.get(f"{ADMIN}/orders", headers=headers).json()["items"][0]["id"]


def stock(db: Session, variant_id: int) -> tuple[int, int]:
    db.expire_all()
    v = db.get(ProductVariant, variant_id)
    return v.stock_quantity, v.reserved_quantity


def set_status(client, headers, oid, status, **extra):
    return client.patch(f"{ADMIN}/orders/{oid}/status", json={"status": status, **extra}, headers=headers)


def test_order_endpoints_require_auth(client: TestClient) -> None:
    assert client.get(f"{ADMIN}/orders").status_code == 401
    assert client.get(f"{ADMIN}/dashboard").status_code == 401


def test_list_search_and_filter(client: TestClient, auth_headers: dict, order: dict) -> None:
    res = client.get(f"{ADMIN}/orders", headers=auth_headers)
    assert res.status_code == 200
    row = res.json()["items"][0]
    assert row["order_number"] == order["order_number"]
    assert row["customer_phone"] == "+97455123456"
    assert row["item_count"] == 2

    def found(**params) -> int:
        return client.get(f"{ADMIN}/orders", params=params, headers=auth_headers).json()["total"]

    assert found(q="aisha") == 1
    assert found(q="5512 3456") == 1
    assert found(q=order["order_number"][-5:]) == 1
    assert found(q="nobody") == 0
    assert found(status="PLACED") == 1
    assert found(status="CANCELLED") == 0
    assert found(payment_status="PAID") == 0


def test_full_happy_path_confirm_deliver_collect(
    client: TestClient, auth_headers: dict, order: dict, variant: int, db: Session
) -> None:
    oid = order_id(client, auth_headers)
    assert stock(db, variant) == (10, 2)

    detail = client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers).json()
    assert detail["order_status"] == "CONFIRMED" and detail["confirmed_at"]
    assert detail["allowed_transitions"] == ["PREPARING", "OUT_FOR_DELIVERY", "CANCELLED"]

    admins = client.get(f"{ADMIN}/admins", headers=auth_headers).json()
    detail = client.post(f"{ADMIN}/orders/{oid}/assign", json={"admin_id": admins[0]["id"]}, headers=auth_headers).json()
    assert detail["assigned_admin"]["name"] == "Founder One"

    assert set_status(client, auth_headers, oid, "PREPARING").status_code == 200
    assert set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY").status_code == 200

    detail = set_status(client, auth_headers, oid, "DELIVERED").json()
    assert detail["order_status"] == "DELIVERED"
    # Delivered is not paid until cash is recorded.
    assert detail["payment_status"] == "PENDING"
    assert detail["balance_due"] == "215.00"
    assert stock(db, variant) == (8, 0)  # reserved units became sold

    res = client.post(f"{ADMIN}/orders/{oid}/payments", json={"type": "COD_COLLECTION", "amount": "215.00"}, headers=auth_headers)
    assert res.status_code == 201
    detail = res.json()
    assert detail["payment_status"] == "PAID"
    assert detail["balance_due"] == "0.00"
    assert detail["payments"][0]["recorded_by"]["name"] == "Founder One"
    assert [h["new_status"] for h in detail["history"]] == [
        "PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED",
    ]
    sold = db.scalars(select(StockMovement).where(StockMovement.movement_type == "SOLD")).all()
    assert [m.quantity_change for m in sold] == [-2]


def test_deliver_and_collect_in_one_step(client: TestClient, auth_headers: dict, order: dict) -> None:
    oid = order_id(client, auth_headers)
    client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
    set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    detail = set_status(client, auth_headers, oid, "DELIVERED", collect_cash=True).json()
    assert detail["payment_status"] == "PAID"
    assert detail["amount_collected"] == "215.00"


def test_invalid_transitions_are_rejected(client: TestClient, auth_headers: dict, order: dict) -> None:
    oid = order_id(client, auth_headers)
    res = set_status(client, auth_headers, oid, "DELIVERED")
    assert res.status_code == 409
    assert "Cannot change status from PLACED to DELIVERED" in res.json()["detail"]
    assert set_status(client, auth_headers, oid, "PLACED").status_code == 409


def test_cancel_requires_reason_and_releases_stock(
    client: TestClient, auth_headers: dict, order: dict, variant: int, db: Session
) -> None:
    oid = order_id(client, auth_headers)
    assert client.post(f"{ADMIN}/orders/{oid}/cancel", json={"reason": ""}, headers=auth_headers).status_code == 422
    assert set_status(client, auth_headers, oid, "CANCELLED").status_code == 422

    detail = client.post(f"{ADMIN}/orders/{oid}/cancel", json={"reason": "Customer unreachable"}, headers=auth_headers).json()
    assert detail["order_status"] == "CANCELLED"
    assert detail["cancellation_reason"] == "Customer unreachable"
    assert detail["allowed_transitions"] == []
    assert detail["balance_due"] == "0.00"
    assert stock(db, variant) == (10, 0)
    released = db.scalars(select(StockMovement).where(StockMovement.movement_type == "RELEASED")).all()
    assert [m.quantity_change for m in released] == [-2]

    # A cancelled order can't be cancelled again (no double release).
    assert client.post(f"{ADMIN}/orders/{oid}/cancel", json={"reason": "again"}, headers=auth_headers).status_code == 409
    assert stock(db, variant) == (10, 0)


def test_failed_delivery_keeps_reservation_and_can_retry(
    client: TestClient, auth_headers: dict, order: dict, variant: int, db: Session
) -> None:
    oid = order_id(client, auth_headers)
    client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
    set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    assert set_status(client, auth_headers, oid, "DELIVERY_FAILED").status_code == 422  # needs reason
    detail = set_status(client, auth_headers, oid, "DELIVERY_FAILED", reason="No answer at door").json()
    assert detail["delivery_failure_reason"] == "No answer at door"
    assert stock(db, variant) == (10, 2)
    assert set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY").status_code == 200


def test_payment_rules(client: TestClient, auth_headers: dict, order: dict) -> None:
    oid = order_id(client, auth_headers)
    pay = lambda body: client.post(f"{ADMIN}/orders/{oid}/payments", json=body, headers=auth_headers)

    # Not collectable before dispatch.
    assert pay({"type": "COD_COLLECTION", "amount": "215.00"}).status_code == 409
    client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
    set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    set_status(client, auth_headers, oid, "DELIVERED")

    assert pay({"type": "COD_COLLECTION", "amount": "300.00"}).status_code == 422  # more than total
    assert pay({"type": "COD_COLLECTION", "amount": "-5"}).status_code == 422
    assert pay({"type": "ADJUSTMENT", "amount": "5"}).status_code == 422

    partial = pay({"type": "COD_COLLECTION", "amount": "200.00"}).json()
    assert partial["payment_status"] == "PENDING" and partial["balance_due"] == "15.00"
    paid = pay({"type": "COD_COLLECTION", "amount": "15.00"}).json()
    assert paid["payment_status"] == "PAID"

    assert pay({"type": "REFUND", "amount": "500.00"}).status_code == 422
    part_refund = pay({"type": "REFUND", "amount": "100.00", "notes": "Returned one tee"}).json()
    assert part_refund["payment_status"] == "PARTIALLY_REFUNDED"
    full_refund = pay({"type": "REFUND", "amount": "115.00"}).json()
    assert full_refund["payment_status"] == "REFUNDED"


def test_cannot_cancel_with_cash_held(client: TestClient, auth_headers: dict, order: dict) -> None:
    oid = order_id(client, auth_headers)
    client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
    set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    client.post(f"{ADMIN}/orders/{oid}/payments", json={"type": "COD_COLLECTION", "amount": "50"}, headers=auth_headers)
    set_status(client, auth_headers, oid, "DELIVERY_FAILED", reason="Customer refused")
    res = client.post(f"{ADMIN}/orders/{oid}/cancel", json={"reason": "Refused"}, headers=auth_headers)
    assert res.status_code == 409


def test_notes_and_audit_trail(client: TestClient, auth_headers: dict, order: dict, db: Session) -> None:
    oid = order_id(client, auth_headers)
    detail = client.patch(f"{ADMIN}/orders/{oid}/notes", json={"internal_notes": "Prefers evening"}, headers=auth_headers).json()
    assert detail["internal_notes"] == "Prefers evening"
    client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
    actions = db.scalars(select(AdminAuditLog.action).where(AdminAuditLog.entity_type == "order")).all()
    assert actions == ["order.notes", "order.status"]


def test_dashboard_separates_order_value_from_cash(
    client: TestClient, auth_headers: dict, variant: int
) -> None:
    # Order A: delivered and paid. Order B: cancelled. Order C: delivered, unpaid.
    ids = []
    for _ in range(3):
        client.post("/api/v1/orders", json=order_body([{"variant_id": variant, "quantity": 1}]))
    ids = [o["id"] for o in client.get(f"{ADMIN}/orders", headers=auth_headers).json()["items"]]
    a, b, c = ids
    for oid in (a, c):
        client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=auth_headers)
        set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    set_status(client, auth_headers, a, "DELIVERED", collect_cash=True)
    set_status(client, auth_headers, c, "DELIVERED")
    client.post(f"{ADMIN}/orders/{b}/cancel", json={"reason": "Changed mind"}, headers=auth_headers)

    d = client.get(f"{ADMIN}/dashboard", headers=auth_headers).json()
    assert d["orders_placed"] == 3
    assert Decimal(d["gross_order_value"]) == Decimal("345.00")  # 3 × 115
    assert d["orders_cancelled"] == 1 and Decimal(d["cancelled_order_value"]) == Decimal("115.00")
    assert d["orders_delivered"] == 2
    assert Decimal(d["cash_collected"]) == Decimal("115.00")
    assert Decimal(d["cod_outstanding"]) == Decimal("115.00") and d["cod_outstanding_orders"] == 1
    assert d["orders_new"] == 0

    report = client.get(f"{ADMIN}/reports/sales", headers=auth_headers).json()
    assert report["totals"]["orders_placed"] == 3
    assert Decimal(report["totals"]["cash_collected"]) == Decimal("115.00")
    assert {s["status"]: s["count"] for s in report["by_status"]} == {"DELIVERED": 2, "CANCELLED": 1}
