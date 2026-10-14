import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProductVariant, StockMovement
from tests.test_catalog import make_product

ADMIN = "/api/v1/admin"


@pytest.fixture
def supplier(client: TestClient, auth_headers: dict) -> dict:
    res = client.post(
        f"{ADMIN}/suppliers",
        json={"name": "Lahore Textiles", "phone": "+92 300 1234567", "email": "", "default_currency": "pkr"},
        headers=auth_headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
def variant_id(client: TestClient, auth_headers: dict) -> int:
    product = make_product(client, auth_headers, variants=[{"sku": "HD-M", "colour": "Black", "size": "M"}])
    return product["variants"][0]["id"]


def create_bill(client, headers, supplier_id, **overrides) -> dict:
    body = {
        "supplier_id": supplier_id,
        "supplier_reference": "LT-0042",
        "bill_date": "2026-10-01",
        "due_date": "2026-11-01",
        "currency": "PKR",
        "total_amount": "250000.00",
        **overrides,
    }
    res = client.post(f"{ADMIN}/supplier-bills", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_supplier_endpoints_require_auth(client: TestClient) -> None:
    assert client.get(f"{ADMIN}/suppliers").status_code == 401
    assert client.get(f"{ADMIN}/supplier-bills").status_code == 401


def test_supplier_created_with_normalised_currency(supplier: dict) -> None:
    assert supplier["default_currency"] == "PKR"
    assert supplier["email"] is None
    assert supplier["balances"] == []


def test_partial_payments_update_balance_and_status(client: TestClient, auth_headers: dict, supplier: dict) -> None:
    bill = create_bill(client, auth_headers, supplier["id"])
    assert bill["status"] == "UNPAID" and bill["outstanding_amount"] == "250000.00"

    pay = lambda body: client.post(f"{ADMIN}/supplier-bills/{bill['id']}/payments", json=body, headers=auth_headers)
    res = pay({"amount": "100000.00", "exchange_rate_to_qar": "0.0131", "payment_reference": "Bank TT 1"})
    assert res.status_code == 201, res.text
    detail = res.json()
    assert detail["status"] == "PARTIALLY_PAID"
    assert detail["outstanding_amount"] == "150000.00"
    assert detail["payments"][0]["amount_qar"] == "1310.00"
    assert detail["payments"][0]["recorded_by"] == "Founder One"

    assert pay({"amount": "200000.00"}).status_code == 422  # more than outstanding
    detail = pay({"amount": "150000.00", "amount_qar": "1950.00"}).json()
    assert detail["status"] == "PAID" and detail["outstanding_amount"] == "0.00"
    assert detail["payments"][1]["exchange_rate_to_qar"] == "0.01300000"

    balances = client.get(f"{ADMIN}/suppliers/{supplier['id']}", headers=auth_headers).json()["balances"]
    assert balances == [{"currency": "PKR", "billed": "250000.00", "paid": "250000.00", "outstanding": "0.00", "overdue": "0.00"}]


def test_balances_are_per_currency_and_overdue_is_flagged(client: TestClient, auth_headers: dict, supplier: dict) -> None:
    create_bill(client, auth_headers, supplier["id"], bill_date="2026-01-01", due_date="2026-02-01")
    create_bill(client, auth_headers, supplier["id"], currency="QAR", total_amount="800.00", due_date=None)

    s = client.get(f"{ADMIN}/suppliers/{supplier['id']}", headers=auth_headers).json()
    by_currency = {b["currency"]: b for b in s["balances"]}
    assert by_currency["PKR"]["outstanding"] == "250000.00"
    assert by_currency["PKR"]["overdue"] == "250000.00"
    assert by_currency["QAR"]["outstanding"] == "800.00"
    assert s["open_bills"] == 2

    dashboard = client.get(f"{ADMIN}/dashboard", headers=auth_headers).json()
    assert {d["currency"]: d["amount"] for d in dashboard["supplier_outstanding"]} == {"PKR": "250000.00", "QAR": "800.00"}

    overdue = client.get(f"{ADMIN}/supplier-bills", params={"outstanding_only": True}, headers=auth_headers).json()
    assert sorted(b["is_overdue"] for b in overdue) == [False, True]


def test_receiving_bill_items_adds_linked_stock(
    client: TestClient, auth_headers: dict, supplier: dict, variant_id: int, db: Session
) -> None:
    bill = create_bill(
        client, auth_headers, supplier["id"],
        items=[
            {"product_variant_id": variant_id, "description": "Hoodie black M", "quantity": 20, "unit_cost": "4500"},
            {"description": "Packaging bags", "quantity": 100},
        ],
    )
    assert bill["items_pending"] == 20
    hoodie = next(i for i in bill["items"] if i["product_variant_id"])
    bags = next(i for i in bill["items"] if not i["product_variant_id"])
    assert hoodie["sku"] == "HD-M"

    receive = lambda lines: client.post(f"{ADMIN}/supplier-bills/{bill['id']}/receive", json={"lines": lines}, headers=auth_headers)
    assert receive([{"item_id": hoodie["id"], "quantity": 12}]).status_code == 200
    assert receive([{"item_id": hoodie["id"], "quantity": 9}]).status_code == 422  # only 8 left
    assert receive([{"item_id": bags["id"], "quantity": 1}]).status_code == 422  # not a variant
    detail = receive([{"item_id": hoodie["id"], "quantity": 8}]).json()
    assert detail["items_pending"] == 0

    assert db.get(ProductVariant, variant_id).stock_quantity == 20
    movements = db.scalars(select(StockMovement).where(StockMovement.related_supplier_bill_id == bill["id"])).all()
    assert [m.quantity_change for m in movements] == [12, 8]


def test_receive_now_on_creation(client: TestClient, auth_headers: dict, supplier: dict, variant_id: int, db: Session) -> None:
    create_bill(
        client, auth_headers, supplier["id"], receive_now=True,
        items=[{"product_variant_id": variant_id, "description": "Hoodie", "quantity": 5}],
    )
    assert db.get(ProductVariant, variant_id).stock_quantity == 5


def test_bill_validation(client: TestClient, auth_headers: dict, supplier: dict) -> None:
    base = {"supplier_id": supplier["id"], "bill_date": "2026-10-01", "currency": "PKR", "total_amount": "100"}
    post = lambda **kw: client.post(f"{ADMIN}/supplier-bills", json={**base, **kw}, headers=auth_headers)
    assert post(due_date="2026-09-01").status_code == 422
    assert post(total_amount="0").status_code == 422
    assert post(currency="rupees").status_code == 422
    assert post(supplier_id=999).status_code == 422
    assert post(items=[{"product_variant_id": 999, "description": "x", "quantity": 1}]).status_code == 422


def test_supplier_payables_do_not_touch_sales_figures(client: TestClient, auth_headers: dict, supplier: dict) -> None:
    bill = create_bill(client, auth_headers, supplier["id"], currency="QAR", total_amount="500.00")
    client.post(f"{ADMIN}/supplier-bills/{bill['id']}/payments", json={"amount": "500.00"}, headers=auth_headers)
    d = client.get(f"{ADMIN}/dashboard", headers=auth_headers).json()
    assert d["cash_collected"] == "0" or float(d["cash_collected"]) == 0
    assert d["refunds_paid"] == "0" or float(d["refunds_paid"]) == 0
