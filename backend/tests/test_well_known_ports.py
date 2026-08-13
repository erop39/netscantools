from app.services import well_known_ports as wkp
from app.services.port_probe import _service_for


def test_catalog_loads():
    rows = wkp.load_catalog()
    assert len(rows) >= 20
    assert any(r["port"] == 8123 for r in rows)
    assert "infra" in wkp.categories()


def test_filter_category():
    rows = wkp.list_well_known(category="database")
    assert all(r["category"] == "database" for r in rows)
    assert any(r["port"] == 5432 for r in rows)


def test_service_map_enriched():
    # HA / Portainer from catalog
    assert _service_for(8123) is not None
    assert _service_for(22) == "ssh" or _service_for(22)


def test_api_well_known(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = client.get("/api/ports/well-known")
    assert r.status_code == 200
    body = r.json()
    assert "ports" in body
    assert "presets" in body
    assert "home_lan" in body["presets"]
