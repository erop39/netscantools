from __future__ import annotations

import ipaddress
import re
from typing import Literal

from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.plan import NetworkPlan
from app.models.setting import Setting
from app.schemas.planner import PlanOut, PortOut, SlotOut

MatchBadge = Literal["match", "mismatch", "linked-no-ip", "reserve"]

_MAC_PART = re.compile(r"^[0-9A-Fa-f]{1,2}$")


def normalize_mac(mac: str | None) -> str | None:
    """Normalize MAC to uppercase colon form (AA:BB:CC:DD:EE:FF).

    Accepts colon or hyphen separators. Empty/None → None. Invalid → ValueError.
    """
    if mac is None:
        return None
    cleaned = mac.strip()
    if not cleaned:
        return None
    cleaned = cleaned.upper().replace("-", ":")
    parts = cleaned.split(":")
    if len(parts) != 6 or not all(_MAC_PART.fullmatch(p) for p in parts):
        raise ValueError(f"Invalid MAC: {mac}")
    return ":".join(p.zfill(2) for p in parts)


def ip_in_cidr(ip: str, cidr: str) -> bool:
    """Return True if *ip* is inside *cidr* network."""
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        return False


def ensure_plan(db: Session) -> NetworkPlan:
    """Return the singleton network plan, creating it if missing."""
    plan = db.query(NetworkPlan).first()
    if plan is not None:
        return plan

    cidr: str | None = None
    setting = db.query(Setting).filter(Setting.key == "scan_subnet").first()
    if setting and setting.value:
        cidr = setting.value.strip() or None

    plan = NetworkPlan(name="Home LAN", cidr=cidr)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _match_badge(
    device_mac: str | None,
    planned_ip: str | None,
    live_ip: str | None,
) -> MatchBadge:
    if not device_mac:
        return "reserve"
    if not live_ip:
        return "linked-no-ip"
    if planned_ip and live_ip == planned_ip:
        return "match"
    return "mismatch"


def _devices_by_mac(db: Session) -> dict[str, Device]:
    """Map normalized uppercase MAC → Device (case-insensitive inventory keys)."""
    result: dict[str, Device] = {}
    for device in db.query(Device).all():
        try:
            key = normalize_mac(device.mac)
        except ValueError:
            continue
        if key:
            result[key] = device
    return result


def plan_to_out(db: Session, plan: NetworkPlan) -> PlanOut:
    """Serialize plan with slots, ports, and live device enrichment."""
    devices = _devices_by_mac(db)
    slots_out: list[SlotOut] = []
    for slot in plan.slots:
        live_ip: str | None = None
        live_status: str | None = None
        device_id: int | None = None
        mac_key: str | None = None
        if slot.device_mac:
            try:
                mac_key = normalize_mac(slot.device_mac)
            except ValueError:
                mac_key = slot.device_mac
            device = devices.get(mac_key) if mac_key else None
            if device is not None:
                live_ip = device.ip
                live_status = device.status
                device_id = device.id

        ports_out = [
            PortOut(
                id=p.id,
                port=p.port,
                label=p.label,
                sort_order=p.sort_order,
            )
            for p in slot.ports
        ]
        slots_out.append(
            SlotOut(
                id=slot.id,
                sort_order=slot.sort_order,
                planned_ip=slot.planned_ip,
                hostname_hint=slot.hostname_hint,
                role_label=slot.role_label,
                device_mac=slot.device_mac,
                notes=slot.notes,
                ports=ports_out,
                live_ip=live_ip,
                live_status=live_status,
                device_id=device_id,
                match=_match_badge(slot.device_mac, slot.planned_ip, live_ip),
            )
        )

    return PlanOut(
        id=plan.id,
        name=plan.name,
        cidr=plan.cidr,
        notes=plan.notes,
        updated_at=plan.updated_at,
        slots=slots_out,
    )
