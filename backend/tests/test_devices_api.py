from app.services.device_diff import HostResult, apply_scan_results


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_list_devices_empty(client):
    _login(client)
    r = client.get("/api/devices")
    assert r.status_code == 200
    assert r.json() == []


def test_list_and_patch_device(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:10", ip="192.168.1.50", hostname="cam", vendor="X")],
    )
    _login(client)
    r = client.get("/api/devices")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    dev_id = items[0]["id"]
    r2 = client.patch(
        f"/api/devices/{dev_id}",
        json={"type": "camera", "notes": "porch", "web_ui_local": "http://192.168.1.50"},
    )
    assert r2.status_code == 200
    assert r2.json()["type"] == "camera"
    assert r2.json()["web_ui_local"] == "http://192.168.1.50"


def test_dashboard(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:11", ip="192.168.1.51", hostname=None, vendor=None)],
    )
    _login(client)
    r = client.get("/api/dashboard")
    assert r.status_code == 200
    body = r.json()
    assert body["online_count"] == 1
    assert body["total_count"] == 1
