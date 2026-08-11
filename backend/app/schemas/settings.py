import ipaddress
import re

from pydantic import BaseModel, field_validator

UI_BACKGROUND_CHOICES = frozenset({"default", "solid", "gradient", "custom"})


class SettingsOut(BaseModel):
    scan_subnet: str
    scan_interval_minutes: int
    scan_ports: str
    quick_ports: str
    ui_background: str
    # Resolved URL for the scene image (null for solid/gradient)
    ui_background_url: str | None = None
    has_custom_background: bool = False


class SettingsUpdate(BaseModel):
    scan_subnet: str
    scan_interval_minutes: int
    scan_ports: str
    quick_ports: str
    ui_background: str = "default"

    @field_validator("scan_subnet")
    @classmethod
    def validate_subnet(cls, v: str) -> str:
        value = (v or "").strip()
        if not value:
            raise ValueError("scan_subnet is required")
        try:
            ipaddress.ip_network(value, strict=False)
        except ValueError as exc:
            raise ValueError(f"Invalid CIDR subnet: {value}") from exc
        return value

    @field_validator("scan_interval_minutes")
    @classmethod
    def validate_interval(cls, v: int) -> int:
        if v < 0:
            raise ValueError("scan_interval_minutes must be >= 0")
        return v

    @field_validator("scan_ports", "quick_ports")
    @classmethod
    def validate_ports(cls, v: str) -> str:
        value = (v or "").strip()
        if not value:
            raise ValueError("port list is required")
        parts = [p.strip() for p in value.split(",") if p.strip()]
        if not parts:
            raise ValueError("port list must include at least one port")
        for part in parts:
            if not re.fullmatch(r"\d+", part):
                raise ValueError(f"Invalid port: {part}")
            port = int(part)
            if port < 1 or port > 65535:
                raise ValueError(f"Port out of range: {port}")
        return ",".join(parts)

    @field_validator("ui_background")
    @classmethod
    def validate_ui_background(cls, v: str) -> str:
        value = (v or "").strip().lower()
        if value not in UI_BACKGROUND_CHOICES:
            raise ValueError(
                f"ui_background must be one of: {', '.join(sorted(UI_BACKGROUND_CHOICES))}"
            )
        return value
