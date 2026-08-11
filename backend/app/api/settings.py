from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models.setting import Setting
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services import ui_background as bg_svc
from app.services.auth import DEFAULT_SETTINGS
from app.services.scheduler import reschedule

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = (
    "scan_subnet",
    "scan_interval_minutes",
    "scan_ports",
    "ui_background",
)


def _load_settings(db: Session) -> SettingsOut:
    rows = {
        row.key: row.value
        for row in db.query(Setting).filter(Setting.key.in_(SETTING_KEYS)).all()
    }
    ui_background = rows.get("ui_background", DEFAULT_SETTINGS["ui_background"])
    return SettingsOut(
        scan_subnet=rows.get("scan_subnet", DEFAULT_SETTINGS["scan_subnet"]),
        scan_interval_minutes=int(
            rows.get("scan_interval_minutes", DEFAULT_SETTINGS["scan_interval_minutes"])
        ),
        scan_ports=rows.get("scan_ports", DEFAULT_SETTINGS["scan_ports"]),
        ui_background=ui_background,
        ui_background_url=bg_svc.resolve_background_url(ui_background),
        has_custom_background=bg_svc.has_custom_background(),
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
    _upsert_setting(db, "ui_background", body.ui_background)
    db.commit()
    reschedule()
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
