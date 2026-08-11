"""APScheduler wrapper for periodic network scans."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.db import SessionLocal
from app.models.setting import Setting
from app.services.scanner import ScanAlreadyRunning, run_scan_job

logger = logging.getLogger(__name__)

JOB_ID = "network_scan"

_scheduler: BackgroundScheduler | None = None


def _interval_minutes() -> int:
    db = SessionLocal()
    try:
        row = db.query(Setting).filter(Setting.key == "scan_interval_minutes").first()
        if row is None:
            return 0
        try:
            return max(0, int(row.value))
        except (TypeError, ValueError):
            return 0
    finally:
        db.close()


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
    """Reload interval from settings. interval <= 0 removes the job (disabled)."""
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
