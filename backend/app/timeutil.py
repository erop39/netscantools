"""UTC helpers and API datetime serialization."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Treat naive datetimes as UTC (SQLite often drops tzinfo)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def to_api_iso(dt: datetime | None) -> str | None:
    """ISO-8601 UTC with ``Z`` suffix for unambiguous client parsing."""
    if dt is None:
        return None
    d = ensure_utc(dt)
    assert d is not None
    # seconds precision is enough for UI
    s = d.isoformat(timespec="seconds")
    return s.replace("+00:00", "Z")


def install_utc_json_encoders() -> None:
    """Make FastAPI/jsonable_encoder emit Z-UTC for all datetime values."""
    from fastapi.encoders import ENCODERS_BY_TYPE

    ENCODERS_BY_TYPE[datetime] = lambda dt: to_api_iso(dt)  # type: ignore[assignment]
