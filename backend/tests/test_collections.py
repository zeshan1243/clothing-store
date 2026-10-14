from fastapi.testclient import TestClient

from tests.test_catalog import make_product

ADMIN = "/api/v1/admin/collections"


def products(client: TestClient, headers: dict) -> tuple[dict, dict, dict]:
    tee = make_product(
        client, headers, name="Tee", base_price="80.00", is_featured=True,
        images=[{"image_url": "https://cdn.example.com/tee.jpg"}],
        variants=[{"sku": "T-S", "colour": "White", "size": "S", "initial_stock": 2}],
    )
    hoodie = make_product(client, headers)  # hoodie.jpg, sizes M/L
    draft = make_product(
        client, headers, name="Draft", status="DRAFT",
        variants=[{"sku": "D-1", "colour": "Red", "size": "XL", "initial_stock": 1}],
    )
    return tee, hoodie, draft


def test_admin_collection_crud(client: TestClient, auth_headers: dict) -> None:
    tee, hoodie, _ = products(client, auth_headers)
    assert client.get(ADMIN).status_code == 401

    res = client.post(ADMIN, json={"name": "Summer Drop 01", "is_featured": True, "product_ids": [tee["id"], hoodie["id"], tee["id"]]}, headers=auth_headers)
    assert res.status_code == 201, res.text
    c = res.json()
    assert c["slug"] == "summer-drop-01" and sorted(c["product_ids"]) == sorted([tee["id"], hoodie["id"]])
    assert c["product_count"] == 2

    # Same name → unique slug; explicit duplicate slug → 409; unknown product → 422.
    assert client.post(ADMIN, json={"name": "Summer Drop 01"}, headers=auth_headers).json()["slug"] == "summer-drop-01-2"
    assert client.post(ADMIN, json={"name": "X", "slug": "summer-drop-01"}, headers=auth_headers).status_code == 409
    assert client.post(ADMIN, json={"name": "X", "product_ids": [99999]}, headers=auth_headers).status_code == 422

    updated = client.patch(f"{ADMIN}/{c['id']}", json={"name": "Summer Drop", "product_ids": [hoodie["id"]]}, headers=auth_headers).json()
    assert updated["name"] == "Summer Drop" and updated["product_ids"] == [hoodie["id"]] and updated["slug"] == "summer-drop-01"

    assert client.delete(f"{ADMIN}/{c['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"{ADMIN}/{c['id']}", headers=auth_headers).status_code == 404
    # Products survive.
    assert client.get(f"/api/v1/products/{hoodie['slug']}").status_code == 200


def test_public_collections_and_filtering(client: TestClient, auth_headers: dict) -> None:
    tee, hoodie, draft = products(client, auth_headers)
    client.post(ADMIN, json={"name": "Eid Edit", "is_featured": True, "product_ids": [tee["id"], hoodie["id"], draft["id"]]}, headers=auth_headers)
    client.post(ADMIN, json={"name": "Hidden", "is_active": False, "product_ids": [tee["id"]]}, headers=auth_headers)
    client.post(ADMIN, json={"name": "Only drafts", "product_ids": [draft["id"]]}, headers=auth_headers)
    client.post(
        ADMIN, json={"name": "Basics", "image_url": "https://cdn.example.com/basics.jpg", "product_ids": [hoodie["id"]]},
        headers=auth_headers,
    )

    listed = client.get("/api/v1/collections").json()
    # Inactive and empty (only draft products) collections are hidden.
    assert [c["name"] for c in listed] == ["Basics", "Eid Edit"]
    eid = next(c for c in listed if c["name"] == "Eid Edit")
    assert eid["product_count"] == 2  # the draft isn't counted
    assert eid["cover_image_url"] == "https://cdn.example.com/tee.jpg"  # featured product's photo
    assert next(c for c in listed if c["name"] == "Basics")["cover_image_url"] == "https://cdn.example.com/basics.jpg"
    assert [c["name"] for c in client.get("/api/v1/collections?featured=true").json()] == ["Eid Edit"]

    assert client.get("/api/v1/collections/eid-edit").json()["product_count"] == 2
    assert client.get("/api/v1/collections/hidden").status_code == 404

    page = client.get("/api/v1/products?collection=eid-edit").json()
    assert {p["name"] for p in page["items"]} == {"Tee", "Oversized Hoodie"}
    assert client.get("/api/v1/products?collection=hidden").json()["total"] == 0
    facets = client.get("/api/v1/products/facets?collection=basics").json()
    assert facets["sizes"] == ["M", "L"]
