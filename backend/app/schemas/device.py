from datetime import datetime

from pydantic import BaseModel, field_validator


class DeviceOut(BaseModel):
    id: int
    mac: str
    ip: str | None
    vendor: str | None
    hostname: str | None
    name: str | None = None
    type: str | None
    status: str
    last_seen: datetime | None
    web_ui_local: str | None
    web_ui_external: str | None
    notes: str | None
    first_seen: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceUpdate(BaseModel):
    type: str | None = None
    name: str | None = None
    notes: str | None = None
    web_ui_local: str | None = None
    web_ui_external: str | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


class PingOut(BaseModel):
    ok: bool
    ip: str
    rtt_ms: float | None = None
    message: str


class ResolveOut(BaseModel):
    hostname: str | None
    device: DeviceOut


class ResolveAllOut(BaseModel):
    total: int
    resolved: int
    failed: int
    devices: list[DeviceOut]
