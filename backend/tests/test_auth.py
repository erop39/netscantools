def test_login_success(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    assert "netpad_token" in r.cookies


def test_login_failure(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_after_login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_change_password(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    bad = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "secret1"},
    )
    assert bad.status_code == 400

    short = client.post(
        "/api/auth/change-password",
        json={"current_password": "admin", "new_password": "123"},
    )
    assert short.status_code == 422

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": "admin", "new_password": "secret1"},
    )
    assert ok.status_code == 200

    # old password fails
    r1 = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r1.status_code == 401

    r2 = client.post("/api/auth/login", json={"username": "admin", "password": "secret1"})
    assert r2.status_code == 200
