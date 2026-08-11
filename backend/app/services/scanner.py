"""Windows network scanner: ping sweep + arp -a."""

from __future__ import annotations

import ipaddress
import re
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.scan import Scan
from app.models.setting import Setting
from app.services.device_diff import HostResult, apply_scan_results
from app.services.nettools import resolve_hostnames
from app.services.winconsole import decode_console, run_capture

_ARP_LINE_RE = re.compile(
    r"^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+"
    r"([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})\s+\S+",
    re.MULTILINE,
)

_scan_lock = threading.Lock()


class ScanAlreadyRunning(Exception):
    """Raised when a scan is already in progress."""


# Back-compat aliases for tests / older imports
_decode_console = decode_console
_run_capture = run_capture


def parse_arp_a(output: str) -> dict[str, str]:
    """Parse Windows `arp -a` output into ip -> mac (colon, lowercase).

    Skips broadcast/multicast all-ff addresses.
    """
    mapping: dict[str, str] = {}
    for match in _ARP_LINE_RE.finditer(output):
        ip = match.group(1)
        raw_mac = match.group(2)
        mac = raw_mac.lower().replace("-", ":")
        parts = mac.split(":")
        if len(parts) != 6:
            continue
        mac = ":".join(p.zfill(2) for p in parts)
        # Skip broadcast / all-ones MAC
        if mac == "ff:ff:ff:ff:ff:ff":
            continue
        # Skip IPv4 multicast MACs (01:00:5e:...)
        if mac.startswith("01:00:5e:"):
            continue
        mapping[ip] = mac
    return mapping


def hosts_in_subnet(cidr: str) -> list[str]:
    network = ipaddress.ip_network(cidr, strict=False)
    return [str(ip) for ip in network.hosts()]


def ping_host(ip: str) -> bool:
    """Windows ICMP ping: single probe, 800ms timeout.

    Prefer TTL marker when present (avoids false OK on some Windows errors).
    """
    try:
        code, out, _ = run_capture(["ping", "-n", "1", "-w", "800", ip], timeout=4)
        out_u = out.upper()
        if "TTL=" in out_u:
            return True
        # Fallback: success returncode without unreachable markers
        if code == 0 and "unreachable" not in out.lower() and "недоступ" not in out.lower():
            return True
        return False
    except (subprocess.TimeoutExpired, OSError):
        return False


def run_ping_sweep(subnet: str, concurrency: int = 50) -> list[str]:
    hosts = hosts_in_subnet(subnet)
    alive: list[str] = []
    if not hosts:
        return alive
    workers = max(1, min(concurrency, len(hosts)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(ping_host, ip): ip for ip in hosts}
        for fut in as_completed(futures):
            ip = futures[fut]
            try:
                if fut.result():
                    alive.append(ip)
            except Exception:
                continue
    return alive


def get_arp_table() -> str:
    try:
        _, out, _ = run_capture(["arp", "-a"], timeout=30)
        return out
    except (subprocess.TimeoutExpired, OSError):
        return ""


def _get_setting_value(db: Session, key: str, default: str) -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else default


def _build_host_results(
    alive_ips: set[str],
    arp_map: dict[str, str],
    subnet: str,
) -> list[HostResult]:
    network = ipaddress.ip_network(subnet, strict=False)
    found: list[HostResult] = []
    seen: set[str] = set()

    # ARP entries in subnet (dynamic or otherwise, non-broadcast already filtered)
    for ip, mac in arp_map.items():
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr not in network:
            continue
        if ip in seen:
            continue
        found.append(HostResult(mac=mac, ip=ip))
        seen.add(ip)

    # Ping responders that have a MAC in ARP but were not yet included
    for ip in alive_ips:
        if ip in seen:
            continue
        mac = arp_map.get(ip)
        if not mac:
            continue
        try:
            if ipaddress.ip_address(ip) not in network:
                continue
        except ValueError:
            continue
        found.append(HostResult(mac=mac, ip=ip))
        seen.add(ip)

    # Reverse DNS for discovered hosts
    names = resolve_hostnames([h.ip for h in found])
    for h in found:
        h.hostname = names.get(h.ip)

    return found


def is_scan_locked() -> bool:
    return _scan_lock.locked()


def run_scan_job(db: Session) -> Scan:
    """Run a full scan: ping sweep → arp → apply_scan_results.

    Raises ScanAlreadyRunning if another scan holds the lock or a DB row is running.
    """
    if not _scan_lock.acquire(blocking=False):
        raise ScanAlreadyRunning("A scan is already running")
    try:
        existing = db.query(Scan).filter(Scan.status == "running").first()
        if existing is not None:
            raise ScanAlreadyRunning("A scan is already running")

        subnet = _get_setting_value(db, "scan_subnet", "192.168.1.0/24")
        scan = Scan(
            status="running",
            subnet=subnet,
            devices_found=0,
            new_devices=0,
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)
        scan_id = scan.id

        try:
            alive = set(run_ping_sweep(subnet))
            arp_map = parse_arp_a(get_arp_table())
            hosts = _build_host_results(alive, arp_map, subnet)
            diff = apply_scan_results(db, hosts)

            # apply_scan_results commits; re-bind scan on this session
            scan = db.query(Scan).filter(Scan.id == scan_id).one()
            scan.status = "success"
            scan.devices_found = diff.devices_found
            scan.new_devices = diff.new_devices
            scan.finished_at = datetime.now(timezone.utc)
            scan.error_message = None
            db.commit()
            db.refresh(scan)
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            scan = db.query(Scan).filter(Scan.id == scan_id).first()
            if scan is not None:
                scan.status = "failed"
                scan.error_message = str(exc)[:2000]
                scan.finished_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(scan)
            else:
                raise
        return scan  # type: ignore[return-value]
    finally:
        _scan_lock.release()
