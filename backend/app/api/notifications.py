from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.notification import Notification
from app.models.user import User
from app.models.device import Device
from app.schemas.notification import NotificationOut
from app.services.device_label import device_display_name, devices_by_id

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _notification_out(n: Notification, devices: dict[int, Device]) -> NotificationOut:
    dev = devices.get(n.device_id) if n.device_id is not None else None
    return NotificationOut(
        id=n.id,
        type=n.type,
        device_id=n.device_id,
        device_name=device_display_name(dev) if dev else None,
        device_ip=dev.ip if dev else None,
        device_mac=dev.mac if dev else None,
        device_hostname=dev.hostname if dev else None,
        message=n.message,
        read=n.read,
        created_at=n.created_at,
    )


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[NotificationOut]:
    rows = db.query(Notification).order_by(Notification.created_at.desc()).all()
    devices = devices_by_id(
        db, {n.device_id for n in rows if n.device_id is not None}
    )
    return [_notification_out(n, devices) for n in rows]


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> NotificationOut:
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification.read = True
    db.commit()
    db.refresh(notification)
    devices = devices_by_id(
        db, {notification.device_id} if notification.device_id is not None else set()
    )
    return _notification_out(notification, devices)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    db.query(Notification).filter(Notification.read.is_(False)).update(
        {Notification.read: True},
        synchronize_session=False,
    )
    db.commit()
