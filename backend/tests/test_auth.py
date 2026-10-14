

def test_admin_profile_and_name_update(client: TestClient, auth_headers: dict) -> None:
    assert client.get("/api/v1/admin/auth/profile").status_code == 401
    renamed = client.patch("/api/v1/admin/auth/me", json={"name": "  Zee  "}, headers=auth_headers)
    assert renamed.status_code == 200 and renamed.json()["name"] == "Zee"
    assert client.patch("/api/v1/admin/auth/me", json={"name": "Z"}, headers=auth_headers).status_code == 422

    profile = client.get("/api/v1/admin/auth/profile", headers=auth_headers).json()
    assert profile["name"] == "Zee"
    assert profile["stats"]["actions_30d"] >= 1 and profile["stats"]["cash_collected"] == "0.00"
    assert profile["recent_activity"][0]["action"] == "admin.update_profile"
    assert any(m["name"] == "Zee" for m in profile["team"])
