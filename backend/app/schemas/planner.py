from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PortOut(BaseModel):
    id: int
    port: int
    label: str
    sort_order: int

    model_config = {"from_attributes": True}


class SlotOut(BaseModel):
    id: int
    sort_order: int
    planned_ip: str | None
    hostname_hint: str | None
    role_label: str | None
    device_mac: str | None
    notes: str | None
    ports: list[PortOut] = []
    live_ip: str | None = None
    live_status: str | None = None
    device_id: int | None = None
    match: Literal["match", "mismatch", "linked-no-ip", "reserve"]

    model_config = {"from_attributes": True}


class PlanOut(BaseModel):
    id: int
    name: str
    cidr: str | None
    notes: str | None
    updated_at: datetime
    slots: list[SlotOut] = []

    model_config = {"from_attributes": True}


class PlanUpdate(BaseModel):
    name: str
    cidr: str | None = None
    notes: str | None = None


class SlotCreate(BaseModel):
    planned_ip: str | None = None
    hostname_hint: str | None = None
    role_label: str | None = None
    device_mac: str | None = None
    notes: str | None = None


class SlotUpdate(BaseModel):
    planned_ip: str | None = None
    hostname_hint: str | None = None
    role_label: str | None = None
    device_mac: str | None = None
    notes: str | None = None


class PortCreate(BaseModel):
    port: int = Field(ge=1, le=65535)
    label: str = ""


class PortUpdate(BaseModel):
    port: int | None = Field(default=None, ge=1, le=65535)
    label: str | None = None


class ReorderBody(BaseModel):
    slot_ids: list[int]


class PlanImportPort(BaseModel):
    port: int
    label: str = ""
    sort_order: int = 0


class PlanImportSlot(BaseModel):
    sort_order: int = 0
    planned_ip: str | None = None
    hostname_hint: str | None = None
    role_label: str | None = None
    device_mac: str | None = None
    notes: str | None = None
    ports: list[PlanImportPort] = []


class PlanImportMeta(BaseModel):
    name: str | None = "Home LAN"
    cidr: str | None = None
    notes: str | None = None


class PlanImport(BaseModel):
    format: str
    version: int
    exported_at: str | None = None
    plan: PlanImportMeta = PlanImportMeta()
    slots: list[PlanImportSlot] = []


class PlanCandidate(BaseModel):
    id: int
    mac: str
    ip: str | None
    name: str | None
    hostname: str | None
    status: str

    model_config = {"from_attributes": True}
