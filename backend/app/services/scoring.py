"""Pure device / network security scoring (no DB, no I/O)."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

RISKY_PORTS: frozenset[int] = frozenset({21, 23, 135, 139, 445, 3389, 5900})
NEW_DEVICE_HOURS: int = 24

# Ports excluded from the "too many open ports" count
_BENIGN_PORTS: frozenset[int] = frozenset({80, 443})

_OFFLINE_DAYS = 7
_RISKY_FIRST = 20
_RISKY_EXTRA = 5
_RISKY_CAP = 35
_MANY_PORTS_PENALTY = 10
_MANY_PORTS_THRESHOLD = 8
_NO_VENDOR_PENALTY = 5
_NO_IDENTITY_PENALTY = 5
_STALE_OR_OFFLINE_PENALTY = 15
_NEW_DEVICE_PENALTY = 5


@dataclass(frozen=True)
class ScoreBreakdownItem:
    code: str
    label: str
    delta: int


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _truthy_str(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _port_numbers(open_ports: Any) -> list[int]:
    if not open_ports:
        return []
    ports: list[int] = []
    for entry in open_ports:
        if isinstance(entry, dict):
            p = entry.get("port")
        else:
            p = getattr(entry, "port", None)
        if p is None:
            continue
        try:
            ports.append(int(p))
        except (TypeError, ValueError):
            continue
    return ports


def compute_device_score(
    device_like: Any,
    *,
    now: datetime | None = None,
) -> tuple[int, list[dict]]:
    """Compute security score (0–100, higher=better) and breakdown items.

    ``device_like`` needs: open_ports, vendor, hostname, name, status,
    last_seen, first_seen.
    """
    now_utc = _as_utc(now) if now is not None else datetime.now(timezone.utc)
    score = 100
    breakdown: list[dict] = []

    ports = _port_numbers(getattr(device_like, "open_ports", None))
    distinct_risky = sorted({p for p in ports if p in RISKY_PORTS})
    if distinct_risky:
        # −20 first + −5 each additional, cap −35 total
        penalty = min(
            _RISKY_CAP,
            _RISKY_FIRST + _RISKY_EXTRA * (len(distinct_risky) - 1),
        )
        score -= penalty
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="risky_ports",
                    label=f"Risky open ports: {', '.join(str(p) for p in distinct_risky)}",
                    delta=-penalty,
                )
            )
        )

    non_benign_count = sum(1 for p in ports if p not in _BENIGN_PORTS)
    if non_benign_count > _MANY_PORTS_THRESHOLD:
        score -= _MANY_PORTS_PENALTY
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="many_open_ports",
                    label=f"Many open ports ({non_benign_count} excluding 80/443)",
                    delta=-_MANY_PORTS_PENALTY,
                )
            )
        )

    if not _truthy_str(getattr(device_like, "vendor", None)):
        score -= _NO_VENDOR_PENALTY
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="no_vendor",
                    label="Unknown vendor",
                    delta=-_NO_VENDOR_PENALTY,
                )
            )
        )

    hostname = getattr(device_like, "hostname", None)
    name = getattr(device_like, "name", None)
    if not _truthy_str(hostname) and not _truthy_str(name):
        score -= _NO_IDENTITY_PENALTY
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="no_identity",
                    label="No hostname or name",
                    delta=-_NO_IDENTITY_PENALTY,
                )
            )
        )

    status = (getattr(device_like, "status", None) or "").lower()
    last_seen = _as_utc(getattr(device_like, "last_seen", None))
    stale = False
    if status == "offline":
        stale = True
    elif last_seen is not None and last_seen < now_utc - timedelta(days=_OFFLINE_DAYS):
        stale = True
    if stale:
        score -= _STALE_OR_OFFLINE_PENALTY
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="stale_or_offline",
                    label="Offline or not seen in 7+ days",
                    delta=-_STALE_OR_OFFLINE_PENALTY,
                )
            )
        )

    first_seen = _as_utc(getattr(device_like, "first_seen", None))
    if first_seen is not None and first_seen >= now_utc - timedelta(hours=NEW_DEVICE_HOURS):
        score -= _NEW_DEVICE_PENALTY
        breakdown.append(
            asdict(
                ScoreBreakdownItem(
                    code="new_device",
                    label=f"New device (first seen within {NEW_DEVICE_HOURS}h)",
                    delta=-_NEW_DEVICE_PENALTY,
                )
            )
        )

    score = max(0, min(100, score))
    return score, breakdown


def compute_network_score(scores: list[int]) -> int | None:
    """Mean of online device scores; empty list → None."""
    if not scores:
        return None
    return int(round(sum(scores) / len(scores)))
