from datetime import datetime

from pydantic import BaseModel


class HygieneCountsOut(BaseModel):
    online: int
    offline: int
    new_24h: int
    risky_devices: int


class HygieneTopRiskOut(BaseModel):
    device_id: int
    mac: str
    name: str | None = None
    security_score: int | None = None
    ip: str | None = None


class HygieneEventOut(BaseModel):
    id: int
    device_id: int | None = None
    device_name: str | None = None
    type: str
    details: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HygieneSummaryOut(BaseModel):
    network_score: int | None
    counts: HygieneCountsOut
    top_risks: list[HygieneTopRiskOut]
    recent_events: list[HygieneEventOut]


class ChecklistItemOut(BaseModel):
    id: int
    key: str
    label: str
    checked: bool
    checked_at: datetime | None = None
    sort_order: int

    model_config = {"from_attributes": True}


class ChecklistUpdate(BaseModel):
    checked: bool


class HygieneScanPortsOut(BaseModel):
    total: int
    scanned: int
    ok: int
    failed: int
