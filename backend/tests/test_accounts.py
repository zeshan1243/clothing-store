from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Customer, Order
from tests.test_catalog import make_product
from tests.test_checkout import order_body

ACCOUNT = "/api/v1/account"
ADMIN = "/api/v1/admin/customers"
PHONE = "5512 3456"  # the phone order_body uses


def register(client: TestClient, phone: str = PHONE, password: str = "secret-pass-1", **extra) -> dict:
    res = client.post(f"{ACCOUNT}/register", json={"full_name": "Aisha Khan", "phone": phone, "password": password, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def auth(session: dict) -> dict:
    return {"Authorization": f"Bearer {session['token']}"}


def variant(client: TestClient, headers: dict) -> int:
    return make_product(client, headers, variants=[{"sku": "AC-M", "colour": "Black", "size": "M", "initial_stock": 20}])["variants"][0]["id"]


def test_register_login_profile_and_password(client: TestClient) -> None:
    session = register(client, email="aisha@example.com")
    assert session["customer"]["phone"] == "+97455123456" and session["customer"]["phone_verified"] is False

    assert client.post(f"{ACCOUNT}/register", json={"full_name": "X Y", "phone": "+974 5512 3456", "password": "another-pass"}).status_code == 409
    assert client.post(f"{ACCOUNT}/register", json={"full_name": "X Y", "phone": "5599 0000", "password": "short"}).status_code == 422

    bad = client.post(f"{ACCOUNT}/login", json={"phone": PHONE, "password": "wrong"})
    unknown = client.post(f"{ACCOUNT}/login", json={"phone": "3300 0000", "password": "secret-pass-1"})
    assert bad.status_code == unknown.status_code == 401 and bad.json() == unknown.json()
    login = client.post(f"{ACCOUNT}/login", json={"phone": "+97455123456", "password": "secret-pass-1"})
    assert login.status_code == 200

    me = client.patch(f"{ACCOUNT}/me", headers=auth(login.json()), json={
        "full_name": "Aisha K", "email": "", "default_address": {"area": "Al Sadd", "building": "12", "zone": ""},
    }).json()
    assert me["full_name"] == "Aisha K" and me["email"] is None
    assert me["default_address"]["area"] == "Al Sadd" and me["default_address"]["zone"] is None

    # Changing the password signs out older sessions.
    changed = client.post(f"{ACCOUNT}/change-password", headers=auth(login.json()),
                          json={"current_password": "secret-pass-1", "new_password": "new-secret-2"})
    assert changed.status_code == 200
    assert client.get(f"{ACCOUNT}/me", headers=auth(login.json())).status_code == 401
    assert client.get(f"{ACCOUNT}/me", headers=auth(changed.json())).status_code == 200
    assert client.post(f"{ACCOUNT}/change-password", headers=auth(changed.json()),
                       json={"current_password": "nope", "new_password": "whatever-123"}).status_code == 400


def test_customer_and_admin_tokens_are_not_interchangeable(client: TestClient, auth_headers: dict) -> None:
    session = register(client)
    assert client.get("/api/v1/admin/orders", headers=auth(session)).status_code == 401
    assert client.get(f"{ACCOUNT}/me", headers=auth_headers).status_code == 401


def test_order_history_rules(client: TestClient, auth_headers: dict, db: Session) -> None:
    vid = variant(client, auth_headers)
    # A guest order before registering…
    guest = client.post("/api/v1/orders", json=order_body([{"variant_id": vid, "quantity": 1}])).json()
    session = register(client)
    # …is not shown until an admin verifies the phone.
    assert client.get(f"{ACCOUNT}/orders", headers=auth(session)).json() == []

    # Signed-in order: phone comes from the account (body phone ignored) and it shows straight away.
    body = order_body([{"variant_id": vid, "quantity": 2}], save_address=True)
    body["customer"]["phone"] = "3300 1111"
    body["customer"]["full_name"] = "Somebody Else"
    signed = client.post("/api/v1/orders", json=body, headers=auth(session)).json()
    orders = client.get(f"{ACCOUNT}/orders", headers=auth(session)).json()
    assert [o["order_number"] for o in orders] == [signed["order_number"]]
    assert orders[0]["item_count"] == 2 and orders[0]["public_token"] == signed["public_token"]
    order = db.scalar(select(Order).where(Order.order_number == signed["order_number"]))
    assert order.customer_phone == "+97455123456" and order.placed_signed_in
    # The registered profile name isn't overwritten by checkout details; the address was saved.
    me = client.get(f"{ACCOUNT}/me", headers=auth(session)).json()
    assert me["full_name"] == "Aisha Khan" and me["default_address"]["area"] == "Test Town"

    # A later guest checkout with the same phone doesn't change the profile either.
    other = order_body([{"variant_id": vid, "quantity": 1}])
    other["customer"]["full_name"] = "Impostor"
    client.post("/api/v1/orders", json=other)
    assert client.get(f"{ACCOUNT}/me", headers=auth(session)).json()["full_name"] == "Aisha Khan"

    # Admin verifies the phone → earlier guest orders appear too.
    customer_id = session["customer"]["id"]
    client.patch(f"{ADMIN}/{customer_id}", headers=auth_headers,
                 json={"full_name": "Aisha Khan", "phone": PHONE, "phone_verified": True})
    numbers = [o["order_number"] for o in client.get(f"{ACCOUNT}/orders", headers=auth(session)).json()]
    assert guest["order_number"] in numbers and len(numbers) == 3


def test_admin_customer_management(client: TestClient, auth_headers: dict, db: Session) -> None:
    vid = variant(client, auth_headers)
    session = register(client)
    guest_body = order_body([{"variant_id": vid, "quantity": 1}])
    guest_body["customer"]["phone"] = "3300 2222"
    client.post("/api/v1/orders", json=guest_body)
    assert client.get(ADMIN).status_code == 401

    registered = client.get(ADMIN, headers=auth_headers).json()
    assert [c["phone"] for c in registered["items"]] == ["+97455123456"] and registered["items"][0]["registered"]
    guests = client.get(f"{ADMIN}?kind=guests", headers=auth_headers).json()
    assert [c["phone"] for c in guests["items"]] == ["+97433002222"] and guests["items"][0]["order_count"] == 1
    assert client.get(f"{ADMIN}?kind=all&q=2222", headers=auth_headers).json()["total"] == 1

    cid = session["customer"]["id"]
    # Reset password: temp password works once, flags a change, old sessions end.
    temp = client.post(f"{ADMIN}/{cid}/reset-password", headers=auth_headers).json()["temporary_password"]
    assert len(temp) == 10
    assert client.get(f"{ACCOUNT}/me", headers=auth(session)).status_code == 401
    relogin = client.post(f"{ACCOUNT}/login", json={"phone": PHONE, "password": temp}).json()
    assert relogin["customer"]["must_change_password"] is True

    # Phone clash on edit.
    clash = client.patch(f"{ADMIN}/{cid}", headers=auth_headers, json={"full_name": "Aisha", "phone": "3300 2222"})
    assert clash.status_code == 409

    # Delete the account: login gone, orders and customer record stay.
    deleted = client.delete(f"{ADMIN}/{cid}/account", headers=auth_headers).json()
    assert deleted["registered"] is False
    assert client.get(f"{ACCOUNT}/me", headers=auth(relogin)).status_code == 401
    assert client.post(f"{ACCOUNT}/login", json={"phone": PHONE, "password": temp}).status_code == 401
    assert db.get(Customer, cid) is not None
    # They can register again later.
    register(client, password="fresh-pass-9")
