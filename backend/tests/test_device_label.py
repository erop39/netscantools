from app.models.device import Device
from app.services.device_label import (
    device_display_name,
    format_notify_ip_changed,
    format_notify_new_device,
    format_notify_offline,
    format_notify_port_opened,
)


def test_display_name_prefers_manual_name():
    d = Device(mac="aa:bb:cc:dd:ee:01", ip="192.168.1.10", hostname="host-a", name="TV")
    assert device_display_name(d) == "TV"


def test_display_name_never_device_hash():
    d = Device(mac="aa:bb:cc:dd:ee:02", ip=None, hostname=None, name=None)
    assert device_display_name(d) == "aa:bb:cc:dd:ee:02"
    assert "#" not in (device_display_name(d) or "")


def test_notify_new_device_includes_ip_and_mac():
    d = Device(mac="aa:bb:cc:dd:ee:03", ip="192.168.1.5", hostname="nas", name=None)
    msg = format_notify_new_device(d)
    assert "192.168.1.5" in msg
    assert "aa:bb:cc:dd:ee:03" in msg
    assert "Hostname nas" in msg or "nas" in msg


def test_notify_ip_changed_shows_arrow():
    d = Device(mac="aa:bb:cc:dd:ee:04", ip="192.168.1.9", name="Router")
    msg = format_notify_ip_changed(d, old_ip="192.168.1.1", new_ip="192.168.1.9")
    assert "Router" in msg
    assert "192.168.1.1 → 192.168.1.9" in msg
    assert "MAC" in msg


def test_notify_offline_and_port():
    d = Device(mac="aa:bb:cc:dd:ee:05", ip="10.0.0.2", name="PC")
    assert "Went offline" in format_notify_offline(d)
    assert "Port 445" in format_notify_port_opened(d, port=445)
    assert "PC" in format_notify_port_opened(d, port=445)
