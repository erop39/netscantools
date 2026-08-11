from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.plan import PlanPort, PlanSlot
from app.models.user import User
from app.schemas.planner import (
    PlanCandidate,
    PlanImport,
    PlanOut,
    PlanUpdate,
    PortCreate,
    PortOut,
    PortUpdate,
    ReorderBody,
    SlotCreate,
    SlotOut,
    SlotUpdate,
)
from app.services import planner as svc

router = APIRouter(prefix="/api/planner", tags=["planner"])


@router.get("", response_model=PlanOut)
def get_plan(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.ensure_plan(db)
    return svc.plan_to_out(db, plan)


@router.put("", response_model=PlanOut)
def update_plan(
    body: PlanUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.ensure_plan(db)
    plan.name = body.name
    plan.cidr = body.cidr
    plan.notes = body.notes
    svc.touch_plan(plan)
    db.commit()
    db.refresh(plan)
    return svc.plan_to_out(db, plan)


@router.post("/slots", response_model=SlotOut)
def create_slot(
    body: SlotCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SlotOut:
    plan = svc.ensure_plan(db)
    try:
        device_mac = svc.normalize_mac(body.device_mac)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    svc.validate_planned_ip(plan, body.planned_ip)
    svc.assert_slot_unique(db, plan.id, body.planned_ip, device_mac)

    slot = PlanSlot(
        plan_id=plan.id,
        sort_order=svc.next_slot_sort_order(db, plan.id),
        planned_ip=body.planned_ip,
        hostname_hint=body.hostname_hint,
        role_label=body.role_label,
        device_mac=device_mac,
        notes=body.notes,
    )
    db.add(slot)
    svc.touch_plan(plan)
    db.commit()
    db.refresh(slot)
    return svc.slot_to_out(db, slot)


@router.put("/slots/reorder", response_model=PlanOut)
def reorder_slots(
    body: ReorderBody,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.ensure_plan(db)
    existing_ids = {s.id for s in plan.slots}
    requested = body.slot_ids
    if len(requested) != len(set(requested)) or set(requested) != existing_ids:
        raise HTTPException(
            status_code=400,
            detail="slot_ids must be a permutation of existing plan slots",
        )
    by_id = {s.id: s for s in plan.slots}
    for order, slot_id in enumerate(requested):
        by_id[slot_id].sort_order = order
    svc.touch_plan(plan)
    db.commit()
    db.refresh(plan)
    return svc.plan_to_out(db, plan)


@router.patch("/slots/{slot_id}", response_model=SlotOut)
def update_slot(
    slot_id: int,
    body: SlotUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SlotOut:
    plan = svc.ensure_plan(db)
    slot = svc.get_slot_or_404(db, slot_id)
    if slot.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Slot not found")

    data = body.model_dump(exclude_unset=True)

    if "device_mac" in data:
        try:
            data["device_mac"] = svc.normalize_mac(data["device_mac"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    planned_ip = data["planned_ip"] if "planned_ip" in data else slot.planned_ip
    device_mac = data["device_mac"] if "device_mac" in data else slot.device_mac

    svc.validate_planned_ip(plan, planned_ip)
    svc.assert_slot_unique(
        db, plan.id, planned_ip, device_mac, exclude_slot_id=slot.id
    )

    for field, value in data.items():
        setattr(slot, field, value)

    svc.touch_plan(plan)
    db.commit()
    db.refresh(slot)
    return svc.slot_to_out(db, slot)


@router.delete("/slots/{slot_id}", response_model=PlanOut)
def delete_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.ensure_plan(db)
    slot = svc.get_slot_or_404(db, slot_id)
    if slot.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Slot not found")
    db.delete(slot)
    db.flush()
    svc.renumber_slot_orders(db, plan.id)
    svc.touch_plan(plan)
    db.commit()
    db.refresh(plan)
    return svc.plan_to_out(db, plan)


@router.post("/slots/{slot_id}/ports", response_model=PortOut)
def create_port(
    slot_id: int,
    body: PortCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PortOut:
    plan = svc.ensure_plan(db)
    slot = svc.get_slot_or_404(db, slot_id)
    if slot.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Slot not found")

    svc.assert_port_unique(db, slot.id, body.port)
    port = PlanPort(
        slot_id=slot.id,
        port=body.port,
        label=body.label,
        sort_order=svc.next_port_sort_order(db, slot.id),
    )
    db.add(port)
    svc.touch_plan(plan)
    db.commit()
    db.refresh(port)
    return svc.port_to_out(port)


@router.patch("/ports/{port_id}", response_model=PortOut)
def update_port(
    port_id: int,
    body: PortUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PortOut:
    plan = svc.ensure_plan(db)
    port = svc.get_port_or_404(db, port_id)
    if port.slot.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Port not found")

    data = body.model_dump(exclude_unset=True)
    new_port_num = data["port"] if "port" in data else port.port
    if "port" in data:
        svc.assert_port_unique(db, port.slot_id, new_port_num, exclude_port_id=port.id)

    for field, value in data.items():
        setattr(port, field, value)

    svc.touch_plan(plan)
    db.commit()
    db.refresh(port)
    return svc.port_to_out(port)


@router.delete("/ports/{port_id}", response_model=PortOut)
def delete_port(
    port_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PortOut:
    plan = svc.ensure_plan(db)
    port = svc.get_port_or_404(db, port_id)
    if port.slot.plan_id != plan.id:
        raise HTTPException(status_code=404, detail="Port not found")
    out = svc.port_to_out(port)
    db.delete(port)
    svc.touch_plan(plan)
    db.commit()
    return out


@router.get("/export")
def export_plan(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> JSONResponse:
    plan = svc.ensure_plan(db)
    payload = svc.build_export_dict(plan)
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="network-plan.json"'},
    )


@router.post("/import", response_model=PlanOut)
def import_plan(
    body: PlanImport,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PlanOut:
    plan = svc.import_plan_replace(db, body.model_dump())
    return svc.plan_to_out(db, plan)


@router.get("/candidates", response_model=list[PlanCandidate])
def get_candidates(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PlanCandidate]:
    devices = svc.list_candidates(db)
    return [
        PlanCandidate(
            id=d.id,
            mac=d.mac,
            ip=d.ip,
            name=d.name,
            hostname=d.hostname,
            status=d.status,
        )
        for d in devices
    ]
