from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.setting import Setting
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services.auth import DEFAULT_SETTINGS
from app.services.scheduler import reschedule

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = ("scan_subnet", "scan_interval_minutes", "scan_ports")


def _load_settings(db: Session) -> SettingsOut:
    rows = {
        row.key: row.value
        for row in db.query(Setting).filter(Setting.key.in_(SETTING_KEYS)).all()
    }
    return SettingsOut(
        scan_subnet=rows.get("scan_subnet", DEFAULT_SETTINGS["scan_subnet"]),
        scan_interval_minutes=int(
            rows.get("scan_interval_minutes", DEFAULT_SETTINGS["scan_interval_minutes"])
        ),
        scan_ports=rows.get("scan_ports", DEFAULT_SETTINGS["scan_ports"]),
    )


def _upsert_setting(db: Session, key: str, value: str) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value


@router.get("", response_model=SettingsOut)
def get_settings_api(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsOut:
    return _load_settings(db)


@router.put("", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsOut:
    _upsert_setting(db, "scan_subnet", body.scan_subnet)
    _upsert_setting(db, "scan_interval_minutes", str(body.scan_interval_minutes))
    _upsert_setting(db, "scan_ports", body.scan_ports)
    db.commit()
    reschedule()
    return _load_settings(db)
