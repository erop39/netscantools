from datetime import datetime

from pydantic import BaseModel


class LastScanOut(BaseModel):
    id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    devices_found: int
    new_devices: int
    subnet: str

    model_config = {"from_attributes": True}


class RecentNotificationOut(BaseModel):
    id: int
    type: str
    message: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PresencePersonOut(BaseModel):
    id: int
    name: str | None = None
    mac: str
    ip: str | None = None
    status: str
    last_seen: datetime | None = None

    model_config = {"from_attributes": True}


class DashboardOut(BaseModel):
    online_count: int
    total_count: int
    last_scan: LastScanOut | None
    recent_notifications: list[RecentNotificationOut]
    people_home: list[PresencePersonOut] = []
    people_away: list[PresencePersonOut] = []
