"""SQLite inventory backup: copy DB file into data/backups/."""

from __future__ import annotations

import logging
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

_BACKUP_NAME = re.compile(r"^netpad-\d{8}-\d{6}\.db$")


def data_dir() -> Path:
    """Directory that holds netpad.db (backend/data by default)."""
    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        raw = url.removeprefix("sqlite:///")
        path = Path(raw)
        if not path.is_absolute():
            # Relative to backend cwd when running uvicorn from backend/
            path = Path.cwd() / path
        return path.resolve().parent
    return Path.cwd() / "data"


def db_path() -> Path:
    url = get_settings().database_url
    if url.startswith("sqlite:///"):
        raw = url.removeprefix("sqlite:///")
        path = Path(raw)
        if not path.is_absolute():
            path = Path.cwd() / path
        return path.resolve()
    raise RuntimeError("Backup only supports SQLite database_url")


def backups_dir() -> Path:
    d = data_dir() / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def ensure_backup_dest(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@dataclass
class BackupResult:
    ok: bool
    path: str | None
    message: str
    kept: int = 0


def list_backups() -> list[Path]:
    d = backups_dir()
    files = [p for p in d.iterdir() if p.is_file() and _BACKUP_NAME.match(p.name)]
    return sorted(files, key=lambda p: p.name, reverse=True)


def prune_backups(keep: int) -> int:
    keep = max(1, int(keep))
    files = list_backups()
    removed = 0
    for old in files[keep:]:
        try:
            old.unlink()
            removed += 1
        except OSError:
            logger.warning("Could not remove old backup %s", old)
    return removed


def run_backup(*, keep: int = 10) -> BackupResult:
    """Copy current SQLite DB to data/backups/netpad-YYYYMMDD-HHMMSS.db."""
    src = db_path()
    if not src.is_file():
        return BackupResult(ok=False, path=None, message=f"Database not found: {src}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dest = ensure_backup_dest(backups_dir() / f"netpad-{stamp}.db")
    try:
        # Use copy2; SQLite may be open — best-effort for personal tool
        shutil.copy2(src, dest)
    except OSError as exc:
        return BackupResult(ok=False, path=None, message=f"Copy failed: {exc}")

    prune_backups(keep)
    remaining = len(list_backups())
    return BackupResult(
        ok=True,
        path=str(dest),
        message=f"Backup written: {dest.name}",
        kept=remaining,
    )
