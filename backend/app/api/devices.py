from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.event import DeviceEvent
from app.models.setting import Setting
from app.models.user import User
from app.schemas.device import (
    DeviceEventOut,
    DeviceOut,
    DeviceUpdate,
    PingOut,
    ResolveAllOut,
    ResolveOut,
)
from app.services import port_probe as port_probe_mod
from app.services import scanner as scanner_mod
from app.services.device_diff import update_device_probe_fields
from app.services.nettools import ping_detail, resolve_hostname, resolve_hostnames
from app.services.scoring import NEW_DEVICE_HOURS, compute_device_score

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_device_out(device: Device, *, with_breakdown: bool = False) -> DeviceOut:
    """Map Device ORM → DeviceOut; always set is_new; optional score_breakdown."""
    now = datetime.now(timezone.utc)
    first_seen = _as_utc(device.first_seen)
    is_new = (
        first_seen is not None
        and first_seen >= now - timedelta(hours=NEW_DEVICE_HOURS)
    )
    breakdown: list[dict] | None = None
    if with_breakdown:
        _, breakdown = compute_device_score(device, now=now)
    base = DeviceOut.model_validate(device)
    return base.model_copy(
        update={
            "is_new": is_new,
            "score_breakdown": breakdown,
        }
    )


def _get_device_or_404(db: Session, device_id: int) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("", response_model=list[DeviceOut])
def list_devices(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    query = db.query(Device)
    if status_filter:
        query = query.filter(Device.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Device.mac.ilike(like))
            | (Device.ip.ilike(like))
            | (Device.hostname.ilike(like))
            | (Device.name.ilike(like))
            | (Device.vendor.ilike(like))
            | (Device.notes.ilike(like))
        )
    devices = query.order_by(Device.last_seen.desc().nullslast()).all()
    return [to_device_out(d) for d in devices]


@router.post("/resolve-all", response_model=ResolveAllOut)
def resolve_all_devices(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ResolveAllOut:
    """Reverse-DNS all devices that have an IP. Does not overwrite manual name."""
    devices = db.query(Device).filter(Device.ip.isnot(None)).all()
    ips = [d.ip for d in devices if d.ip]
    names = resolve_hostnames(ips, concurrency=32, timeout=1.5)
    resolved = 0
    now = datetime.now(timezone.utc)
    for d in devices:
        if not d.ip:
            continue
        host = names.get(d.ip)
        if host:
            d.hostname = host
            d.updated_at = now
            resolved += 1
    db.commit()
    # refresh list
    devices = db.query(Device).order_by(Device.last_seen.desc().nullslast()).all()
    failed = len(ips) - resolved
    return ResolveAllOut(
        total=len(ips),
        resolved=resolved,
        failed=max(0, failed),
        devices=[to_device_out(d) for d in devices],
    )


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    device = _get_device_or_404(db, device_id)
    return to_device_out(device, with_breakdown=True)


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    device = _get_device_or_404(db, device_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    device.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(device)
    return to_device_out(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    device = _get_device_or_404(db, device_id)
    db.delete(device)
    db.commit()


@router.get("/{device_id}/events", response_model=list[DeviceEventOut])
def list_device_events(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceEvent]:
    _get_device_or_404(db, device_id)
    return (
        db.query(DeviceEvent)
        .filter(DeviceEvent.device_id == device_id)
        .order_by(DeviceEvent.created_at.desc())
        .all()
    )


@router.post("/{device_id}/scan-ports", response_model=DeviceOut)
def scan_device_ports(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    """Full TCP port scan using settings scan_ports; shares scanner lock (409 if busy)."""
    device = _get_device_or_404(db, device_id)
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")

    if not scanner_mod._scan_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan already running",
        )
    try:
        row = db.query(Setting).filter(Setting.key == "scan_ports").first()
        ports_csv = row.value if row and row.value else "80,443,8080"
        scanned_ports = port_probe_mod.parse_port_csv(ports_csv)

        ports_ok = False
        open_now: list[int] = []
        try:
            open_now = port_probe_mod.probe_host_ports(device.ip, scanned_ports)
            ports_ok = True
        except Exception:
            ports_ok = False

        merged = None
        if ports_ok:
            prev = device.open_ports if isinstance(device.open_ports, list) else None
            merged = port_probe_mod.merge_open_ports(
                prev,
                scanned_ports,
                open_now,
                "full",
            )

        update_device_probe_fields(
            db,
            device,
            latency_ms=None,
            open_ports_merged=merged,
            ports_ok=ports_ok,
        )
        db.commit()
        db.refresh(device)
        return to_device_out(device, with_breakdown=True)
    finally:
        scanner_mod._scan_lock.release()


@router.post("/{device_id}/ping", response_model=PingOut)
def ping_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PingOut:
    device = _get_device_or_404(db, device_id)
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")
    result = ping_detail(device.ip)
    now = datetime.now(timezone.utc)
    device.status = "online" if result.ok else "offline"
    device.updated_at = now
    if result.ok:
        device.last_seen = now
        if result.rtt_ms is not None:
            device.latency_ms = float(result.rtt_ms)
    db.commit()
    return PingOut(
        ok=result.ok,
        ip=result.ip,
        rtt_ms=result.rtt_ms,
        message=result.message,
    )


@router.post("/{device_id}/resolve", response_model=ResolveOut)
def resolve_device_hostname(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ResolveOut:
    device = _get_device_or_404(db, device_id)
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")
    name = resolve_hostname(device.ip, timeout=2.0)
    if name:
        device.hostname = name
        device.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(device)
    return ResolveOut(hostname=name, device=to_device_out(device))
