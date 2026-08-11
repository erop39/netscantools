from app.models.notification import Notification


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_get_default_settings(client):
    _login(client)
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = r.json()
    assert body["scan_subnet"] == "192.168.1.0/24"
    assert body["scan_interval_minutes"] == 0
    assert body["scan_ports"] == "80,443,8080"
    assert body["ui_background"] == "default"
    assert body["ui_background_url"] == "/bg.jpg"
    assert body["has_custom_background"] is False


def test_put_settings_valid(client):
    _login(client)
    r = client.put(
        "/api/settings",
        json={
            "scan_subnet": "10.0.0.0/24",
            "scan_interval_minutes": 30,
            "scan_ports": "80,443,8443",
            "ui_background": "solid",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["scan_subnet"] == "10.0.0.0/24"
    assert body["scan_interval_minutes"] == 30
    assert body["scan_ports"] == "80,443,8443"
    assert body["ui_background"] == "solid"
    assert body["ui_background_url"] is None

    r2 = client.get("/api/settings")
    assert r2.json()["scan_subnet"] == "10.0.0.0/24"
    assert r2.json()["ui_background"] == "solid"


def test_put_settings_invalid_cidr(client):
    _login(client)
    r = client.put(
        "/api/settings",
        json={
            "scan_subnet": "not-a-cidr",
            "scan_interval_minutes": 10,
            "scan_ports": "80",
            "ui_background": "default",
        },
    )
    assert r.status_code == 422


def test_put_settings_negative_interval(client):
    _login(client)
    r = client.put(
        "/api/settings",
        json={
            "scan_subnet": "192.168.1.0/24",
            "scan_interval_minutes": -1,
            "scan_ports": "80",
            "ui_background": "default",
        },
    )
    assert r.status_code == 422


def test_put_settings_invalid_ports(client):
    _login(client)
    r = client.put(
        "/api/settings",
        json={
            "scan_subnet": "192.168.1.0/24",
            "scan_interval_minutes": 0,
            "scan_ports": "80,abc",
            "ui_background": "default",
        },
    )
    assert r.status_code == 422


def test_put_custom_without_upload_fails(client):
    _login(client)
    r = client.put(
        "/api/settings",
        json={
            "scan_subnet": "192.168.1.0/24",
            "scan_interval_minutes": 0,
            "scan_ports": "80",
            "ui_background": "custom",
        },
    )
    assert r.status_code == 400


def test_upload_and_use_custom_background(client):
    _login(client)
    # minimal 1x1 PNG
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    r = client.post(
        "/api/settings/background-image",
        files={"file": ("bg.png", png, "image/png")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ui_background"] == "custom"
    assert body["has_custom_background"] is True
    assert body["ui_background_url"] is not None
    assert "background-image" in body["ui_background_url"]

    r2 = client.get("/api/settings/background-image")
    assert r2.status_code == 200
    assert r2.content[:8] == b"\x89PNG\r\n\x1a\n"

    r3 = client.delete("/api/settings/background-image")
    assert r3.status_code == 200
    assert r3.json()["ui_background"] == "default"
    assert r3.json()["has_custom_background"] is False


def test_notifications_list_and_mark_read(client, db_session):
    n1 = Notification(type="new_device", device_id=None, message="Device A", read=False)
    n2 = Notification(type="ip_changed", device_id=None, message="Device B", read=False)
    db_session.add_all([n1, n2])
    db_session.commit()

    _login(client)
    r = client.get("/api/notifications")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 2
    assert all(item["read"] is False for item in items)

    nid = items[0]["id"]
    r2 = client.patch(f"/api/notifications/{nid}/read")
    assert r2.status_code == 200
    assert r2.json()["read"] is True

    r3 = client.get("/api/notifications")
    marked = [x for x in r3.json() if x["id"] == nid][0]
    assert marked["read"] is True


def test_notifications_read_all(client, db_session):
    db_session.add_all(
        [
            Notification(type="new_device", message="one", read=False),
            Notification(type="device_offline", message="two", read=False),
        ]
    )
    db_session.commit()

    _login(client)
    r = client.post("/api/notifications/read-all")
    assert r.status_code == 204

    r2 = client.get("/api/notifications")
    assert r2.status_code == 200
    assert all(item["read"] is True for item in r2.json())


def test_mark_notification_not_found(client):
    _login(client)
    r = client.patch("/api/notifications/99999/read")
    assert r.status_code == 404
