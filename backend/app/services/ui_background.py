"""Persist and resolve custom UI background images."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.models.setting import Setting

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

MAX_BACKGROUND_BYTES = 8 * 1024 * 1024  # 8 MiB


def _data_dir() -> Path:
    path = Path(__file__).resolve().parents[2] / "data" / "ui"
    path.mkdir(parents=True, exist_ok=True)
    return path


def custom_background_path() -> Path | None:
    base = _data_dir()
    for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        candidate = base / f"background{ext}"
        if candidate.is_file():
            return candidate
    return None


def has_custom_background() -> bool:
    return custom_background_path() is not None


def save_custom_background(content: bytes, content_type: str) -> Path:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported image type: {content_type}. "
            f"Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
        )
    if len(content) > MAX_BACKGROUND_BYTES:
        raise ValueError("Image too large (max 8 MB)")
    if len(content) == 0:
        raise ValueError("Empty image file")

    # Remove previous custom files
    base = _data_dir()
    for old in base.glob("background.*"):
        old.unlink(missing_ok=True)

    ext = ALLOWED_CONTENT_TYPES[content_type]
    path = base / f"background{ext}"
    path.write_bytes(content)
    return path


def clear_custom_background() -> None:
    base = _data_dir()
    for old in base.glob("background.*"):
        old.unlink(missing_ok=True)


def get_setting(db: Session, key: str, default: str) -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else default


def resolve_background_url(ui_background: str) -> str | None:
    """URL path served to the frontend for the scene image."""
    if ui_background == "default":
        return "/bg.jpg"
    if ui_background == "custom":
        if has_custom_background():
            # Cache-bust via mtime
            path = custom_background_path()
            assert path is not None
            mtime = int(path.stat().st_mtime)
            return f"/api/settings/background-image?v={mtime}"
        # Fallback if custom selected but file missing
        return "/bg.jpg"
    # solid / gradient — no photo layer
    return None
