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


def test_create_slot_and_port(client, db_session):
    _login(client)
    # seed device
    from app.models.device import Device
    db_session.add(Device(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.50", status="online"))
    db_session.commit()

    r = client.put("/api/planner", json={"name": "Home", "cidr": "192.168.1.0/24", "notes": None})
    assert r.status_code == 200

    r = client.post("/api/planner/slots", json={
        "planned_ip": "192.168.1.10",
        "role_label": "NAS",
        "device_mac": "aa:bb:cc:dd:ee:01",
    })
    assert r.status_code == 200
    slot = r.json()
    assert slot["device_mac"] == "aa:bb:cc:dd:ee:01"
    assert slot["live_ip"] == "192.168.1.50"
    assert slot["match"] == "mismatch"

    r = client.post(f"/api/planner/slots/{slot['id']}/ports", json={"port": 445, "label": "SMB"})
    assert r.status_code == 200
    assert r.json()["port"] == 445


def test_duplicate_ip_conflict(client):
    _login(client)
    client.put("/api/planner", json={"name": "H", "cidr": "192.168.1.0/24", "notes": None})
    client.post("/api/planner/slots", json={"planned_ip": "192.168.1.10"})
    r = client.post("/api/planner/slots", json={"planned_ip": "192.168.1.10"})
    assert r.status_code == 409


def test_ip_outside_cidr(client):
    _login(client)
    client.put("/api/planner", json={"name": "H", "cidr": "192.168.1.0/24", "notes": None})
    r = client.post("/api/planner/slots", json={"planned_ip": "10.0.0.1"})
    assert r.status_code == 400


def test_reorder_slots(client):
    _login(client)
    a = client.post("/api/planner/slots", json={"role_label": "A"}).json()
    b = client.post("/api/planner/slots", json={"role_label": "B"}).json()
    r = client.put("/api/planner/slots/reorder", json={"slot_ids": [b["id"], a["id"]]})
    assert r.status_code == 200
    slots = client.get("/api/planner").json()["slots"]
    assert [s["id"] for s in slots] == [b["id"], a["id"]]


def test_export_import_roundtrip(client, db_session):
    _login(client)
    client.put("/api/planner", json={"name": "Lab", "cidr": "192.168.0.0/24", "notes": "x"})
    s = client.post("/api/planner/slots", json={"planned_ip": "192.168.0.5", "role_label": "PC"}).json()
    client.post(f"/api/planner/slots/{s['id']}/ports", json={"port": 22, "label": "SSH"})
    exp = client.get("/api/planner/export")
    assert exp.status_code == 200
    body = exp.json()
    assert body["format"] == "netscantools.network_plan"
    assert body["version"] == 1
    assert len(body["slots"]) == 1

    client.post("/api/planner/slots", json={"role_label": "temp"})
    imp = client.post("/api/planner/import", json=body)
    assert imp.status_code == 200
    plan = client.get("/api/planner").json()
    assert plan["name"] == "Lab"
    assert len(plan["slots"]) == 1
    assert plan["slots"][0]["ports"][0]["port"] == 22


def test_import_bad_format(client):
    _login(client)
    r = client.post("/api/planner/import", json={"format": "nope", "version": 1, "plan": {}, "slots": []})
    assert r.status_code == 400


def test_candidates_excludes_bound_mac(client, db_session):
    _login(client)
    from app.models.device import Device
    db_session.add(Device(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.1", status="online"))
    db_session.add(Device(mac="AA:BB:CC:DD:EE:02", ip="192.168.1.2", status="online"))
    db_session.commit()
    client.post("/api/planner/slots", json={"device_mac": "AA:BB:CC:DD:EE:01"})
    r = client.get("/api/planner/candidates")
    assert r.status_code == 200
    macs = {c["mac"] for c in r.json()}
    assert "AA:BB:CC:DD:EE:02" in macs
    assert "AA:BB:CC:DD:EE:01" not in macs
