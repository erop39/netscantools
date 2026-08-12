from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


class ScanStart(BaseModel):
    """Optional body for POST /api/scans."""

    mode: Literal["quick", "full"] = "full"

    @field_validator("mode")
    @classmethod
    def normalize_mode(cls, v: str) -> str:
        return (v or "full").strip().lower()


class ScanOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    mode: str = "full"
    subnet: str
    devices_found: int
    new_devices: int
    error_message: str | None

    model_config = {"from_attributes": True}
