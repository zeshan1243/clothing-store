from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Order
from tests.test_catalog import make_product
from tests.test_checkout import order_body

ADMIN = "/api/v1/admin/delivery-areas"


def variant(client: TestClient, headers: dict) -> int:
    product = make_product(
        client, headers, base_price="100.00",
        variants=[{"sku": "DL-M", "colour": "Black", "size": "M", "initial_stock": 10}],
    )
    return product["variants"][0]["id"]


def quote(client: TestClient, vid: int, area: str | None) -> dict:
    res = client.post("/api/v1/cart/quote", json={"items": [{"variant_id": vid, "quantity": 1}], "delivery_area": area})
    assert res.status_code == 200, res.text
    return res.json()


def test_public_areas_list_fees(client: TestClient) -> None:
    areas = {a["name"]: a for a in client.get("/api/v1/delivery-areas").json()}
    assert areas["Al Sadd"]["fee"] == "0.00" and areas["Al Sadd"]["is_free"]
    assert areas["Test Town"]["fee"] == "15.00"  # 10 + ceil(25 / 5) × 1
    assert areas["Al Khor"]["fee"] == "20.00"  # 10 + 50 / 5 × 1
    assert list(areas)[0] == "Al Sadd"  # free zone first


def test_fee_depends_on_area(client: TestClient, auth_headers: dict) -> None:
    vid = variant(client, auth_headers)
    assert (q := quote(client, vid, None))["delivery_fee"] == "0.00" and q["delivery_area"] is None
    assert quote(client, vid, "al sadd")["delivery_fee"] == "0.00"
    khor = quote(client, vid, "Al Khor")
    assert (khor["delivery_fee"], khor["grand_total"], khor["delivery_area"]["distance_km"]) == ("20.00", "120.00", 50)
    # Partial blocks round up: 52 km → 11 blocks → QAR 21.
    client.post(ADMIN, json={"name": "Far Farm", "distance_km": 52}, headers=auth_headers)
    assert quote(client, vid, "Far Farm")["delivery_fee"] == "21.00"
    assert quote(client, vid, "Nowhere")["delivery_area"] is None


def test_order_requires_a_known_area_and_snapshots_distance(client: TestClient, auth_headers: dict, db: Session) -> None:
    vid = variant(client, auth_headers)
    bad = client.post("/api/v1/orders", json=order_body([{"variant_id": vid, "quantity": 1}], delivery={"area": "Atlantis"}))
    assert bad.status_code == 422 and "delivery area" in bad.json()["detail"]["message"]

    body = order_body([{"variant_id": vid, "quantity": 1}])
    body["delivery"]["area"] = "al khor"
    res = client.post("/api/v1/orders", json=body)
    assert res.status_code == 201, res.text
    assert (res.json()["delivery_fee"], res.json()["grand_total"], res.json()["delivery_area"]) == ("20.00", "120.00", "Al Khor")
    order = db.scalar(select(Order))
    assert order.delivery_distance_km == 50

    # Editing the area later doesn't change the placed order.
    khor = next(a for a in client.get(ADMIN, headers=auth_headers).json()["areas"] if a["name"] == "Al Khor")
    client.patch(f"{ADMIN}/{khor['id']}", json={"name": "Al Khor", "distance_km": 55}, headers=auth_headers)
    db.expire_all()
    assert db.scalar(select(Order)).delivery_fee == 20


def test_admin_manages_areas(client: TestClient, auth_headers: dict) -> None:
    assert client.get(ADMIN).status_code == 401
    page = client.get(ADMIN, headers=auth_headers).json()
    assert page["rates"] == {"outside_base_fee": "10.00", "fee_per_step": "1.00", "step_km": 5}

    created = client.post(ADMIN, json={"name": "Zekreet", "name_ar": "زكريت", "distance_km": 90}, headers=auth_headers)
    assert created.status_code == 201 and created.json()["fee"] == "28.00"
    assert client.post(ADMIN, json={"name": "zekreet", "distance_km": 1}, headers=auth_headers).status_code == 409

    area = created.json()
    hidden = client.patch(f"{ADMIN}/{area['id']}", json={**area, "is_active": False}, headers=auth_headers).json()
    assert hidden["is_active"] is False
    assert "Zekreet" not in [a["name"] for a in client.get("/api/v1/delivery-areas").json()]

    made_free = client.patch(f"{ADMIN}/{area['id']}", json={**area, "is_free": True}, headers=auth_headers).json()
    assert made_free["fee"] == "0.00"


def test_fixed_fee_overrides_distance(client: TestClient, auth_headers: dict) -> None:
    vid = variant(client, auth_headers)
    khor = next(a for a in client.get(ADMIN, headers=auth_headers).json()["areas"] if a["name"] == "Al Khor")
    assert (khor["fee"], khor["distance_fee"], khor["fixed_fee"]) == ("20.00", "20.00", None)

    body = {"name": "Al Khor", "distance_km": 50, "fixed_fee": "25"}
    updated = client.patch(f"{ADMIN}/{khor['id']}", json=body, headers=auth_headers).json()
    assert (updated["fee"], updated["distance_fee"], updated["fixed_fee"]) == ("25.00", "20.00", "25.00")
    assert quote(client, vid, "Al Khor")["delivery_fee"] == "25.00"

    # A fixed fee of 0 is allowed; the free zone still wins over a fixed fee.
    assert client.patch(f"{ADMIN}/{khor['id']}", json={**body, "fixed_fee": "0"}, headers=auth_headers).json()["fee"] == "0.00"
    assert client.patch(f"{ADMIN}/{khor['id']}", json={**body, "is_free": True}, headers=auth_headers).json()["fee"] == "0.00"
    assert client.patch(f"{ADMIN}/{khor['id']}", json={**body, "fixed_fee": "-1"}, headers=auth_headers).status_code == 422

    # Clearing it goes back to the distance formula.
    assert client.patch(f"{ADMIN}/{khor['id']}", json={**body, "fixed_fee": None}, headers=auth_headers).json()["fee"] == "20.00"
