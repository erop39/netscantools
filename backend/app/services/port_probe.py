"""TCP port probe and scoped open-ports merge (no DB)."""

from __future__ import annotations

import socket
from typing import Any

# Well-known ports → short service labels (optional enrichment on upsert)
_SERVICE_MAP: dict[int, str] = {
    22: "ssh",
    80: "http",
    443: "https",
    445: "smb",
    3389: "rdp",
}


def parse_port_csv(s: str) -> list[int]:
    """Parse a comma-separated port list; skip empty/invalid tokens; preserve order, dedupe."""
    if not s or not str(s).strip():
        return []
    seen: set[int] = set()
    out: list[int] = []
    for part in str(s).split(","):
        token = part.strip()
        if not token:
            continue
        try:
            port = int(token)
        except ValueError:
            continue
        if port < 1 or port > 65535:
            continue
        if port in seen:
            continue
        seen.add(port)
        out.append(port)
    return out


def probe_host_ports(ip: str, ports: list[int], timeout_s: float = 0.35) -> list[int]:
    """TCP connect probe; return ports that accepted a connection."""
    open_ports: list[int] = []
    if not ip or not str(ip).strip() or not ports:
        return open_ports
    host = str(ip).strip()
    for port in ports:
        try:
            with socket.create_connection((host, int(port)), timeout=timeout_s):
                open_ports.append(int(port))
        except OSError:
            continue
    return open_ports


def _service_for(port: int) -> str | None:
    return _SERVICE_MAP.get(port)


def merge_open_ports(
    previous: list[dict] | None,
    scanned_ports: list[int],
    open_now: list[int],
    source: str,
) -> list[dict]:
    """
    Scoped merge (spec §6.1): only mutate ports that were scanned.

    - scanned + open  → upsert {port, service, source}
    - scanned + closed → remove
    - not scanned → leave previous entry unchanged
    """
    scanned = {int(p) for p in scanned_ports}
    open_set = {int(p) for p in open_now}

    by_port: dict[int, dict[str, Any]] = {}
    for entry in previous or []:
        if not isinstance(entry, dict):
            continue
        try:
            port = int(entry["port"])
        except (KeyError, TypeError, ValueError):
            continue
        by_port[port] = {
            "port": port,
            "service": entry.get("service"),
            "source": entry.get("source") or source,
        }

    for port in scanned:
        if port in open_set:
            by_port[port] = {
                "port": port,
                "service": _service_for(port),
                "source": source,
            }
        else:
            by_port.pop(port, None)

    # Stable-ish order: ascending port number
    return [by_port[p] for p in sorted(by_port)]
