def _login(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200


def test_get_planner_ensures_singleton(client):
    _login(client)
    r = client.get("/api/planner")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Home LAN"
    assert "slots" in data
    assert data["slots"] == []
    r2 = client.get("/api/planner")
    assert r2.json()["id"] == data["id"]
