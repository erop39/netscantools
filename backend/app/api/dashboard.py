from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.device import Device
from app.models.notification import Notification
from app.models.scan import Scan
from app.models.user import User
from app.schemas.dashboard import DashboardOut

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
    people = db.query(Device).filter(Device.is_person.is_(True)).all()
    people_home = [p for p in people if (p.status or "").lower() == "online"]
    people_away = [p for p in people if (p.status or "").lower() != "online"]
    return DashboardOut(
        online_count=online,
        total_count=total,
        last_scan=last_scan,
        recent_notifications=recent,
        people_home=people_home,
        people_away=people_away,
    )
