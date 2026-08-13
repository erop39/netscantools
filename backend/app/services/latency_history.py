"""Append and trim per-device latency samples."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.latency import LatencySample

# Keep last N samples per device
LATENCY_HISTORY_KEEP = 48


def record_latency(
    db: Session,
    device_id: int,
    rtt_ms: float,
    *,
    when: datetime | None = None,
    keep: int = LATENCY_HISTORY_KEEP,
) -> None:
    now = when or datetime.now(timezone.utc)
    db.add(
        LatencySample(
            device_id=device_id,
            rtt_ms=float(rtt_ms),
            recorded_at=now,
        )
    )
    db.flush()
    # Delete older rows beyond keep
    ids = (
        db.query(LatencySample.id)
        .filter(LatencySample.device_id == device_id)
        .order_by(LatencySample.recorded_at.desc())
        .offset(max(1, keep))
        .all()
    )
    if ids:
        drop = [r[0] for r in ids]
        db.query(LatencySample).filter(LatencySample.id.in_(drop)).delete(
            synchronize_session=False
        )


def list_latency(
    db: Session,
    device_id: int,
    *,
    limit: int = LATENCY_HISTORY_KEEP,
) -> list[LatencySample]:
    return (
        db.query(LatencySample)
        .filter(LatencySample.device_id == device_id)
        .order_by(LatencySample.recorded_at.asc())
        .limit(limit)
        .all()
    )
