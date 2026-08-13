"""APScheduler wrapper for periodic network scans and inventory backups."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import SessionLocal
from app.models.setting import Setting
from app.services import backup as backup_svc
from app.services.scanner import ScanAlreadyRunning, run_scan_job

logger = logging.getLogger(__name__)

JOB_ID = "network_scan"
BACKUP_JOB_ID = "inventory_backup"

_scheduler: BackgroundScheduler | None = None


def _setting_int(key: str, default: int = 0) -> int:
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == key).first()
        if row is None:
            return default
        try:
            return max(0, int(row.value))
        except (TypeError, ValueError):
            return default
    finally:
        db.close()


def _interval_minutes() -> int:
    return _setting_int("scan_interval_minutes", 0)


def _backup_interval_hours() -> int:
    return _setting_int("backup_interval_hours", 24)


def _backup_keep() -> int:
    return max(1, _setting_int("backup_keep", 10) or 10)


def _scheduled_scan() -> None:
    db = SessionLocal()
    try:
        run_scan_job(db)
    except ScanAlreadyRunning:
        logger.info("Scheduled scan skipped: another scan is already running")
    except Exception:
        logger.exception("Scheduled scan failed")
    finally:
        db.close()


def _scheduled_backup() -> None:
    try:
        result = backup_svc.run_backup(keep=_backup_keep())
        if result.ok:
            logger.info("Inventory backup ok: %s", result.path)
        else:
            logger.warning("Inventory backup failed: %s", result.message)
    except Exception:
        logger.exception("Scheduled backup failed")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.start()
    reschedule()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None


def reschedule() -> None:
    """Reload scan + backup intervals from settings. <= 0 disables that job."""
    if _scheduler is None:
        return

    if _scheduler.get_job(JOB_ID) is not None:
        _scheduler.remove_job(JOB_ID)
    minutes = _interval_minutes()
    if minutes > 0:
        _scheduler.add_job(
            _scheduled_scan,
            trigger="interval",
            minutes=minutes,
            id=JOB_ID,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        logger.info("Scan scheduler interval set to %s minutes", minutes)
    else:
        logger.info("Scan scheduler disabled (interval 0)")

    if _scheduler.get_job(BACKUP_JOB_ID) is not None:
        _scheduler.remove_job(BACKUP_JOB_ID)
    hours = _backup_interval_hours()
    if hours > 0:
        _scheduler.add_job(
            _scheduled_backup,
            trigger="interval",
            hours=hours,
            id=BACKUP_JOB_ID,
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        logger.info("Backup scheduler interval set to %s hours", hours)
    else:
        logger.info("Backup scheduler disabled (interval 0)")
