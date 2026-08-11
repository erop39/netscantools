from app.models.device import Device
from app.models.event import DeviceEvent
from app.services import scanner as scanner_mod
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


# --- Task 7: hygiene fields, events, scan-ports, ping latency ---


def test_device_out_has_hygiene_fields(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:70", ip="192.168.1.70", hostname="hygiene", vendor="X")],
    )
    _login(client)
    devices = client.get("/api/devices").json()
    device_id = next(d["id"] for d in devices if d["mac"] == "aa:bb:cc:dd:ee:70")

    # List: hygiene fields + is_new; no score_breakdown (None / omitted light path)
    listed = next(d for d in devices if d["id"] == device_id)
    assert "latency_ms" in listed
    assert "open_ports" in listed
    assert "ports_scanned_at" in listed
    assert "security_score" in listed
    assert listed["is_new"] is True
    assert listed.get("score_breakdown") is None

    # Detail: includes score_breakdown list
    r = client.get(f"/api/devices/{device_id}")
    assert r.status_code == 200
    body = r.json()
    assert "latency_ms" in body
    assert "security_score" in body
    assert "is_new" in body
    assert body["is_new"] is True
    assert "score_breakdown" in body
    assert isinstance(body["score_breakdown"], list)


def test_device_events_endpoint(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:71", ip="192.168.1.71", hostname=None, vendor=None)],
    )
    device = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:71").one()
    db_session.add(
        DeviceEvent(
            device_id=device.id,
            type="port_opened",
            details={"port": 445, "mac": device.mac},
        )
    )
    db_session.commit()

    _login(client)
    r = client.get(f"/api/devices/{device.id}/events")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    types = {e["type"] for e in body}
    assert "new_device" in types or "port_opened" in types
    for ev in body:
        assert "id" in ev
        assert "type" in ev
        assert "details" in ev
        assert "created_at" in ev


def test_ping_persists_latency(client, db_session, monkeypatch):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:72", ip="192.168.1.72", hostname=None, vendor=None)],
    )
    device = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:72").one()
    assert device.latency_ms is None

    monkeypatch.setattr(
        "app.api.devices.ping_detail",
        lambda ip, count=2, timeout_ms=1000: type(
            "R",
            (),
            {"ok": True, "ip": ip, "rtt_ms": 18.25, "message": "ok"},
        )(),
    )
    _login(client)
    r = client.post(f"/api/devices/{device.id}/ping")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["rtt_ms"] == 18.25

    db_session.refresh(device)
    assert device.latency_ms == 18.25


def test_scan_ports_endpoint(client, db_session, monkeypatch):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:73", ip="192.168.1.73", hostname=None, vendor=None)],
    )
    device = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:73").one()

    monkeypatch.setattr(
        "app.services.port_probe.probe_host_ports",
        lambda ip, ports, timeout_s=0.35: [80, 443] if ip else [],
    )
    _login(client)
    r = client.post(f"/api/devices/{device.id}/scan-ports")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == device.id
    ports = {p["port"] for p in (body.get("open_ports") or [])}
    assert 80 in ports
    assert 443 in ports
    assert any(p.get("source") == "full" for p in (body.get("open_ports") or []))
    assert body["ports_scanned_at"] is not None
    assert body["security_score"] is not None


def test_scan_ports_409_when_locked(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:74", ip="192.168.1.74", hostname=None, vendor=None)],
    )
    device = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:74").one()
    assert scanner_mod._scan_lock.acquire(blocking=False)
    try:
        _login(client)
        r = client.post(f"/api/devices/{device.id}/scan-ports")
        assert r.status_code == 409
    finally:
        scanner_mod._scan_lock.release()

