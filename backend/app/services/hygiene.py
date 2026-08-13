"""Hygiene checklist seed and summary assembly."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.event import DeviceEvent
from app.models.hygiene import HygieneChecklistItem
from app.services.device_label import device_names_by_id
from app.services.scoring import NEW_DEVICE_HOURS, RISKY_PORTS, compute_network_score

# Spec §5.3 — seed when checklist table is empty
CHECKLIST_SEED: list[tuple[str, str]] = [
    ("router_password", "Router admin password changed from default"),
    ("guest_isolation", "Guest Wi‑Fi isolated from LAN"),
    ("upnp_off", "UPnP disabled (or reviewed)"),
    ("firmware_updated", "Router / AP firmware up to date"),
    ("remote_admin_off", "WAN remote admin disabled"),
    ("wifi_auth", "Wi‑Fi uses WPA2/WPA3 (not open/WEP)"),
    ("unused_ports", "Unused forwarded ports closed"),
]

TOP_RISKS_LIMIT = 10
RECENT_EVENTS_LIMIT = 20


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _port_numbers(open_ports: Any) -> list[int]:
    if not open_ports:
        return []
    ports: list[int] = []
    for entry in open_ports:
        if isinstance(entry, dict):
            p = entry.get("port")
        else:
            p = getattr(entry, "port", None)
        if p is None:
            continue
        try:
            ports.append(int(p))
        except (TypeError, ValueError):
            continue
    return ports


def is_risky_device(device: Device) -> bool:
    """Risky: score < 50 (when set) or any open port in RISKY_PORTS."""
    if device.security_score is not None and device.security_score < 50:
        return True
    ports = _port_numbers(device.open_ports if isinstance(device.open_ports, list) else None)
    return any(p in RISKY_PORTS for p in ports)


def ensure_checklist(db: Session) -> list[HygieneChecklistItem]:
    """Return checklist items ordered by sort_order; seed 7 defaults if empty."""
    existing = (
        db.query(HygieneChecklistItem)
        .order_by(HygieneChecklistItem.sort_order.asc(), HygieneChecklistItem.id.asc())
        .all()
    )
    if existing:
        return existing

    for order, (key, label) in enumerate(CHECKLIST_SEED):
        db.add(
            HygieneChecklistItem(
                key=key,
                label=label,
                checked=False,
                checked_at=None,
                sort_order=order,
            )
        )
    db.commit()
    return (
        db.query(HygieneChecklistItem)
        .order_by(HygieneChecklistItem.sort_order.asc(), HygieneChecklistItem.id.asc())
        .all()
    )


def build_hygiene_summary(db: Session) -> dict[str, Any]:
    """Assemble GET /api/hygiene payload (dict matching HygieneSummaryOut)."""
    now = datetime.now(timezone.utc)
    new_cutoff = now - timedelta(hours=NEW_DEVICE_HOURS)

    devices = db.query(Device).all()
    online = 0
    offline = 0
    new_24h = 0
    risky_devices = 0
    online_scores: list[int] = []
    risky_list: list[Device] = []

    for d in devices:
        status = (d.status or "").lower()
        if status == "online":
            online += 1
            if d.security_score is not None:
                online_scores.append(int(d.security_score))
        elif status == "offline":
            offline += 1

        first_seen = _as_utc(d.first_seen)
        if first_seen is not None and first_seen >= new_cutoff:
            new_24h += 1

        if is_risky_device(d):
            risky_devices += 1
            risky_list.append(d)

    # Lowest scores first; treat missing score as worst among ties with risky ports
    risky_list.sort(
        key=lambda d: (
            d.security_score if d.security_score is not None else -1,
            d.id,
        )
    )
    top_risks = [
        {
            "device_id": d.id,
            "mac": d.mac,
            "name": d.name,
            "security_score": d.security_score,
            "ip": d.ip,
        }
        for d in risky_list[:TOP_RISKS_LIMIT]
    ]

    recent = (
        db.query(DeviceEvent)
        .order_by(DeviceEvent.created_at.desc())
        .limit(RECENT_EVENTS_LIMIT)
        .all()
    )
    event_names = device_names_by_id(
        db, {e.device_id for e in recent if e.device_id is not None}
    )
    recent_events = [
        {
            "id": e.id,
            "device_id": e.device_id,
            "device_name": (
                event_names.get(e.device_id) if e.device_id is not None else None
            ),
            "type": e.type,
            "details": e.details,
            "created_at": e.created_at,
        }
        for e in recent
    ]

    return {
        "network_score": compute_network_score(online_scores),
        "counts": {
            "online": online,
            "offline": offline,
            "new_24h": new_24h,
            "risky_devices": risky_devices,
        },
        "top_risks": top_risks,
        "recent_events": recent_events,
    }
