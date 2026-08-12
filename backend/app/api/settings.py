from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.setting import Setting
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services import backup as backup_svc
from app.services import ui_background as bg_svc
from app.services.auth import DEFAULT_SETTINGS
from app.services.scheduler import reschedule

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = (
    "scan_subnet",
    "scan_interval_minutes",
    "scan_ports",
    "quick_ports",
    "ui_background",
    "backup_interval_hours",
    "backup_keep",
    "share_scan_auto",
)


def _load_settings(db: Session) -> SettingsOut:
    rows = {
        row.key: row.value
        for row in db.query(Setting).filter(Setting.key.in_(SETTING_KEYS)).all()
    }
    ui_background = rows.get("ui_background", DEFAULT_SETTINGS["ui_background"])
    backups = backup_svc.list_backups()
    last = str(backups[0]) if backups else None
    try:
        backup_interval = int(
            rows.get("backup_interval_hours", DEFAULT_SETTINGS["backup_interval_hours"])
        )
    except (TypeError, ValueError):
        backup_interval = 24
    try:
        backup_keep = int(rows.get("backup_keep", DEFAULT_SETTINGS["backup_keep"]))
    except (TypeError, ValueError):
        backup_keep = 10
    share_raw = rows.get("share_scan_auto", DEFAULT_SETTINGS["share_scan_auto"])
    share_scan_auto = str(share_raw).strip().lower() in ("1", "true", "yes", "on")
    return SettingsOut(
        scan_subnet=rows.get("scan_subnet", DEFAULT_SETTINGS["scan_subnet"]),
        scan_interval_minutes=int(
            rows.get("scan_interval_minutes", DEFAULT_SETTINGS["scan_interval_minutes"])
        ),
        scan_ports=rows.get("scan_ports", DEFAULT_SETTINGS["scan_ports"]),
        quick_ports=rows.get("quick_ports", DEFAULT_SETTINGS["quick_ports"]),
        ui_background=ui_background,
        ui_background_url=bg_svc.resolve_background_url(ui_background),
        has_custom_background=bg_svc.has_custom_background(),
        backup_interval_hours=backup_interval,
        backup_keep=backup_keep,
        backup_last_path=last,
        backup_count=len(backups),
        share_scan_auto=share_scan_auto,
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
    if body.ui_background == "custom" and not bg_svc.has_custom_background():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a custom background image before selecting custom",
        )
    _upsert_setting(db, "scan_subnet", body.scan_subnet)
    _upsert_setting(db, "scan_interval_minutes", str(body.scan_interval_minutes))
    _upsert_setting(db, "scan_ports", body.scan_ports)
    _upsert_setting(db, "quick_ports", body.quick_ports)
    _upsert_setting(db, "ui_background", body.ui_background)
    if body.backup_interval_hours is not None:
        _upsert_setting(db, "backup_interval_hours", str(body.backup_interval_hours))
    if body.backup_keep is not None:
        _upsert_setting(db, "backup_keep", str(body.backup_keep))
    if body.share_scan_auto is not None:
        _upsert_setting(db, "share_scan_auto", "1" if body.share_scan_auto else "0")
    db.commit()
    reschedule()
    return _load_settings(db)


@router.post("/backup-now", response_model=SettingsOut)
def backup_now(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsOut:
    """Immediate SQLite copy into data/backups/."""
    row = db.query(Setting).filter(Setting.key == "backup_keep").first()
    try:
        keep = int(row.value) if row else 10
    except (TypeError, ValueError):
        keep = 10
    result = backup_svc.run_backup(keep=keep)
    if not result.ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.message)
    return _load_settings(db)


@router.post("/background-image", response_model=SettingsOut)
async def upload_background_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsOut:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    data = await file.read()
    try:
        bg_svc.save_custom_background(data, content_type)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _upsert_setting(db, "ui_background", "custom")
    db.commit()
    return _load_settings(db)


@router.delete("/background-image", response_model=SettingsOut)
def delete_background_image(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SettingsOut:
    bg_svc.clear_custom_background()
    current = _load_settings(db)
    if current.ui_background == "custom":
        _upsert_setting(db, "ui_background", "default")
        db.commit()
    return _load_settings(db)


@router.get("/background-image")
def get_background_image(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    path = bg_svc.custom_background_path()
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No custom background")
    media = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media, filename=path.name)
