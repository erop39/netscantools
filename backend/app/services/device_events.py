"""DeviceEvent logging and event → notification mapping."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.event import DeviceEvent
from app.models.notification import Notification
from app.services.scoring import RISKY_PORTS


def log_event(
    db: Session,
    device_id: int | None,
    type: str,
    details: dict | None = None,
) -> DeviceEvent:
    """Persist a DeviceEvent row. Caller is responsible for commit."""
    event = DeviceEvent(device_id=device_id, type=type, details=details)
    db.add(event)
    db.flush()
    return event


def notification_type_for_event(
    event_type: str,
    details: dict | None,
) -> str | None:
    """Map durable event type → notification.type, or None if no notify.

    Critical mappings (event → notification):
      new_device → new_device
      ip_changed → ip_changed
      went_offline → device_offline  (DIFFERENT string)
      came_online → None
      port_opened → port_opened only if port ∈ RISKY_PORTS
      port_closed → None
    """
    if event_type == "new_device":
        return "new_device"
    if event_type == "ip_changed":
        return "ip_changed"
    if event_type == "went_offline":
        return "device_offline"
    if event_type == "port_opened":
        port: Any = None
        if details:
            port = details.get("port")
        try:
            if port is not None and int(port) in RISKY_PORTS:
                return "port_opened"
        except (TypeError, ValueError):
            return None
        return None
    return None


def log_event_and_maybe_notify(
    db: Session,
    device_id: int | None,
    event_type: str,
    message: str,
    details: dict | None = None,
) -> DeviceEvent:
    """Always write DeviceEvent; create Notification when mapping is non-None."""
    event = log_event(db, device_id, event_type, details)
    ntype = notification_type_for_event(event_type, details)
    if ntype is not None:
        db.add(
            Notification(
                type=ntype,
                device_id=device_id,
                message=message,
            )
        )
    return event
