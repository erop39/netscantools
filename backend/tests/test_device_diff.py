from app.models.device import Device
from app.models.event import DeviceEvent
from app.models.notification import Notification
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
    assert db_session.query(Notification).filter(Notification.type == "device_offline").count() == 1


def test_new_device_creates_event_and_notification(db_session):
    apply_scan_results(db_session, [HostResult(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.10")])
    db_session.commit()
    assert db_session.query(DeviceEvent).filter_by(type="new_device").count() == 1
    assert db_session.query(Notification).filter_by(type="new_device").count() == 1


def test_offline_event_type_went_offline_notify_device_offline(db_session):
    apply_scan_results(db_session, [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.11")])
    db_session.commit()
    apply_scan_results(db_session, [])  # all missing
    db_session.commit()
    assert db_session.query(DeviceEvent).filter_by(type="went_offline").count() == 1
    assert db_session.query(Notification).filter_by(type="device_offline").count() == 1


def test_came_online_event_no_notification(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:04", ip="192.168.1.40")],
    )
    apply_scan_results(db_session, [])
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:04", ip="192.168.1.40")],
    )
    assert db_session.query(DeviceEvent).filter_by(type="came_online").count() == 1
    # came_online must not create a notification
    assert db_session.query(Notification).filter_by(type="came_online").count() == 0


def test_security_score_set_on_apply(db_session):
    apply_scan_results(
        db_session,
        [HostResult(mac="aa:bb:cc:dd:ee:05", ip="192.168.1.50", vendor="Acme")],
    )
    dev = db_session.query(Device).filter(Device.mac == "aa:bb:cc:dd:ee:05").one()
    assert dev.security_score is not None
    assert 0 <= dev.security_score <= 100
