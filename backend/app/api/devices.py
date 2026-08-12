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
    WolOut,
)
from app.services import port_probe as port_probe_mod
from app.services import scanner as scanner_mod
from app.services import smb_enum as smb_enum_mod
from app.services import tls_check as tls_check_mod
from app.services import wol as wol_mod
from app.services.device_diff import update_device_probe_fields
from app.services.device_events import log_event
from app.services.nettools import ping_detail, resolve_hostname, resolve_hostnames
from app.schemas.latency import LatencySampleOut
from app.services import latency_history as latency_mod
from app.services.scoring import NEW_DEVICE_HOURS, compute_device_score

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_device_out(device: Device, *, with_breakdown: bool = False) -> DeviceOut:
    """Map Device ORM → DeviceOut; always set is_new; optional score_breakdown.

    When with_breakdown=True, recompute live score + breakdown via
    compute_device_score so security_score never drifts from score_breakdown.
    Also writes the live score back onto the ORM instance (caller may commit
    to refresh the list-cache, e.g. on detail GET).
    """
    now = datetime.now(timezone.utc)
    first_seen = _as_utc(device.first_seen)
    is_new = (
        first_seen is not None
        and first_seen >= now - timedelta(hours=NEW_DEVICE_HOURS)
    )
    breakdown: list[dict] | None = None
    updates: dict = {"is_new": is_new, "score_breakdown": breakdown}
    if with_breakdown:
        score, breakdown = compute_device_score(device, now=now)
        device.security_score = score  # in-memory cache write-back
        updates["security_score"] = score
        updates["score_breakdown"] = breakdown
    base = DeviceOut.model_validate(device)
    return base.model_copy(update=updates)


def _get_device_or_404(db: Session, device_id: int) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("", response_model=list[DeviceOut])
def list_devices(
    status_filter: str | None = Query(default=None, alias="status"),
    location: str | None = Query(default=None),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    query = db.query(Device)
    if status_filter:
        query = query.filter(Device.status == status_filter)
    if location is not None and location.strip() != "":
        loc = location.strip()
        if loc.lower() in ("__none__", "(none)", "none"):
            query = query.filter((Device.location.is_(None)) | (Device.location == ""))
        else:
            query = query.filter(Device.location == loc)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Device.mac.ilike(like))
            | (Device.ip.ilike(like))
            | (Device.hostname.ilike(like))
            | (Device.name.ilike(like))
            | (Device.vendor.ilike(like))
            | (Device.location.ilike(like))
            | (Device.notes.ilike(like))
        )
    devices = query.order_by(Device.last_seen.desc().nullslast()).all()
    return [to_device_out(d) for d in devices]


@router.get("/locations", response_model=list[str])
def list_locations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[str]:
    """Distinct non-empty location labels for filter dropdowns."""
    rows = (
        db.query(Device.location)
        .filter(Device.location.isnot(None), Device.location != "")
        .distinct()
        .order_by(Device.location.asc())
        .all()
    )
    return [r[0] for r in rows if r[0]]


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
    out = to_device_out(device, with_breakdown=True)
    # Persist recomputed score so subsequent list views stay fresher
    db.commit()
    return out


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
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceEvent]:
    _get_device_or_404(db, device_id)
    return (
        db.query(DeviceEvent)
        .filter(DeviceEvent.device_id == device_id)
        .order_by(DeviceEvent.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/{device_id}/latency-history", response_model=list[LatencySampleOut])
def device_latency_history(
    device_id: int,
    limit: int = Query(48, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list:
    _get_device_or_404(db, device_id)
    return latency_mod.list_latency(db, device_id, limit=limit)


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


@router.post("/{device_id}/scan-shares", response_model=DeviceOut)
def scan_device_shares(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    """Enumerate SMB shares via ``net view \\\\ip /all`` (Windows, read-only)."""
    device = _get_device_or_404(db, device_id)
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")

    now = datetime.now(timezone.utc)
    prev = device.smb_shares if isinstance(device.smb_shares, list) else None
    result = smb_enum_mod.enum_smb_shares(device.ip)

    device.smb_scan_status = result.status
    device.smb_scanned_at = now
    device.updated_at = now

    if result.status == "ok":
        found, gone = smb_enum_mod.diff_share_names(prev, result.shares)
        device.smb_shares = smb_enum_mod.shares_to_json(result.shares)
        by_name = {s.name.lower(): s for s in result.shares}
        for name in sorted(found):
            entry = by_name.get(name)
            details = {
                "name": entry.name if entry else name,
                "share_type": entry.share_type if entry else "unknown",
                "ip": device.ip,
                "hidden": entry.hidden if entry else name.endswith("$"),
                "admin": name in smb_enum_mod.ADMIN_SHARE_NAMES,
            }
            log_event(db, device.id, "share_found", details=details)
        for name in sorted(gone):
            log_event(
                db,
                device.id,
                "share_gone",
                details={"name": name, "ip": device.ip},
            )
    # On failure keep previous smb_shares; only status + timestamp change

    db.commit()
    db.refresh(device)
    return to_device_out(device, with_breakdown=True)


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
            try:
                latency_mod.record_latency(db, device.id, float(result.rtt_ms), when=now)
            except Exception:
                pass
    db.commit()
    return PingOut(
        ok=result.ok,
        ip=result.ip,
        rtt_ms=result.rtt_ms,
        message=result.message,
    )


@router.post("/{device_id}/wol", response_model=WolOut)
def wake_on_lan(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> WolOut:
    """Send Wake-on-LAN magic packet for this device MAC."""
    device = _get_device_or_404(db, device_id)
    result = wol_mod.send_wol(device.mac)
    return WolOut(ok=result.ok, mac=result.mac, message=result.message)


@router.post("/{device_id}/check-tls", response_model=DeviceOut)
def check_device_tls(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DeviceOut:
    """Probe HTTPS certificate (web_ui https or IP:443)."""
    device = _get_device_or_404(db, device_id)
    now = datetime.now(timezone.utc)
    probe = tls_check_mod.probe_device_tls(device)
    device.tls_status = probe.status
    device.tls_expires_at = probe.expires_at
    device.tls_issuer = probe.issuer
    device.tls_error = probe.error
    device.tls_checked_at = now
    device.updated_at = now
    score, _ = compute_device_score(device, now=now)
    device.security_score = score
    db.commit()
    db.refresh(device)
    return to_device_out(device, with_breakdown=True)


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
