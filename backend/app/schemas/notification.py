from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    type: str
    device_id: int | None
    device_name: str | None = None
    device_ip: str | None = None
    device_mac: str | None = None
    device_hostname: str | None = None
    message: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
