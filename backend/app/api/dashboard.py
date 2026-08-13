from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.notification import Notification
from app.models.scan import Scan
from app.models.user import User
from app.schemas.dashboard import DashboardOut, RecentNotificationOut
from app.services.device_label import device_display_name, devices_by_id

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardOut:
    total = db.query(Device).count()
    online = db.query(Device).filter(Device.status == "online").count()
    last_scan = db.query(Scan).order_by(Scan.started_at.desc()).first()
    recent = (
        db.query(Notification).order_by(Notification.created_at.desc()).limit(10).all()
    )
    devices = devices_by_id(
        db, {n.device_id for n in recent if n.device_id is not None}
    )
    recent_out = []
    for n in recent:
        dev = devices.get(n.device_id) if n.device_id is not None else None
        recent_out.append(
            RecentNotificationOut(
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
        )
    people = db.query(Device).filter(Device.is_person.is_(True)).all()
    people_home = [p for p in people if (p.status or "").lower() == "online"]
    people_away = [p for p in people if (p.status or "").lower() != "online"]
    return DashboardOut(
        online_count=online,
        total_count=total,
        last_scan=last_scan,
        recent_notifications=recent_out,
        people_home=people_home,
        people_away=people_away,
    )
