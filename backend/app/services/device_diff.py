from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.device import Device
from app.services.device_events import log_event, log_event_and_maybe_notify
from app.services.nettools import default_web_ui_local
from app.services.oui import backfill_device_vendors, lookup_vendor
from app.services.scoring import compute_device_score


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


def _port_set(open_ports: list | None) -> set[int]:
    ports: set[int] = set()
    for entry in open_ports or []:
        if not isinstance(entry, dict):
            continue
        try:
            ports.add(int(entry["port"]))
        except (KeyError, TypeError, ValueError):
            continue
    return ports


def update_device_probe_fields(
    db: Session,
    device: Device,
    latency_ms: float | None,
    open_ports_merged: list[dict[str, Any]] | None,
    ports_ok: bool,
) -> None:
    """Apply latency / merged open_ports to device; emit port_opened/closed; rescore.

    When ``ports_ok`` is False, open_ports and ports_scanned_at are left unchanged
    (probe error isolation). Caller is responsible for commit.
    """
    now = datetime.now(timezone.utc)

    if latency_ms is not None:
        device.latency_ms = float(latency_ms)
        device.updated_at = now

    if ports_ok and open_ports_merged is not None:
        prev_ports = _port_set(device.open_ports if isinstance(device.open_ports, list) else None)
        new_ports = _port_set(open_ports_merged)

        for port in sorted(new_ports - prev_ports):
            log_event_and_maybe_notify(
                db,
                device.id,
                "port_opened",
                f"Port {port} opened on {device.mac}",
                details={"mac": device.mac, "port": port, "ip": device.ip},
            )
        for port in sorted(prev_ports - new_ports):
            log_event(
                db,
                device.id,
                "port_closed",
                details={"mac": device.mac, "port": port, "ip": device.ip},
            )

        device.open_ports = open_ports_merged
        device.ports_scanned_at = now
        device.updated_at = now

    score, _ = compute_device_score(device, now=now)
    device.security_score = score


def apply_scan_results(db: Session, found: list[HostResult]) -> DiffResult:
    now = datetime.now(timezone.utc)
    new_count = 0
    seen_macs: set[str] = set()
    touched: list[Device] = []

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
            log_event_and_maybe_notify(
                db,
                device.id,
                "new_device",
                f"New device {mac} at {host.ip}",
                details={"mac": mac, "ip": host.ip},
            )
            new_count += 1
            touched.append(device)
        else:
            was_offline = (device.status or "").lower() == "offline"
            if device.ip and device.ip != host.ip:
                old_ip = device.ip
                log_event_and_maybe_notify(
                    db,
                    device.id,
                    "ip_changed",
                    f"{mac} IP changed {old_ip} → {host.ip}",
                    details={"mac": mac, "old_ip": old_ip, "new_ip": host.ip},
                )
            if was_offline:
                # Event only — no notification (came_online maps to None)
                log_event(
                    db,
                    device.id,
                    "came_online",
                    details={"mac": mac, "ip": host.ip},
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
            touched.append(device)

    online_devices = db.query(Device).filter(Device.status == "online").all()
    for device in online_devices:
        if device.mac not in seen_macs:
            device.status = "offline"
            device.updated_at = now
            log_event_and_maybe_notify(
                db,
                device.id,
                "went_offline",
                f"Device {device.mac} went offline",
                details={"mac": device.mac},
            )
            touched.append(device)

    # Backfill OUI for inventory rows still missing vendor (cache may load mid-scan)
    missing = (
        db.query(Device)
        .filter((Device.vendor.is_(None)) | (Device.vendor == ""))
        .all()
    )
    if missing:
        backfill_device_vendors(missing)

    for device in touched:
        score, _ = compute_device_score(device, now=now)
        device.security_score = score
    # Rescore devices that only received a vendor fill (score uses no_vendor penalty)
    touched_ids = {d.id for d in touched}
    for device in missing:
        if device.id not in touched_ids and device.vendor:
            score, _ = compute_device_score(device, now=now)
            device.security_score = score

    db.commit()
    return DiffResult(devices_found=len(seen_macs), new_devices=new_count)
