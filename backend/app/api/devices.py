from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceOut, DeviceUpdate, PingOut, ResolveOut
from app.services.nettools import ping_detail, resolve_hostname

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[Device]:
    query = db.query(Device)
    if status_filter:
        query = query.filter(Device.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Device.mac.ilike(like))
            | (Device.ip.ilike(like))
            | (Device.hostname.ilike(like))
            | (Device.vendor.ilike(like))
            | (Device.notes.ilike(like))
        )
    return query.order_by(Device.last_seen.desc().nullslast()).all()


@router.get("/{device_id}", response_model=DeviceOut)
def get_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    body: DeviceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Device:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()


@router.post("/{device_id}/ping", response_model=PingOut)
def ping_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PingOut:
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")
    result = ping_detail(device.ip)
    # Light status update from live ping
    device.status = "online" if result.ok else "offline"
    device.updated_at = datetime.now(timezone.utc)
    if result.ok:
        device.last_seen = datetime.now(timezone.utc)
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
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if not device.ip:
        raise HTTPException(status_code=400, detail="Device has no IP address")
    name = resolve_hostname(device.ip, timeout=2.0)
    if name:
        device.hostname = name
        device.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(device)
    return ResolveOut(hostname=name, device=device)
