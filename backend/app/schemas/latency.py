from datetime import datetime

from pydantic import BaseModel


class LatencySampleOut(BaseModel):
    id: int
    rtt_ms: float
    recorded_at: datetime

    model_config = {"from_attributes": True}
