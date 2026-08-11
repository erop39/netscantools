from datetime import datetime

from pydantic import BaseModel


class DeviceOut(BaseModel):
    id: int
    mac: str
    ip: str | None
    vendor: str | None
    hostname: str | None
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
    notes: str | None = None
    web_ui_local: str | None = None
    web_ui_external: str | None = None
