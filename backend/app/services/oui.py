"""MAC OUI → vendor lookup.

Loads IEEE MA-L registry from ``backend/data/oui.txt`` when present.
If the cache is missing, best-effort download from IEEE (never fails the scan).
Falls back to a tiny built-in stub when offline / uncached.
"""

from __future__ import annotations

import re
import threading
import urllib.error
import urllib.request
from pathlib import Path

# IEEE public MA-L listing (text)
IEEE_OUI_URL = "https://standards-oui.ieee.org/oui/oui.txt"
_DOWNLOAD_TIMEOUT_S = 20

# Minimal offline fallback (prefix aa:bb:cc)
STUB_TABLE: dict[str, str] = {
    "00:50:56": "VMware",
    "b8:27:eb": "Raspberry Pi",
    "dc:a6:32": "Raspberry Pi",
}

# Back-compat alias used by older tests / imports
OUI_TABLE = STUB_TABLE

# ``XX-XX-XX   (hex)`` IEEE line (vendor name on same line after tabs/spaces)
_IEEE_HEX_LINE = re.compile(
    r"^([0-9A-Fa-f]{2})-([0-9A-Fa-f]{2})-([0-9A-Fa-f]{2})\s+\(hex\)\s+(.+?)\s*$"
)

_lock = threading.Lock()
_table: dict[str, str] | None = None
_download_attempted = False


def oui_cache_path() -> Path:
    """``backend/data/oui.txt`` next to the package tree."""
    # app/services/oui.py → app → backend
    return Path(__file__).resolve().parents[2] / "data" / "oui.txt"


def mac_prefix(mac: str) -> str | None:
    """Return OUI prefix ``aa:bb:cc`` or None if MAC is unusable."""
    cleaned = mac.strip().lower().replace("-", ":")
    parts = cleaned.split(":")
    if len(parts) < 3:
        # bare 6+ hex without separators
        hex_only = re.sub(r"[^0-9a-f]", "", cleaned)
        if len(hex_only) < 6:
            return None
        parts = [hex_only[i : i + 2] for i in range(0, 6, 2)]
    if len(parts) < 3:
        return None
    try:
        return ":".join(p.zfill(2) for p in parts[:3])
    except Exception:
        return None


def parse_ieee_oui(text: str) -> dict[str, str]:
    """Parse IEEE ``oui.txt`` body into prefix → organization name."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        m = _IEEE_HEX_LINE.match(line)
        if not m:
            continue
        a, b, c, name = m.group(1), m.group(2), m.group(3), m.group(4)
        prefix = f"{a.lower()}:{b.lower()}:{c.lower()}"
        vendor = name.strip()
        if vendor:
            out[prefix] = vendor[:128]
    return out


def _merge_stub(table: dict[str, str]) -> dict[str, str]:
    merged = dict(STUB_TABLE)
    merged.update(table)
    return merged


def _read_cache_file(path: Path) -> dict[str, str] | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    if not text.strip():
        return None
    parsed = parse_ieee_oui(text)
    return parsed if parsed else None


def _download_ieee(path: Path) -> dict[str, str] | None:
    try:
        req = urllib.request.Request(
            IEEE_OUI_URL,
            headers={"User-Agent": "netscantools-oui/1.0"},
        )
        with urllib.request.urlopen(req, timeout=_DOWNLOAD_TIMEOUT_S) as resp:
            raw = resp.read()
        text = raw.decode("utf-8", errors="replace")
        parsed = parse_ieee_oui(text)
        if not parsed:
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic-ish write
        tmp = path.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(path)
        return parsed
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def ensure_oui_db(*, force_download: bool = False, allow_download: bool = True) -> int:
    """Load OUI table into memory. Returns entry count (stub-only if uncached).

    Never raises. Download at most once per process unless ``force_download``.
    """
    global _table, _download_attempted
    with _lock:
        if _table is not None and not force_download:
            return len(_table)

        path = oui_cache_path()
        loaded = None if force_download else _read_cache_file(path)

        if loaded is None and allow_download and (force_download or not _download_attempted):
            _download_attempted = True
            loaded = _download_ieee(path)

        if loaded is None:
            loaded = _read_cache_file(path)

        _table = _merge_stub(loaded or {})
        return len(_table)


def reset_oui_cache_for_tests() -> None:
    """Clear in-memory state (tests only)."""
    global _table, _download_attempted
    with _lock:
        _table = None
        _download_attempted = False


def lookup_vendor(mac: str) -> str | None:
    """Return vendor name for MAC OUI, or None.

    Best-effort: may download IEEE list once if cache missing.
    """
    prefix = mac_prefix(mac)
    if not prefix:
        return None
    ensure_oui_db(allow_download=True)
    table = _table or STUB_TABLE
    name = table.get(prefix)
    if name:
        return name[:128]
    return None


def backfill_device_vendors(devices: list) -> int:
    """Fill empty ``device.vendor`` from OUI. Returns number updated.

    ``devices`` are ORM Device-like objects with ``mac`` / ``vendor``.
    Does not commit.
    """
    ensure_oui_db(allow_download=True)
    updated = 0
    for device in devices:
        if getattr(device, "vendor", None):
            continue
        mac = getattr(device, "mac", None)
        if not mac:
            continue
        vendor = lookup_vendor(mac)
        if vendor:
            device.vendor = vendor
            updated += 1
    return updated
