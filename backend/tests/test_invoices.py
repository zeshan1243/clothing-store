from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Invoice, Product
from tests.test_admin_orders import order, order_id, set_status, variant  # noqa: F401  (fixtures)

ADMIN = "/api/v1/admin"


def confirm(client, headers, oid):
    return client.post(f"{ADMIN}/orders/{oid}/confirm", json={}, headers=headers)


def invoices(client, headers, oid) -> list[dict]:
    return client.get(f"{ADMIN}/orders/{oid}/invoices", headers=headers).json()


def test_invoice_issued_on_confirmation_with_its_own_number(
    client: TestClient, auth_headers: dict, order: dict  # noqa: F811
) -> None:
    oid = order_id(client, auth_headers)
    assert invoices(client, auth_headers, oid) == []
    confirm(client, auth_headers, oid)

    [inv] = invoices(client, auth_headers, oid)
    assert inv["invoice_number"].startswith("INV-") and inv["invoice_number"].endswith("-00001")
    assert inv["invoice_number"] != inv["order_number"]
    assert inv["invoice_type"] == "INVOICE" and inv["status"] == "ISSUED"
    assert inv["total"] == "215.00"

    # Issuing again is idempotent.
    again = client.post(f"{ADMIN}/orders/{oid}/invoice", headers=auth_headers).json()
    assert again["id"] == inv["id"]


def test_invoice_snapshot_is_unaffected_by_later_product_edits(
    client: TestClient, auth_headers: dict, order: dict, db: Session  # noqa: F811
) -> None:
    oid = order_id(client, auth_headers)
    confirm(client, auth_headers, oid)
    product_id = db.scalar(select(Product.id))
    client.patch(f"{ADMIN}/products/{product_id}", json={"name": "Renamed", "base_price": "999.00"}, headers=auth_headers)

    invoice = db.scalar(select(Invoice))
    assert invoice.snapshot["lines"][0]["description"] == "Oversized Hoodie"
    assert invoice.snapshot["lines"][0]["unit_price"] == "100.00"


def test_pdf_is_reproducible_and_reflects_payment(
    client: TestClient, auth_headers: dict, order: dict  # noqa: F811
) -> None:
    oid = order_id(client, auth_headers)
    confirm(client, auth_headers, oid)
    inv_id = invoices(client, auth_headers, oid)[0]["id"]

    first = client.get(f"{ADMIN}/invoices/{inv_id}/pdf", headers=auth_headers)
    second = client.get(f"{ADMIN}/invoices/{inv_id}/pdf", headers=auth_headers)
    assert first.status_code == 200
    assert first.headers["content-type"] == "application/pdf"
    assert first.headers["content-disposition"].startswith("inline")
    assert first.headers["cache-control"] == "no-store"
    assert first.content.startswith(b"%PDF") and first.content == second.content

    download = client.get(f"{ADMIN}/invoices/{inv_id}/pdf", params={"download": True}, headers=auth_headers)
    assert download.headers["content-disposition"].startswith("attachment")

    set_status(client, auth_headers, oid, "OUT_FOR_DELIVERY")
    set_status(client, auth_headers, oid, "DELIVERED", collect_cash=True)
    paid = client.get(f"{ADMIN}/invoices/{inv_id}/pdf", headers=auth_headers)
    assert paid.content != first.content  # receipt block added; invoice body unchanged

    assert client.get(f"{ADMIN}/invoices/{inv_id}/pdf").status_code == 401


def test_cancelling_invoiced_order_issues_full_credit_note(
    client: TestClient, auth_headers: dict, order: dict  # noqa: F811
) -> None:
    oid = order_id(client, auth_headers)
    confirm(client, auth_headers, oid)
    client.post(f"{ADMIN}/orders/{oid}/cancel", json={"reason": "Customer changed mind"}, headers=auth_headers)

    inv, note = invoices(client, auth_headers, oid)
    assert inv["status"] == "CREDITED" and inv["credited_amount"] == "215.00"
    assert note["invoice_type"] == "CREDIT_NOTE"
    assert note["invoice_number"].startswith("CN-")
    assert note["related_invoice_number"] == inv["invoice_number"]
    assert note["total"] == "215.00"
    assert "Customer changed mind" in note["reason"]
    pdf = client.get(f"{ADMIN}/invoices/{note['id']}/pdf", headers=auth_headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # A cancelled order can't be invoiced again.
    assert client.post(f"{ADMIN}/orders/{oid}/invoice", headers=auth_headers).status_code == 409


def test_partial_credit_notes_for_returns(
    client: TestClient, auth_headers: dict, order: dict  # noqa: F811
) -> None:
    oid = order_id(client, auth_headers)
    confirm(client, auth_headers, oid)
    inv_id = invoices(client, auth_headers, oid)[0]["id"]
    credit = lambda body: client.post(f"{ADMIN}/invoices/{inv_id}/credit-notes", json=body, headers=auth_headers)

    assert credit({"reason": "Returned one", "amount": "300.00"}).status_code == 422
    assert credit({"reason": "Returned one", "amount": "100.00"}).status_code == 201
    inv = invoices(client, auth_headers, oid)[0]
    assert inv["status"] == "ISSUED" and inv["credited_amount"] == "100.00"

    rest = credit({"reason": "Returned the rest"})
    assert rest.json()["total"] == "115.00"
    assert invoices(client, auth_headers, oid)[0]["status"] == "CREDITED"
    assert credit({"reason": "Again"}).status_code == 409


def test_shipping_label_has_no_prices(client: TestClient, auth_headers: dict, order: dict) -> None:  # noqa: F811
    oid = order_id(client, auth_headers)
    res = client.get(f"{ADMIN}/orders/{oid}/label.pdf", headers=auth_headers)
    assert res.status_code == 200 and res.content.startswith(b"%PDF")
    assert b"QAR" not in res.content and b"215" not in res.content
