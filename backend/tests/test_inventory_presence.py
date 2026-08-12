from datetime import datetime, timezone

from app.models.device import Device
from app.models.inventory import InventoryItem
from app.services.device_diff import HostResult, apply_scan_results
from app.services import latency_history as lat_mod


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_inventory_crud(client, db_session):
    _login(client)
    r = client.post(
        "/api/inventory",
        json={"title": "NAS", "serial_number": "SN1", "location": "Rack"},
    )
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["title"] == "NAS"
    iid = item["id"]

    r2 = client.get("/api/inventory")
    assert r2.status_code == 200
    assert any(i["id"] == iid for i in r2.json())

    r3 = client.patch(f"/api/inventory/{iid}", json={"category": "storage"})
    assert r3.status_code == 200
    assert r3.json()["category"] == "storage"

    r4 = client.delete(f"/api/inventory/{iid}")
    assert r4.status_code == 204


def test_is_person_and_dashboard_presence(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:p1", ip="192.168.1.77", vendor="Phone")],
    )
    d = db_session.query(Device).one()
    _login(client)
    r = client.patch(f"/api/devices/{d.id}", json={"is_person": True, "name": "Alice"})
    assert r.status_code == 200
    assert r.json()["is_person"] is True

    dash = client.get("/api/dashboard")
    assert dash.status_code == 200
    body = dash.json()
    assert any(p["id"] == d.id for p in body["people_home"])


def test_latency_history_records(db_session):
    d = Device(
        mac="aa:bb:cc:dd:ee:l1",
        ip="1.1.1.1",
        status="online",
        first_seen=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(d)
    db_session.commit()
    lat_mod.record_latency(db_session, d.id, 10.0)
    lat_mod.record_latency(db_session, d.id, 20.0)
    db_session.commit()
    rows = lat_mod.list_latency(db_session, d.id)
    assert len(rows) == 2
    assert rows[-1].rtt_ms == 20.0
