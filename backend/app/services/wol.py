"""Wake-on-LAN magic packet sender."""

from __future__ import annotations

import re
import socket
from dataclasses import dataclass


_MAC_RE = re.compile(r"^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$")


@dataclass
class WolResult:
    ok: bool
    mac: str
    message: str


def normalize_mac_bytes(mac: str) -> bytes:
    cleaned = mac.strip().lower().replace("-", ":")
    if not _MAC_RE.match(cleaned):
        raise ValueError(f"Invalid MAC: {mac}")
    return bytes(int(p, 16) for p in cleaned.split(":"))


def build_magic_packet(mac: str) -> bytes:
    mac_bytes = normalize_mac_bytes(mac)
    return b"\xff" * 6 + mac_bytes * 16


def send_wol(
    mac: str,
    *,
    broadcast: str = "255.255.255.255",
    port: int = 9,
) -> WolResult:
    """Send one WoL magic packet via UDP broadcast."""
    try:
        packet = build_magic_packet(mac)
    except ValueError as exc:
        return WolResult(ok=False, mac=mac, message=str(exc))

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            sock.sendto(packet, (broadcast, port))
    except OSError as exc:
        return WolResult(ok=False, mac=mac, message=f"Send failed: {exc}")

    return WolResult(
        ok=True,
        mac=mac.strip().lower().replace("-", ":"),
        message=f"Magic packet sent to {mac} via {broadcast}:{port}",
    )
