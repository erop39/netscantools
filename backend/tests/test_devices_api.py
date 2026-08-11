from app.services.device_diff import HostResult, apply_scan_results


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_new_device_gets_default_web_ui(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:99", ip="192.168.1.99", hostname="cam.local", vendor="X")],
    )
    _login(client)
    r = client.get("/api/devices")
    assert r.status_code == 200
    item = next(d for d in r.json() if d["mac"] == "aa:bb:cc:dd:ee:99")
    assert item["web_ui_local"] == "http://192.168.1.99"
    assert item["hostname"] == "cam.local"


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


def test_ping_device_no_ip(client, db_session):
    from app.models.device import Device

    d = Device(mac="aa:bb:cc:dd:ee:77", ip=None, status="unknown")
    db_session.add(d)
    db_session.commit()
    _login(client)
    r = client.post(f"/api/devices/{d.id}/ping")
    assert r.status_code == 400


def test_resolve_device_mocked(client, db_session, monkeypatch):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:88", ip="192.168.1.88", hostname=None, vendor=None)],
    )
    _login(client)
    devices = client.get("/api/devices").json()
    dev_id = next(d["id"] for d in devices if d["mac"] == "aa:bb:cc:dd:ee:88")

    monkeypatch.setattr(
        "app.api.devices.resolve_hostname",
        lambda ip, timeout=2.0: "nas.home.local",
    )
    r = client.post(f"/api/devices/{dev_id}/resolve")
    assert r.status_code == 200
    body = r.json()
    assert body["hostname"] == "nas.home.local"
    assert body["device"]["hostname"] == "nas.home.local"


def test_rename_device(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:55", ip="192.168.1.55", hostname="auto.local", vendor=None)],
    )
    _login(client)
    devices = client.get("/api/devices").json()
    dev_id = next(d["id"] for d in devices if d["mac"] == "aa:bb:cc:dd:ee:55")
    r = client.patch(f"/api/devices/{dev_id}", json={"name": "  Porch camera  "})
    assert r.status_code == 200
    assert r.json()["name"] == "Porch camera"
    assert r.json()["hostname"] == "auto.local"


def test_set_device_icon(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:44", ip="192.168.1.44", hostname=None, vendor=None)],
    )
    _login(client)
    devices = client.get("/api/devices").json()
    dev_id = next(d["id"] for d in devices if d["mac"] == "aa:bb:cc:dd:ee:44")
    r = client.patch(f"/api/devices/{dev_id}", json={"type": "camera", "icon": "camera"})
    assert r.status_code == 200
    assert r.json()["type"] == "camera"
    assert r.json()["icon"] == "camera"
    bad = client.patch(f"/api/devices/{dev_id}", json={"icon": "not-a-real-icon"})
    assert bad.status_code == 422


def test_resolve_all_mocked(client, db_session, monkeypatch):
    apply_scan_results(
        db_session,
        [
            HostResult(mac="aa:bb:cc:dd:ee:01", ip="192.168.1.1", hostname=None, vendor=None),
            HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.2", hostname=None, vendor=None),
        ],
    )
    _login(client)
    monkeypatch.setattr(
        "app.api.devices.resolve_hostnames",
        lambda ips, concurrency=32, timeout=1.5: {ips[0]: "gw.local"} if ips else {},
    )
    r = client.post("/api/devices/resolve-all")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert body["resolved"] == 1
    hosts = {d["mac"]: d["hostname"] for d in body["devices"]}
    assert hosts["aa:bb:cc:dd:ee:01"] == "gw.local"
