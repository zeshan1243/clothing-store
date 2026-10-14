from fastapi.testclient import TestClient

from tests.test_catalog import make_product
from tests.test_checkout import order_body

TRACK = "/api/v1/orders/track"


def place(client: TestClient, auth_headers: dict) -> dict:
    product = make_product(
        client, auth_headers, base_price="100.00",
        variants=[{"sku": "TR-M", "colour": "Black", "size": "M", "initial_stock": 5}],
    )
    res = client.post("/api/v1/orders", json=order_body([{"variant_id": product["variants"][0]["id"], "quantity": 1}]))
    assert res.status_code == 201, res.text
    return res.json()


def test_track_needs_matching_number_and_phone(client: TestClient, auth_headers: dict) -> None:
    order = place(client, auth_headers)  # placed with phone 5512 3456
    number = order["order_number"]

    for variant in (number, number.lower(), number.removeprefix("ORD-"), f" {number} "):
        res = client.post(TRACK, json={"order_number": variant, "phone": "+974 5512 3456"})
        assert res.status_code == 200, (variant, res.text)
    data = res.json()
    assert data["public_token"] == order["public_token"]
    assert [s["status"] for s in data["timeline"]] == ["PLACED"]
    # No contact or address details beyond the area.
    assert "customer_phone" not in data and "delivery_street" not in data

    wrong_phone = client.post(TRACK, json={"order_number": number, "phone": "3312 3456"})
    wrong_number = client.post(TRACK, json={"order_number": "ORD-2026-99999", "phone": "5512 3456"})
    assert wrong_phone.status_code == wrong_number.status_code == 404
    assert wrong_phone.json() == wrong_number.json()

    assert client.post(TRACK, json={"order_number": "hello", "phone": "5512 3456"}).status_code == 422


def test_timeline_follows_status_changes(client: TestClient, auth_headers: dict) -> None:
    order = place(client, auth_headers)
    track = lambda: client.post(TRACK, json={"order_number": order["order_number"], "phone": "5512 3456"}).json()
    order_id = client.get("/api/v1/admin/orders", headers=auth_headers).json()["items"][0]["id"]

    client.post(f"/api/v1/admin/orders/{order_id}/confirm", json={"note": "secret internal note"}, headers=auth_headers)
    client.patch(f"/api/v1/admin/orders/{order_id}/status", json={"status": "PREPARING"}, headers=auth_headers)
    data = track()
    assert data["order_status"] == "PREPARING"
    assert [s["status"] for s in data["timeline"]] == ["PLACED", "CONFIRMED", "PREPARING"]
    assert "secret" not in str(data)

    # The token page returns the same timeline.
    assert client.get(f"/api/v1/orders/{order['public_token']}").json()["timeline"] == data["timeline"]


def test_tracking_is_rate_limited(client: TestClient) -> None:
    codes = [client.post(TRACK, json={"order_number": "ORD-2026-00001", "phone": "5512 3456"}).status_code for _ in range(11)]
    assert codes[:10] == [404] * 10 and codes[10] == 429
