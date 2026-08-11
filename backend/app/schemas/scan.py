from datetime import datetime

from pydantic import BaseModel


class ScanOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    subnet: str
    devices_found: int
    new_devices: int
    error_message: str | None

    model_config = {"from_attributes": True}
