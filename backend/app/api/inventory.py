from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.inventory import InventoryItem, InventoryLocation
from app.models.plan import PlanSlot
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
    InventoryLocationCreate,
    InventoryLocationOut,
    InventoryLocationUpdate,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


def _next_sort_order(db: Session) -> int:
    rows = db.query(InventoryLocation.sort_order).all()
    if not rows:
        return 10
    return max(int(r[0] or 0) for r in rows) + 10


# ── Locations (must be before /{item_id}) ─────────────────────────


@router.get("/locations", response_model=list[InventoryLocationOut])
def list_locations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[InventoryLocation]:
    return (
        db.query(InventoryLocation)
        .order_by(InventoryLocation.sort_order.asc(), InventoryLocation.name.asc())
        .all()
    )


@router.post(
    "/locations",
    response_model=InventoryLocationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_location(
    body: InventoryLocationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> InventoryLocation:
    name = body.name.strip()
    dup = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.name.ilike(name))
        .first()
    )
    if dup is not None:
        raise HTTPException(status_code=400, detail="Location already exists")
    order = body.sort_order if body.sort_order is not None else _next_sort_order(db)
    row = InventoryLocation(name=name, sort_order=int(order))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/locations/{location_id}", response_model=InventoryLocationOut)
def update_location(
    location_id: int,
    body: InventoryLocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> InventoryLocation:
    row = db.query(InventoryLocation).filter(InventoryLocation.id == location_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Location not found")
    data = body.model_dump(exclude_unset=True)
    old_name = row.name
    if "name" in data and data["name"] is not None:
        new_name = data["name"]
        if new_name.casefold() != old_name.casefold():
            dup = (
                db.query(InventoryLocation)
                .filter(
                    InventoryLocation.name.ilike(new_name),
                    InventoryLocation.id != location_id,
                )
                .first()
            )
            if dup is not None:
                raise HTTPException(status_code=400, detail="Location already exists")
            # Rename free-text on items that used the old label
            (
                db.query(InventoryItem)
                .filter(InventoryItem.location == old_name)
                .update({InventoryItem.location: new_name}, synchronize_session=False)
            )
            (
                db.query(Device)
                .filter(Device.location == old_name)
                .update({Device.location: new_name}, synchronize_session=False)
            )
            row.name = new_name
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = int(data["sort_order"])
    db.commit()
    db.refresh(row)
    return row


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    row = db.query(InventoryLocation).filter(InventoryLocation.id == location_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Location not found")
    # Keep item.location text so nothing is lost; only remove the catalog entry
    db.delete(row)
    db.commit()


# ── Items ─────────────────────────────────────────────────────────


@router.get("", response_model=list[InventoryItemOut])
def list_items(
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[InventoryItem]:
    query = db.query(InventoryItem)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            (InventoryItem.title.ilike(like))
            | (InventoryItem.serial_number.ilike(like))
            | (InventoryItem.location.ilike(like))
            | (InventoryItem.category.ilike(like))
            | (InventoryItem.notes.ilike(like))
        )
    return query.order_by(InventoryItem.updated_at.desc()).all()


@router.post("", response_model=InventoryItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    body: InventoryItemCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> InventoryItem:
    if body.device_id is not None:
        if db.query(Device).filter(Device.id == body.device_id).first() is None:
            raise HTTPException(status_code=400, detail="device_id not found")
    # Auto-register location in catalog when provided
    if body.location:
        loc_name = body.location.strip()
        exists = (
            db.query(InventoryLocation)
            .filter(InventoryLocation.name.ilike(loc_name))
            .first()
        )
        if exists is None:
            db.add(
                InventoryLocation(name=loc_name, sort_order=_next_sort_order(db))
            )
    item = InventoryItem(
        title=body.title,
        serial_number=body.serial_number,
        category=body.category,
        location=body.location,
        notes=body.notes,
        device_id=body.device_id,
        purchase_date=body.purchase_date,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=InventoryItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> InventoryItem:
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.patch("/{item_id}", response_model=InventoryItemOut)
def update_item(
    item_id: int,
    body: InventoryItemUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> InventoryItem:
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    data = body.model_dump(exclude_unset=True)
    if "device_id" in data and data["device_id"] is not None:
        if db.query(Device).filter(Device.id == data["device_id"]).first() is None:
            raise HTTPException(status_code=400, detail="device_id not found")
    if "location" in data and data["location"]:
        loc_name = str(data["location"]).strip()
        exists = (
            db.query(InventoryLocation)
            .filter(InventoryLocation.name.ilike(loc_name))
            .first()
        )
        if exists is None:
            db.add(
                InventoryLocation(name=loc_name, sort_order=_next_sort_order(db))
            )
        data["location"] = loc_name
    for k, v in data.items():
        setattr(item, k, v)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    (
        db.query(PlanSlot)
        .filter(PlanSlot.inventory_item_id == item.id)
        .update({PlanSlot.inventory_item_id: None}, synchronize_session=False)
    )
    db.delete(item)
    db.commit()
