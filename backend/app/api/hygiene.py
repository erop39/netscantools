from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.hygiene import HygieneChecklistItem
from app.models.setting import Setting
from app.models.user import User
from app.schemas.hygiene import (
    ChecklistItemOut,
    ChecklistUpdate,
    HygieneScanPortsOut,
    HygieneSummaryOut,
)
from app.services import hygiene as hygiene_svc
from app.services import port_probe as port_probe_mod
from app.services import scanner as scanner_mod
from app.services.device_diff import update_device_probe_fields

router = APIRouter(prefix="/api/hygiene", tags=["hygiene"])


@router.get("", response_model=HygieneSummaryOut)
def get_hygiene_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> HygieneSummaryOut:
    hygiene_svc.ensure_checklist(db)
    return HygieneSummaryOut.model_validate(hygiene_svc.build_hygiene_summary(db))


@router.get("/checklist", response_model=list[ChecklistItemOut])
def list_checklist(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[HygieneChecklistItem]:
    return hygiene_svc.ensure_checklist(db)


@router.patch("/checklist/{item_id}", response_model=ChecklistItemOut)
def update_checklist_item(
    item_id: int,
    body: ChecklistUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> HygieneChecklistItem:
    item = db.query(HygieneChecklistItem).filter(HygieneChecklistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.checked = body.checked
    item.checked_at = datetime.now(timezone.utc) if body.checked else None
    db.commit()
    db.refresh(item)
    return item


@router.post("/scan-ports", response_model=HygieneScanPortsOut)
def scan_all_online_ports(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> HygieneScanPortsOut:
    """Full TCP port scan for all online devices; shares scanner lock (409 if busy)."""
    if not scanner_mod._scan_lock.acquire(blocking=False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan already running",
        )
    try:
        row = db.query(Setting).filter(Setting.key == "scan_ports").first()
        ports_csv = row.value if row and row.value else "80,443,8080"
        scanned_ports = port_probe_mod.parse_port_csv(ports_csv)

        devices = (
            db.query(Device)
            .filter(Device.status == "online")
            .order_by(Device.id.asc())
            .all()
        )
        total = len(devices)
        scanned = 0
        ok_count = 0
        failed = 0

        for device in devices:
            if not device.ip:
                continue
            scanned += 1
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
                ok_count += 1
            else:
                failed += 1

            update_device_probe_fields(
                db,
                device,
                latency_ms=None,
                open_ports_merged=merged,
                ports_ok=ports_ok,
            )

        db.commit()
        return HygieneScanPortsOut(
            total=total,
            scanned=scanned,
            ok=ok_count,
            failed=failed,
        )
    finally:
        scanner_mod._scan_lock.release()
