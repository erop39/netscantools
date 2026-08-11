import ipaddress
import re

from pydantic import BaseModel, field_validator


class SettingsOut(BaseModel):
    scan_subnet: str
    scan_interval_minutes: int
    scan_ports: str


class SettingsUpdate(BaseModel):
    scan_subnet: str
    scan_interval_minutes: int
    scan_ports: str

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

    @field_validator("scan_ports")
    @classmethod
    def validate_ports(cls, v: str) -> str:
        value = (v or "").strip()
        if not value:
            raise ValueError("scan_ports is required")
        parts = [p.strip() for p in value.split(",") if p.strip()]
        if not parts:
            raise ValueError("scan_ports must list at least one port")
        for part in parts:
            if not re.fullmatch(r"\d+", part):
                raise ValueError(f"Invalid port: {part}")
            port = int(part)
            if port < 1 or port > 65535:
                raise ValueError(f"Port out of range: {port}")
        return ",".join(parts)
