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


def test_inventory_locations_crud_and_priority(client, db_session):
    _login(client)
    # Creating item with location auto-registers catalog entry
    r = client.post(
        "/api/inventory",
        json={"title": "AP", "location": "Living room"},
    )
    assert r.status_code == 201, r.text
    locs = client.get("/api/inventory/locations")
    assert locs.status_code == 200
    names = [x["name"] for x in locs.json()]
    assert "Living room" in names

    created = client.post(
        "/api/inventory/locations",
        json={"name": "Garage", "sort_order": 1},
    )
    assert created.status_code == 201, created.text
    lid = created.json()["id"]
    assert created.json()["sort_order"] == 1

    # Rename updates items
    client.post("/api/inventory", json={"title": "Cam", "location": "Garage"})
    patched = client.patch(
        f"/api/inventory/locations/{lid}",
        json={"name": "Garage rack", "sort_order": 2},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Garage rack"
    items = client.get("/api/inventory").json()
    assert any(i["location"] == "Garage rack" for i in items)

    ordered = client.get("/api/inventory/locations").json()
    orders = [x["sort_order"] for x in ordered]
    assert orders == sorted(orders)


def test_deleted_location_stays_absent_while_item_keeps_text(client, db_session):
    _login(client)
    item_response = client.post(
        "/api/inventory",
        json={"title": "Switch", "location": "Old rack"},
    )
    assert item_response.status_code == 201, item_response.text

    locations = client.get("/api/inventory/locations").json()
    location = next(row for row in locations if row["name"] == "Old rack")

    deleted = client.delete(f"/api/inventory/locations/{location['id']}")
    assert deleted.status_code == 204, deleted.text

    remaining_locations = client.get("/api/inventory/locations")
    assert remaining_locations.status_code == 200
    assert all(row["name"] != "Old rack" for row in remaining_locations.json())

    items = client.get("/api/inventory")
    assert items.status_code == 200
    item = next(row for row in items.json() if row["id"] == item_response.json()["id"])
    assert item["location"] == "Old rack"


def test_device_location_uses_catalog_and_rename_updates_both(client, db_session):
    from app.models.device import Device

    device = Device(mac="aa:bb:cc:dd:ee:90", status="online")
    db_session.add(device)
    db_session.commit()
    _login(client)

    updated = client.patch(
        f"/api/devices/{device.id}", json={"location": "Office"}
    )
    assert updated.status_code == 200, updated.text
    item = client.post(
        "/api/inventory", json={"title": "UPS", "location": "Office"}
    )
    assert item.status_code == 201, item.text

    catalog = client.get("/api/inventory/locations").json()
    office = next(row for row in catalog if row["name"] == "Office")
    assert client.get("/api/devices/locations").json() == ["Office"]

    renamed = client.patch(
        f"/api/inventory/locations/{office['id']}", json={"name": "Office rack"}
    )
    assert renamed.status_code == 200, renamed.text
    assert client.get(f"/api/devices/{device.id}").json()["location"] == "Office rack"
    assert client.get("/api/inventory").json()[0]["location"] == "Office rack"


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


def test_dashboard_presence_includes_hostname_when_manual_name_is_missing(
    client, db_session
):
    d = Device(
        mac="aa:bb:cc:dd:ee:p2",
        ip="192.168.1.78",
        hostname="alice-phone.local",
        status="online",
        is_person=True,
        first_seen=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(d)
    db_session.commit()
    _login(client)

    people = client.get("/api/dashboard").json()["people_home"]
    person = next(row for row in people if row["id"] == d.id)
    assert person["name"] is None
    assert person["hostname"] == "alice-phone.local"
    assert person["ip"] == "192.168.1.78"


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
