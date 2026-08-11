from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.notification import Notification
from app.services.nettools import default_web_ui_local
from app.services.oui import lookup_vendor


@dataclass
class HostResult:
    mac: str
    ip: str
    hostname: str | None = None
    vendor: str | None = None


@dataclass
class DiffResult:
    devices_found: int
    new_devices: int


def normalize_mac(mac: str) -> str:
    cleaned = mac.strip().lower().replace("-", ":")
    parts = cleaned.split(":")
    if len(parts) != 6:
        raise ValueError(f"Invalid MAC: {mac}")
    return ":".join(p.zfill(2) for p in parts)


def apply_scan_results(db: Session, found: list[HostResult]) -> DiffResult:
    now = datetime.now(timezone.utc)
    new_count = 0
    seen_macs: set[str] = set()

    for host in found:
        mac = normalize_mac(host.mac)
        seen_macs.add(mac)
        vendor = host.vendor or lookup_vendor(mac)
        device = db.query(Device).filter(Device.mac == mac).first()
        if device is None:
            device = Device(
                mac=mac,
                ip=host.ip,
                vendor=vendor,
                hostname=host.hostname,
                status="online",
                last_seen=now,
                first_seen=now,
                updated_at=now,
                # Default openable LAN link for discovered gear
                web_ui_local=default_web_ui_local(host.ip),
            )
            db.add(device)
            db.flush()
            db.add(
                Notification(
                    type="new_device",
                    device_id=device.id,
                    message=f"New device {mac} at {host.ip}",
                )
            )
            new_count += 1
        else:
            if device.ip and device.ip != host.ip:
                db.add(
                    Notification(
                        type="ip_changed",
                        device_id=device.id,
                        message=f"{mac} IP changed {device.ip} → {host.ip}",
                    )
                )
            device.ip = host.ip
            device.status = "online"
            device.last_seen = now
            device.updated_at = now
            if host.hostname:
                device.hostname = host.hostname
            if vendor and not device.vendor:
                device.vendor = vendor
            # Keep a usable open link if user never set one
            if not device.web_ui_local and host.ip:
                device.web_ui_local = default_web_ui_local(host.ip)

    online_devices = db.query(Device).filter(Device.status == "online").all()
    for device in online_devices:
        if device.mac not in seen_macs:
            device.status = "offline"
            device.updated_at = now
            db.add(
                Notification(
                    type="device_offline",
                    device_id=device.id,
                    message=f"Device {device.mac} went offline",
                )
            )

    db.commit()
    return DiffResult(devices_found=len(seen_macs), new_devices=new_count)
