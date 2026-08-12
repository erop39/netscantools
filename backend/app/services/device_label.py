"""Human-facing device labels for API payloads and notifications."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.device import Device


def _trim(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def device_display_name(device: Device | None) -> str | None:
    """Prefer manual name, then DNS hostname, then IP, then MAC.

    Never returns ``Device #id`` — that is not a human label.
    """
    if device is None:
        return None
    for raw in (device.name, device.hostname, device.ip, device.mac):
        s = _trim(raw if isinstance(raw, str) else (str(raw) if raw is not None else None))
        if s:
            return s
    return None


def device_names_by_id(db: Session, ids: set[int] | list[int]) -> dict[int, str]:
    """Batch-resolve display names for device ids (skips missing ids)."""
    uniq = {int(i) for i in ids if i is not None}
    if not uniq:
        return {}
    rows = db.query(Device).filter(Device.id.in_(uniq)).all()
    out: dict[int, str] = {}
    for d in rows:
        label = device_display_name(d)
        if label:
            out[d.id] = label
    return out


def devices_by_id(db: Session, ids: set[int] | list[int]) -> dict[int, Device]:
    uniq = {int(i) for i in ids if i is not None}
    if not uniq:
        return {}
    rows = db.query(Device).filter(Device.id.in_(uniq)).all()
    return {d.id: d for d in rows}


def device_identity_bits(
    *,
    name: str | None = None,
    hostname: str | None = None,
    ip: str | None = None,
    mac: str | None = None,
) -> list[str]:
    """Ordered facts for notifications: Name / Hostname / IP / MAC (no duplicates)."""
    bits: list[str] = []
    seen: set[str] = set()

    def add(prefix: str, value: str | None) -> None:
        v = _trim(value)
        if not v:
            return
        key = v.casefold()
        if key in seen:
            return
        seen.add(key)
        bits.append(f"{prefix} {v}")

    add("Name", name)
    # Hostname only if different from name
    hn = _trim(hostname)
    nm = _trim(name)
    if hn and (not nm or hn.casefold() != nm.casefold()):
        add("Hostname", hn)
    add("IP", ip)
    add("MAC", mac)
    return bits


def device_identity_line(device: Device | None, **overrides: str | None) -> str:
    """Compact identity for messages: Name foo · IP x · MAC y."""
    if device is None and not overrides:
        return "Unknown device"
    name = overrides.get("name", device.name if device else None)
    hostname = overrides.get("hostname", device.hostname if device else None)
    ip = overrides.get("ip", device.ip if device else None)
    mac = overrides.get("mac", device.mac if device else None)
    bits = device_identity_bits(name=name, hostname=hostname, ip=ip, mac=mac)
    return " · ".join(bits) if bits else "Unknown device"


def format_notify_new_device(
    device: Device,
    *,
    ip: str | None = None,
    hostname: str | None = None,
) -> str:
    line = device_identity_line(
        device,
        ip=ip if ip is not None else device.ip,
        hostname=hostname if hostname is not None else device.hostname,
    )
    return f"New device on the network — {line}"


def format_notify_ip_changed(
    device: Device,
    *,
    old_ip: str,
    new_ip: str,
) -> str:
    label = device_display_name(device) or device.mac
    extra = device_identity_bits(
        name=device.name,
        hostname=device.hostname,
        mac=device.mac,
    )
    # Drop IP from bits — we state the change explicitly
    extra = [b for b in extra if not b.startswith("IP ")]
    tail = f" · {' · '.join(extra)}" if extra else ""
    return f"{label}: IP {old_ip} → {new_ip}{tail}"


def format_notify_offline(device: Device) -> str:
    line = device_identity_line(device)
    return f"Went offline — {line}"


def format_notify_port_opened(device: Device, *, port: int) -> str:
    line = device_identity_line(device)
    return f"Port {port} opened — {line}"
