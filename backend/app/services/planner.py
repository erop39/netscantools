from __future__ import annotations

import ipaddress
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.plan import NetworkPlan, PlanPort, PlanSlot
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


def validate_planned_ip(plan: NetworkPlan, planned_ip: str | None) -> None:
    """Raise 400 if planned_ip is set and outside plan.cidr."""
    if planned_ip and plan.cidr and not ip_in_cidr(planned_ip, plan.cidr):
        raise HTTPException(status_code=400, detail="planned_ip outside plan.cidr")


def assert_slot_unique(
    db: Session,
    plan_id: int,
    planned_ip: str | None,
    device_mac: str | None,
    exclude_slot_id: int | None = None,
) -> None:
    """Raise 409 if another slot in the plan already has this IP or MAC."""
    if planned_ip:
        q = db.query(PlanSlot).filter(
            PlanSlot.plan_id == plan_id,
            PlanSlot.planned_ip == planned_ip,
        )
        if exclude_slot_id is not None:
            q = q.filter(PlanSlot.id != exclude_slot_id)
        if q.first() is not None:
            raise HTTPException(status_code=409, detail="planned_ip already in use")

    if device_mac:
        q = db.query(PlanSlot).filter(
            PlanSlot.plan_id == plan_id,
            PlanSlot.device_mac == device_mac,
        )
        if exclude_slot_id is not None:
            q = q.filter(PlanSlot.id != exclude_slot_id)
        if q.first() is not None:
            raise HTTPException(status_code=409, detail="device_mac already in use")


def assert_port_unique(
    db: Session,
    slot_id: int,
    port: int,
    exclude_port_id: int | None = None,
) -> None:
    """Raise 409 if the slot already has this port number."""
    q = db.query(PlanPort).filter(PlanPort.slot_id == slot_id, PlanPort.port == port)
    if exclude_port_id is not None:
        q = q.filter(PlanPort.id != exclude_port_id)
    if q.first() is not None:
        raise HTTPException(status_code=409, detail="port already exists on slot")


def next_slot_sort_order(db: Session, plan_id: int) -> int:
    current = (
        db.query(func.max(PlanSlot.sort_order))
        .filter(PlanSlot.plan_id == plan_id)
        .scalar()
    )
    return 0 if current is None else int(current) + 1


def next_port_sort_order(db: Session, slot_id: int) -> int:
    current = (
        db.query(func.max(PlanPort.sort_order))
        .filter(PlanPort.slot_id == slot_id)
        .scalar()
    )
    return 0 if current is None else int(current) + 1


def renumber_slot_orders(db: Session, plan_id: int) -> None:
    """Renumber plan slots to contiguous sort_order 0..n-1."""
    slots = (
        db.query(PlanSlot)
        .filter(PlanSlot.plan_id == plan_id)
        .order_by(PlanSlot.sort_order, PlanSlot.id)
        .all()
    )
    for i, slot in enumerate(slots):
        slot.sort_order = i


def touch_plan(plan: NetworkPlan) -> None:
    plan.updated_at = datetime.now(timezone.utc)


def get_slot_or_404(db: Session, slot_id: int) -> PlanSlot:
    slot = db.query(PlanSlot).filter(PlanSlot.id == slot_id).first()
    if slot is None:
        raise HTTPException(status_code=404, detail="Slot not found")
    return slot


def get_port_or_404(db: Session, port_id: int) -> PlanPort:
    port = db.query(PlanPort).filter(PlanPort.id == port_id).first()
    if port is None:
        raise HTTPException(status_code=404, detail="Port not found")
    return port


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


def _slot_to_out(slot: PlanSlot, devices: dict[str, Device]) -> SlotOut:
    live_ip: str | None = None
    live_status: str | None = None
    device_id: int | None = None
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
    return SlotOut(
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


def slot_to_out(db: Session, slot: PlanSlot) -> SlotOut:
    """Serialize a single slot with live enrichment."""
    return _slot_to_out(slot, _devices_by_mac(db))


def port_to_out(port: PlanPort) -> PortOut:
    return PortOut(
        id=port.id,
        port=port.port,
        label=port.label,
        sort_order=port.sort_order,
    )


def plan_to_out(db: Session, plan: NetworkPlan) -> PlanOut:
    """Serialize plan with slots, ports, and live device enrichment."""
    devices = _devices_by_mac(db)
    slots_out = [_slot_to_out(slot, devices) for slot in plan.slots]
    return PlanOut(
        id=plan.id,
        name=plan.name,
        cidr=plan.cidr,
        notes=plan.notes,
        updated_at=plan.updated_at,
        slots=slots_out,
    )
