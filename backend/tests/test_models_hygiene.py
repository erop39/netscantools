from app.models.device import Device
from app.models.event import DeviceEvent
from app.models.hygiene import HygieneChecklistItem


def test_device_has_hygiene_columns():
    assert hasattr(Device, "latency_ms")
    assert hasattr(Device, "open_ports")
    assert hasattr(Device, "ports_scanned_at")
    assert hasattr(Device, "security_score")


def test_event_and_checklist_tables(db_session):
    e = DeviceEvent(device_id=None, type="new_device", details={"mac": "aa:bb:cc:dd:ee:ff"})
    db_session.add(e)
    db_session.add(
        HygieneChecklistItem(key="router_password", label="Router password changed", sort_order=0)
    )
    db_session.commit()
    assert db_session.query(DeviceEvent).count() == 1
    assert db_session.query(HygieneChecklistItem).count() == 1
