"""Windows console subprocess helpers (OEM encoding)."""

from __future__ import annotations

import subprocess
import sys


def console_encoding() -> str:
    if sys.platform == "win32":
        return "oem"
    return "utf-8"


def decode_console(data: bytes | None) -> str:
    if not data:
        return ""
    enc = console_encoding()
    try:
        return data.decode(enc)
    except UnicodeDecodeError:
        return data.decode(enc, errors="replace")


def run_capture(args: list[str], timeout: float) -> tuple[int, str, str]:
    result = subprocess.run(
        args,
        capture_output=True,
        timeout=timeout,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return (
        result.returncode,
        decode_console(result.stdout),
        decode_console(result.stderr),
    )
