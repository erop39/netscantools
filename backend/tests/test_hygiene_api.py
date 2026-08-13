from datetime import datetime, timezone

from app.models.device import Device
from app.models.event import DeviceEvent
from app.services import scanner as scanner_mod
from app.services.device_diff import HostResult, apply_scan_results


def _login(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200


def test_hygiene_summary_and_checklist_seed(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = client.get("/api/hygiene")
    assert r.status_code == 200
    data = r.json()
    assert "network_score" in data
    assert "counts" in data
    assert set(data["counts"].keys()) >= {"online", "offline", "new_24h", "risky_devices"}
    assert "top_risks" in data
    assert "recent_events" in data
    r = client.get("/api/hygiene/checklist")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 7
    keys = {i["key"] for i in items}
    assert "router_password" in keys
    assert "guest_isolation" in keys
    assert "unused_ports" in keys


def test_checklist_toggle(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    items = client.get("/api/hygiene/checklist").json()
    item_id = items[0]["id"]
    r = client.patch(f"/api/hygiene/checklist/{item_id}", json={"checked": True})
    assert r.status_code == 200
    assert r.json()["checked"] is True
    assert r.json()["checked_at"] is not None

    r = client.patch(f"/api/hygiene/checklist/{item_id}", json={"checked": False})
    assert r.status_code == 200
    assert r.json()["checked"] is False
    assert r.json()["checked_at"] is None


def test_hygiene_summary_counts_and_risks(client, db_session):
    now = datetime.now(timezone.utc)
    online_ok = Device(
        mac="aa:bb:cc:dd:ee:01",
        ip="192.168.1.10",
        name="good",
        status="online",
        security_score=90,
        open_ports=[{"port": 80, "service": "http", "source": "full"}],
        first_seen=now,
        last_seen=now,
    )
    online_risky = Device(
        mac="aa:bb:cc:dd:ee:02",
        ip="192.168.1.11",
        name="bad",
        status="online",
        security_score=30,
        open_ports=[{"port": 23, "service": None, "source": "full"}],
        first_seen=now,
        last_seen=now,
    )
    offline = Device(
        mac="aa:bb:cc:dd:ee:03",
        ip="192.168.1.12",
        name="gone",
        status="offline",
        security_score=80,
        open_ports=[],
        first_seen=now,
        last_seen=now,
    )
    db_session.add_all([online_ok, online_risky, offline])
    db_session.add(
        DeviceEvent(
            device_id=None,
            type="new_device",
            details={"mac": "aa:bb:cc:dd:ee:02"},
        )
    )
    db_session.commit()

    _login(client)
    r = client.get("/api/hygiene")
    assert r.status_code == 200
    data = r.json()
    assert data["counts"]["online"] == 2
    assert data["counts"]["offline"] == 1
    assert data["counts"]["new_24h"] == 3
    assert data["counts"]["risky_devices"] >= 1
    assert data["network_score"] == 60  # mean of 90 and 30
    assert any(t["mac"] == "aa:bb:cc:dd:ee:02" for t in data["top_risks"])
    assert len(data["recent_events"]) >= 1


def test_scan_ports_all_online(client, db_session, monkeypatch):
    apply_scan_results(
        db_session,
        [
            HostResult(mac="aa:bb:cc:dd:ee:80", ip="192.168.1.80", hostname=None, vendor=None),
            HostResult(mac="aa:bb:cc:dd:ee:81", ip="192.168.1.81", hostname=None, vendor=None),
        ],
    )
    # apply_scan_results leaves devices online
    monkeypatch.setattr(
        "app.services.port_probe.probe_host_ports",
        lambda ip, ports, timeout_s=0.35: [80] if ip else [],
    )
    _login(client)
    r = client.post("/api/hygiene/scan-ports")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert body["scanned"] == 2
    assert body["ok"] == 2
    assert body["failed"] == 0

    d80 = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:80").one()
    db_session.refresh(d80)
    ports = {p["port"] for p in (d80.open_ports or [])}
    assert 80 in ports
    assert d80.security_score is not None


def test_scan_ports_409_when_locked(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:82", ip="192.168.1.82", hostname=None, vendor=None)],
    )
    assert scanner_mod._scan_lock.acquire(blocking=False)
    try:
        _login(client)
        r = client.post("/api/hygiene/scan-ports")
        assert r.status_code == 409
    finally:
        scanner_mod._scan_lock.release()


def test_checklist_patch_404(client):
    _login(client)
    client.get("/api/hygiene/checklist")  # seed
    r = client.patch("/api/hygiene/checklist/99999", json={"checked": True})
    assert r.status_code == 404
