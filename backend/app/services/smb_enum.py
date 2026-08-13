"""SMB share enumeration via Windows ``net view`` (read-only).

Does not store credentials, mount shares, or list files.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.winconsole import run_capture

ShareType = Literal["disk", "print", "ipc", "unknown"]

# Admin / default hidden shares that are hygiene-relevant when enumerable
ADMIN_SHARE_NAMES = frozenset({"c$", "d$", "e$", "admin$", "print$"})

_TYPE_MAP: dict[str, ShareType] = {
    "disk": "disk",
    "print": "print",
    "ipc": "ipc",
    # Russian Windows
    "диск": "disk",
    "принтер": "print",
    "печать": "print",
}

# Share line after header: NAME  TYPE  [Used as]  [Comment]
# Type token is EN or RU; name may include $ for hidden.
_SHARE_LINE = re.compile(
    r"^(\S+)\s+"
    r"(Disk|Print|IPC|Диск|Принтер|Печать)\b"
    r"(?:\s+\S+)?"  # optional "Used as" column (often empty or drive letter)
    r"(?:\s+(.*))?$",
    re.IGNORECASE,
)


@dataclass
class ShareEntry:
    name: str
    share_type: ShareType
    comment: str | None = None
    hidden: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "share_type": self.share_type,
            "comment": self.comment,
            "hidden": self.hidden,
        }


@dataclass
class SmbEnumResult:
    status: str  # ok | denied | timeout | unreachable | error | skipped
    shares: list[ShareEntry] = field(default_factory=list)
    message: str | None = None


def _normalize_type(raw: str) -> ShareType:
    key = raw.strip().lower()
    return _TYPE_MAP.get(key, "unknown")


def parse_net_view(output: str) -> list[ShareEntry]:
    """Parse ``net view \\\\host /all`` stdout into share entries."""
    if not output or not output.strip():
        return []

    lines = output.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    shares: list[ShareEntry] = []
    seen: set[str] = set()
    in_table = False

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        # Skip banners / success footer
        low = stripped.lower()
        if low.startswith("shared resources") or "общие ресурсы" in low:
            continue
        if low.startswith("share name") or stripped.startswith("-----"):
            in_table = True
            continue
        if "command completed" in low or "команда выполнена" in low:
            break
        if low.startswith("the command") or low.startswith("system error"):
            continue

        m = _SHARE_LINE.match(stripped)
        if not m:
            # Some locales put type in column 2 without matching our set — skip noise
            if in_table and re.match(r"^\S+\s+\S+", stripped):
                parts = stripped.split(None, 2)
                if len(parts) >= 2 and _normalize_type(parts[1]) != "unknown":
                    name, typ = parts[0], parts[1]
                    comment = parts[2].strip() if len(parts) > 2 else None
                    # Used as often a single letter drive — strip leading junk from comment
                    if comment and re.fullmatch(r"[A-Za-z]:?", comment.split()[0] or ""):
                        rest = comment.split(None, 1)
                        comment = rest[1] if len(rest) > 1 else None
                    key = name.lower()
                    if key not in seen:
                        seen.add(key)
                        shares.append(
                            ShareEntry(
                                name=name,
                                share_type=_normalize_type(typ),
                                comment=comment or None,
                                hidden=name.endswith("$"),
                            )
                        )
            continue

        name = m.group(1)
        share_type = _normalize_type(m.group(2))
        comment = (m.group(3) or "").strip() or None
        if comment and re.fullmatch(r"[A-Za-z]:?", comment.split()[0]):
            rest = comment.split(None, 1)
            comment = rest[1] if len(rest) > 1 else None

        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        shares.append(
            ShareEntry(
                name=name,
                share_type=share_type,
                comment=comment,
                hidden=name.endswith("$"),
            )
        )

    return shares


def _classify_net_error(stdout: str, stderr: str, code: int) -> str:
    text = f"{stdout}\n{stderr}".lower()
    if "access is denied" in text or "отказано в доступе" in text or "error 5" in text:
        return "denied"
    if (
        "network path was not found" in text
        or "сетевой путь не найден" in text
        or "error 53" in text
    ):
        return "unreachable"
    if (
        "not found" in text
        or "не найден" in text
        or "error 67" in text  # network name not found
    ):
        return "unreachable"
    if "timed out" in text or "timeout" in text:
        return "timeout"
    if code != 0:
        return "error"
    return "ok"


def enum_smb_shares(ip: str, *, timeout_s: float = 8.0) -> SmbEnumResult:
    """Run ``net view \\\\ip /all`` and parse shares.

    Non-Windows: returns status ``skipped`` (no net.exe).
    """
    import sys

    host = (ip or "").strip()
    if not host:
        return SmbEnumResult(status="error", message="No IP")

    if sys.platform != "win32":
        return SmbEnumResult(status="skipped", message="SMB enum requires Windows net view")

    target = f"\\\\{host}"
    try:
        code, out, err = run_capture(["net", "view", target, "/all"], timeout=timeout_s)
    except subprocess.TimeoutExpired:
        return SmbEnumResult(status="timeout", message="net view timed out")
    except OSError as exc:
        return SmbEnumResult(status="error", message=str(exc)[:200])

    status = _classify_net_error(out, err, code)
    shares = parse_net_view(out) if out else []

    # net view can return 0 with empty table, or non-zero with partial text
    if status == "ok" and not shares and code != 0:
        status = _classify_net_error(out, err, code)
        if status == "ok":
            status = "error"

    # Empty list with success = ok (host allows enum, no shares listed)
    if status == "ok" or shares:
        # If we got shares even with non-zero, treat as ok (locale quirks)
        if shares and status in ("error", "ok"):
            status = "ok"
        return SmbEnumResult(
            status=status if status != "error" or shares else status,
            shares=shares,
            message=(err or out).strip()[:300] or None if status != "ok" else None,
        )

    return SmbEnumResult(
        status=status,
        shares=[],
        message=(err or out).strip()[:300] or None,
    )


def shares_to_json(shares: list[ShareEntry]) -> list[dict[str, Any]]:
    return [s.to_dict() for s in shares]


def diff_share_names(
    previous: list | None,
    current: list[ShareEntry],
) -> tuple[set[str], set[str]]:
    """Return (found names lower, gone names lower)."""
    prev: set[str] = set()
    for entry in previous or []:
        if isinstance(entry, dict) and entry.get("name"):
            prev.add(str(entry["name"]).lower())
    cur = {s.name.lower() for s in current}
    return cur - prev, prev - cur
