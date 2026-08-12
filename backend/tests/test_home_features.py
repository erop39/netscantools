"""Location, WoL, backup, TLS home features."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models.device import Device
from app.services.device_diff import HostResult, apply_scan_results
from app.services.scoring import compute_device_score
from app.services.tls_check import TlsProbeResult
from app.services.wol import build_magic_packet, send_wol


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


def test_wol_magic_packet_length():
    pkt = build_magic_packet("aa:bb:cc:dd:ee:ff")
    assert len(pkt) == 102
    assert pkt[:6] == b"\xff" * 6


def test_wol_api(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:aa", ip="192.168.1.50", vendor="X")],
    )
    d = db_session.query(Device).one()
    _login(client)
    with patch("app.api.devices.wol_mod.send_wol") as mock_wol:
        mock_wol.return_value = type(
            "R",
            (),
            {"ok": True, "mac": d.mac, "message": "sent"},
        )()
        r = client.post(f"/api/devices/{d.id}/wol")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_location_patch_filter_list(client, db_session):
    apply_scan_results(
        db_session,
        [
            HostResult(mac="aa:bb:cc:dd:ee:01", ip="192.168.1.1", vendor="A"),
            HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.2", vendor="B"),
        ],
    )
    devices = db_session.query(Device).order_by(Device.mac).all()
    _login(client)
    r = client.patch(
        f"/api/devices/{devices[0].id}",
        json={"location": "Garage"},
    )
    assert r.status_code == 200
    assert r.json()["location"] == "Garage"

    r2 = client.get("/api/devices", params={"location": "Garage"})
    assert r2.status_code == 200
    assert len(r2.json()) == 1
    assert r2.json()[0]["mac"] == "aa:bb:cc:dd:ee:01"

    r3 = client.get("/api/devices/locations")
    assert r3.status_code == 200
    assert "Garage" in r3.json()


def test_backup_now(client, tmp_path, monkeypatch):
    import app.services.backup as backup_mod

    db_file = tmp_path / "netpad.db"
    db_file.write_bytes(b"sqlite-fake")
    bdir = tmp_path / "backups"
    bdir.mkdir(parents=True, exist_ok=True)

    def _bdir() -> type(bdir):
        bdir.mkdir(parents=True, exist_ok=True)
        return bdir

    monkeypatch.setattr(backup_mod, "db_path", lambda: db_file)
    monkeypatch.setattr(backup_mod, "data_dir", lambda: tmp_path)
    monkeypatch.setattr(backup_mod, "backups_dir", _bdir)
    # settings list_backups also goes through same module
    monkeypatch.setattr("app.api.settings.backup_svc.db_path", lambda: db_file)
    monkeypatch.setattr("app.api.settings.backup_svc.data_dir", lambda: tmp_path)
    monkeypatch.setattr("app.api.settings.backup_svc.backups_dir", _bdir)

    _login(client)
    r = client.post("/api/settings/backup-now")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["backup_count"] >= 1
    assert body["backup_last_path"]


def test_tls_score_penalties():
    class D:
        open_ports = []
        vendor = "X"
        hostname = "h"
        name = None
        status = "online"
        last_seen = datetime.now(timezone.utc)
        first_seen = datetime.now(timezone.utc) - timedelta(days=10)
        tls_status = "expired"
        tls_expires_at = None

    score, br = compute_device_score(D())
    assert score <= 80
    assert any(i["code"] == "tls_expired" for i in br)


def test_check_tls_api(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:bb", ip="192.168.1.60", vendor="X")],
    )
    d = db_session.query(Device).one()
    _login(client)
    fake = TlsProbeResult(
        status="self_signed",
        expires_at=datetime.now(timezone.utc) + timedelta(days=90),
        issuer="CN=device",
        error=None,
    )
    with patch("app.api.devices.tls_check_mod.probe_device_tls", return_value=fake):
        r = client.post(f"/api/devices/{d.id}/check-tls")
    assert r.status_code == 200
    body = r.json()
    assert body["tls_status"] == "self_signed"
    assert body["tls_issuer"] == "CN=device"
