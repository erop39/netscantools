from app.models.device import Device
from app.services.device_diff import HostResult, apply_scan_results, normalize_mac


def test_normalize_mac():
    assert normalize_mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff"


def test_new_device_creates_notification(db_session):
    result = apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:01", ip="192.168.1.10", hostname=None, vendor="Acme")],
    )
    assert result.new_devices == 1
    assert result.devices_found == 1
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:01").one()
    assert dev.status == "online"
    assert dev.ip == "192.168.1.10"
    from app.models.notification import Notification
    n = db_session.query(Notification).filter(Notification.type == "new_device").one()
    assert n.device_id == dev.id


def test_ip_change_notification(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.20", hostname=None, vendor=None)],
    )
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.21", hostname=None, vendor=None)],
    )
    from app.models.notification import Notification
    types = [n.type for n in db_session.query(Notification).all()]
    assert "ip_changed" in types
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:02").one()
    assert dev.ip == "192.168.1.21"


def test_missing_device_goes_offline(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:03", ip="192.168.1.30", hostname=None, vendor=None)],
    )
    apply_scan_results(db_session, [])
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:03").one()
    assert dev.status == "offline"
    from app.models.notification import Notification
    assert db_session.query(Notification).filter(Notification.type == "device_offline").count() == 1
