"""Host utilities: reverse DNS and detailed ping (Windows-friendly)."""

from __future__ import annotations

import re
import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from app.services.winconsole import run_capture


_RTT_RE = re.compile(
    r"(?:time[=<]\s*(\d+(?:[.,]\d+)?)\s*ms|время[=<]\s*(\d+(?:[.,]\d+)?)\s*мс)",
    re.IGNORECASE,
)


@dataclass
class PingResult:
    ok: bool
    ip: str
    rtt_ms: float | None
    message: str


def resolve_hostname(ip: str, timeout: float = 1.5) -> str | None:
    """Reverse DNS lookup for IPv4. Returns short hostname or None."""
    if not ip or not ip.strip():
        return None
    ip = ip.strip()
    try:
        socket.setdefaulttimeout(timeout)
        name, _, _ = socket.gethostbyaddr(ip)
        if not name:
            return None
        # Strip trailing dot and domain noise for display; keep FQDN if useful
        name = name.rstrip(".")
        return name
    except (socket.herror, socket.gaierror, socket.timeout, OSError):
        return None
    finally:
        socket.setdefaulttimeout(None)


def resolve_hostnames(ips: list[str], concurrency: int = 32, timeout: float = 1.2) -> dict[str, str]:
    """Map ip -> hostname for those that resolve."""
    out: dict[str, str] = {}
    if not ips:
        return out
    workers = max(1, min(concurrency, len(ips)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(resolve_hostname, ip, timeout): ip for ip in ips}
        for fut in as_completed(futs):
            ip = futs[fut]
            try:
                name = fut.result()
                if name:
                    out[ip] = name
            except Exception:
                continue
    return out


def _parse_rtt_ms(output: str) -> float | None:
    m = _RTT_RE.search(output)
    if not m:
        return None
    raw = m.group(1) or m.group(2)
    if not raw:
        return None
    try:
        return float(raw.replace(",", "."))
    except ValueError:
        return None


def ping_detail(ip: str, count: int = 2, timeout_ms: int = 1000) -> PingResult:
    """Run a short ICMP ping and return structured result."""
    if not ip or not ip.strip():
        return PingResult(ok=False, ip=ip or "", rtt_ms=None, message="No IP address")
    ip = ip.strip()
    try:
        # Windows: -n count, -w timeout_ms
        code, out, err = run_capture(
            ["ping", "-n", str(count), "-w", str(timeout_ms), ip],
            timeout=max(6.0, count * (timeout_ms / 1000.0) + 2.0),
        )
        text = (out or "") + (err or "")
        rtt = _parse_rtt_ms(text)
        ok = "TTL=" in text.upper()
        if not ok and code == 0:
            low = text.lower()
            ok = "unreachable" not in low and "недоступ" not in low and "100%" not in low
        if ok:
            msg = "Reachable" + (f", {rtt:.0f} ms" if rtt is not None else "")
            return PingResult(ok=True, ip=ip, rtt_ms=rtt, message=msg)
        return PingResult(ok=False, ip=ip, rtt_ms=None, message="No reply")
    except Exception as exc:
        return PingResult(ok=False, ip=ip, rtt_ms=None, message=str(exc)[:200])


def default_web_ui_local(ip: str) -> str:
    return f"http://{ip}"
