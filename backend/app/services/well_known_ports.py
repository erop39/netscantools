"""Load well-known TCP port catalog from JSON fixture."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

# Prefer package data (tracked in git); runtime copies under backend/data/ are ok too
_CANDIDATE_PATHS = (
    Path(__file__).resolve().parent.parent / "data" / "well_known_ports.json",
    Path(__file__).resolve().parents[2] / "data" / "well_known_ports.json",
    Path.cwd() / "data" / "well_known_ports.json",
    Path.cwd() / "backend" / "data" / "well_known_ports.json",
    Path.cwd() / "backend" / "app" / "data" / "well_known_ports.json",
)


def catalog_path() -> Path | None:
    for p in _CANDIDATE_PATHS:
        if p.is_file():
            return p
    return None


@lru_cache(maxsize=1)
def load_catalog() -> list[dict[str, Any]]:
    path = catalog_path()
    if path is None:
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for row in data:
        if not isinstance(row, dict):
            continue
        try:
            port = int(row["port"])
        except (KeyError, TypeError, ValueError):
            continue
        if port < 1 or port > 65535 or port in seen:
            continue
        seen.add(port)
        out.append(
            {
                "port": port,
                "protocol": "tcp",
                "name": str(row.get("name") or f"port {port}"),
                "category": str(row.get("category") or "other"),
                "default_enabled": bool(row.get("default_enabled", False)),
            }
        )
    out.sort(key=lambda r: (r["category"], r["port"]))
    return out


def service_map() -> dict[int, str]:
    """port → short service label for open_ports enrichment."""
    m: dict[int, str] = {}
    for row in load_catalog():
        # Prefer short token from name (first word lower)
        name = str(row["name"]).strip()
        short = name.split("/")[0].split()[0].lower() if name else f"p{row['port']}"
        m[int(row["port"])] = short[:32]
    return m


def list_well_known(*, category: str | None = None) -> list[dict[str, Any]]:
    rows = load_catalog()
    if category and category.strip():
        cat = category.strip().lower()
        rows = [r for r in rows if str(r["category"]).lower() == cat]
    return rows


def categories() -> list[str]:
    cats: list[str] = []
    seen: set[str] = set()
    for row in load_catalog():
        c = str(row["category"])
        if c not in seen:
            seen.add(c)
            cats.append(c)
    return cats


def default_enabled_ports() -> list[int]:
    return [int(r["port"]) for r in load_catalog() if r.get("default_enabled")]


def ports_to_csv(ports: list[int]) -> str:
    seen: set[int] = set()
    out: list[str] = []
    for p in ports:
        try:
            n = int(p)
        except (TypeError, ValueError):
            continue
        if n < 1 or n > 65535 or n in seen:
            continue
        seen.add(n)
        out.append(str(n))
    return ",".join(out)
