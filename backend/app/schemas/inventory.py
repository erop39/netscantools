from datetime import datetime

from pydantic import BaseModel, field_validator


class InventoryItemOut(BaseModel):
    id: int
    title: str
    serial_number: str | None = None
    category: str | None = None
    location: str | None = None
    notes: str | None = None
    device_id: int | None = None
    purchase_date: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InventoryItemCreate(BaseModel):
    title: str
    serial_number: str | None = None
    category: str | None = None
    location: str | None = None
    notes: str | None = None
    device_id: int | None = None
    purchase_date: str | None = None

    @field_validator("title")
    @classmethod
    def title_required(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("title is required")
        return cleaned[:255]

    @field_validator("serial_number", "category", "location", "purchase_date")
    @classmethod
    def strip_opt(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None


class InventoryItemUpdate(BaseModel):
    title: str | None = None
    serial_number: str | None = None
    category: str | None = None
    location: str | None = None
    notes: str | None = None
    device_id: int | None = None
    purchase_date: str | None = None

    @field_validator("title")
    @classmethod
    def title_opt(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("title cannot be empty")
        return cleaned[:255]

    @field_validator("serial_number", "category", "location", "purchase_date")
    @classmethod
    def strip_opt(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned or None
