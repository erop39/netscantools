from datetime import datetime

from pydantic import BaseModel, field_validator


# Allowed icon keys — keep in sync with frontend/src/lib/deviceIcons.tsx
DEVICE_ICON_KEYS = frozenset(
    {
        "desktop",
        "laptop",
        "tablet",
        "mobile",
        "server",
        "database",
        "hdd",
        "wifi",
        "broadcast",
        "sitemap",
        "cloud",
        "camera",
        "video",
        "print",
        "tv",
        "gamepad",
        "headphones",
        "microchip",
        "plug",
        "lightbulb",
        "home",
        "shield",
        "key",
        "cogs",
        "globe",
        "ethernet",
        "router",
        "phone",
        "fax",
        "usb",
        "bluetooth",
        "satellite",
        "power",
        "thermometer",
        "bell",
        "folder",
        "box",
        "car",
        "question",
        # Apple
        "iphone",
        "ipad",
        "mac",
        "appletv",
        "applewatch",
        "airpods",
        # Android
        "android",
        "androidtv",
        # Kitchen
        "fridge",
        "oven",
        "microwave",
        "dishwasher",
        "kettle",
        "coffee",
        "blender",
        "washing",
    }
)


class DeviceOut(BaseModel):
    id: int
    mac: str
    ip: str | None
    vendor: str | None
    hostname: str | None
    name: str | None = None
    type: str | None
    icon: str | None = None
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
    icon: str | None = None
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

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, v: str | None) -> str | None:
        if v is None:
            return None
        key = v.strip().lower()
        if not key:
            return None
        if key not in DEVICE_ICON_KEYS:
            raise ValueError(f"Unknown icon: {key}")
        return key


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
