"""SMB share parse + scan-shares API tests."""

from unittest.mock import patch

from app.services.device_diff import HostResult, apply_scan_results
from app.services.smb_enum import parse_net_view, enum_smb_shares, SmbEnumResult, ShareEntry


def _login(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})


SAMPLE_EN = """
Shared resources at \\\\192.168.1.10

Share name       Type     Used as  Comment

-------------------------------------------------------------------------------
IPC$             IPC
C$               Disk              Default share
Users            Disk
HP_Laser         Print             HP LaserJet
The command completed successfully.
"""

SAMPLE_RU = """
Общие ресурсы на \\\\192.168.1.10

Имя общего ресурса  Тип      Используется как  Комментарий
-------------------------------------------------------------------------------
IPC$                IPC
Users               Диск
Canon               Принтер  Canon MF
Команда выполнена успешно.
"""


def test_parse_net_view_en():
    shares = parse_net_view(SAMPLE_EN)
    by = {s.name: s for s in shares}
    assert "IPC$" in by
    assert by["IPC$"].share_type == "ipc"
    assert by["IPC$"].hidden is True
    assert by["C$"].share_type == "disk"
    assert by["C$"].hidden is True
    assert by["Users"].share_type == "disk"
    assert by["Users"].hidden is False
    assert by["HP_Laser"].share_type == "print"
    assert by["HP_Laser"].comment and "Laser" in by["HP_Laser"].comment


def test_parse_net_view_ru_types():
    shares = parse_net_view(SAMPLE_RU)
    by = {s.name: s for s in shares}
    assert by["Users"].share_type == "disk"
    assert by["Canon"].share_type == "print"


def test_parse_empty():
    assert parse_net_view("") == []
    assert parse_net_view("The command completed successfully.") == []


def test_enum_timeout_mocked():
    import subprocess

    with patch("app.services.smb_enum.run_capture", side_effect=subprocess.TimeoutExpired("net", 8)):
        with patch("sys.platform", "win32"):
            r = enum_smb_shares("192.168.1.10")
    assert r.status == "timeout"
    assert r.shares == []


def test_enum_denied_mocked():
    with patch(
        "app.services.smb_enum.run_capture",
        return_value=(2, "", "System error 5 has occurred.\n\nAccess is denied."),
    ):
        with patch("sys.platform", "win32"):
            r = enum_smb_shares("192.168.1.10")
    assert r.status == "denied"


def test_scan_shares_api(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:90", ip="192.168.1.90", hostname=None, vendor=None)],
    )
    from app.models.device import Device

    device = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:90").one()
    _login(client)

    fake = SmbEnumResult(
        status="ok",
        shares=[
            ShareEntry(name="Users", share_type="disk", comment=None, hidden=False),
            ShareEntry(name="HP", share_type="print", comment="Laser", hidden=False),
            ShareEntry(name="C$", share_type="disk", comment=None, hidden=True),
        ],
    )
    with patch("app.api.devices.smb_enum_mod.enum_smb_shares", return_value=fake):
        r = client.post(f"/api/devices/{device.id}/scan-shares")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["smb_scan_status"] == "ok"
    assert body["smb_scanned_at"] is not None
    names = {s["name"] for s in body["smb_shares"]}
    assert names == {"Users", "HP", "C$"}
    types = {s["name"]: s["share_type"] for s in body["smb_shares"]}
    assert types["HP"] == "print"
    assert any(s["hidden"] for s in body["smb_shares"] if s["name"] == "C$")


def test_scan_shares_no_ip(client, db_session):
    from app.models.device import Device
    from datetime import datetime, timezone

    d = Device(
        mac="aa:bb:cc:dd:ee:91",
        ip=None,
        status="unknown",
        first_seen=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(d)
    db_session.commit()
    _login(client)
    r = client.post(f"/api/devices/{d.id}/scan-shares")
    assert r.status_code == 400


def test_scan_shares_keeps_list_on_denied(client, db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:92", ip="192.168.1.92", hostname=None, vendor=None)],
    )
    from app.models.device import Device

    device = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:92").one()
    device.smb_shares = [{"name": "Users", "share_type": "disk", "comment": None, "hidden": False}]
    device.smb_scan_status = "ok"
    db_session.commit()
    _login(client)

    with patch(
        "app.api.devices.smb_enum_mod.enum_smb_shares",
        return_value=SmbEnumResult(status="denied", shares=[], message="Access is denied"),
    ):
        r = client.post(f"/api/devices/{device.id}/scan-shares")
    assert r.status_code == 200
    body = r.json()
    assert body["smb_scan_status"] == "denied"
    assert len(body["smb_shares"]) == 1
    assert body["smb_shares"][0]["name"] == "Users"
