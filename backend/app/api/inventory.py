from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.inventory import InventoryItem
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemOut,
    InventoryItemUpdate,
)

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


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
    db.delete(item)
    db.commit()
