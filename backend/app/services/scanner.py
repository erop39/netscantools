"""Windows network scanner: ping sweep + arp -a."""

from __future__ import annotations

import ipaddress
import re
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.device import Device
from app.models.scan import Scan
from app.models.setting import Setting
from app.services import nettools as nettools_mod
from app.services import port_probe as port_probe_mod
from app.services import latency_history as latency_mod
from app.services import smb_enum as smb_enum_mod
from app.services.device_diff import (
    HostResult,
    apply_scan_results,
    normalize_mac,
    update_device_probe_fields,
)
from app.services.device_events import log_event
from app.services.nettools import resolve_hostnames
from app.services.winconsole import decode_console, run_capture

# Fallback when Settings has no quick_ports row yet (Task 6 adds default).
_DEFAULT_QUICK_PORTS = "22,80,443,445,3389,8080,8443"

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
    *,
    resolve_dns: bool = True,
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

    # Reverse DNS — skip on presence-only quick scan for speed
    if resolve_dns and found:
        names = resolve_hostnames([h.ip for h in found])
        for h in found:
            h.hostname = names.get(h.ip)

    return found


def is_scan_locked() -> bool:
    return _scan_lock.locked()


def _has_open_port(device: Device, port: int) -> bool:
    ports = device.open_ports if isinstance(device.open_ports, list) else None
    if not ports:
        return False
    for entry in ports:
        if not isinstance(entry, dict):
            continue
        try:
            if int(entry.get("port")) == port:
                return True
        except (TypeError, ValueError):
            continue
    return False


def _auto_scan_smb_shares(db: Session, *, max_hosts: int = 12) -> None:
    """Best-effort SMB enum for online devices with TCP 445 open."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(Device)
        .filter(Device.status == "online", Device.ip.isnot(None))
        .all()
    )
    done = 0
    for device in candidates:
        if done >= max_hosts:
            break
        if not _has_open_port(device, 445):
            continue
        if not device.ip:
            continue
        try:
            prev = device.smb_shares if isinstance(device.smb_shares, list) else None
            result = smb_enum_mod.enum_smb_shares(device.ip, timeout_s=5.0)
            device.smb_scan_status = result.status
            device.smb_scanned_at = now
            device.updated_at = now
            if result.status == "ok":
                found, gone = smb_enum_mod.diff_share_names(prev, result.shares)
                device.smb_shares = smb_enum_mod.shares_to_json(result.shares)
                by_name = {s.name.lower(): s for s in result.shares}
                for name in sorted(found):
                    entry = by_name.get(name)
                    log_event(
                        db,
                        device.id,
                        "share_found",
                        details={
                            "name": entry.name if entry else name,
                            "share_type": entry.share_type if entry else "unknown",
                            "ip": device.ip,
                            "auto": True,
                        },
                    )
                for name in sorted(gone):
                    log_event(
                        db,
                        device.id,
                        "share_gone",
                        details={"name": name, "ip": device.ip, "auto": True},
                    )
            done += 1
        except Exception:
            continue
        try:
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass


def run_scan_job(db: Session, *, mode: str = "full") -> Scan:
    """Run network scan.

    * ``mode="quick"`` — presence only: ping sweep + ARP + online/offline/new/IP.
      No port probe, no latency, no reverse DNS.
    * ``mode="full"`` (default) — above + quick_ports TCP probe + latency.

    Raises ScanAlreadyRunning if another scan holds the lock or a DB row is running.
    """
    mode_norm = (mode or "full").strip().lower()
    if mode_norm not in ("quick", "full"):
        mode_norm = "full"

    if not _scan_lock.acquire(blocking=False):
        raise ScanAlreadyRunning("A scan is already running")
    try:
        existing = db.query(Scan).filter(Scan.status == "running").first()
        if existing is not None:
            raise ScanAlreadyRunning("A scan is already running")

        subnet = _get_setting_value(db, "scan_subnet", "192.168.1.0/24")
        scan = Scan(
            status="running",
            mode=mode_norm,
            subnet=subnet,
            devices_found=0,
            new_devices=0,
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)
        scan_id = scan.id

        try:
            # Slightly more aggressive concurrency on quick presence sweeps
            concurrency = 80 if mode_norm == "quick" else 50
            alive = set(run_ping_sweep(subnet, concurrency=concurrency))
            arp_map = parse_arp_a(get_arp_table())
            hosts = _build_host_results(
                alive,
                arp_map,
                subnet,
                resolve_dns=(mode_norm == "full"),
            )
            diff = apply_scan_results(db, hosts)

            if mode_norm == "full":
                # Phase: quick ports + latency (per-host isolation)
                quick_csv = _get_setting_value(db, "quick_ports", _DEFAULT_QUICK_PORTS)
                scanned_ports = port_probe_mod.parse_port_csv(quick_csv)
                for host in hosts:
                    if not host.ip:
                        continue
                    try:
                        mac = normalize_mac(host.mac)
                    except ValueError:
                        continue
                    try:
                        device = db.query(Device).filter(Device.mac == mac).first()
                        if device is None:
                            continue

                        latency_ms: float | None = None
                        ports_ok = False
                        open_now: list[int] = []
                        try:
                            open_now = port_probe_mod.probe_host_ports(
                                host.ip, scanned_ports
                            )
                            ports_ok = True
                        except Exception:
                            ports_ok = False

                        try:
                            pr = nettools_mod.ping_detail(
                                host.ip, count=1, timeout_ms=800
                            )
                            if pr.ok and pr.rtt_ms is not None:
                                latency_ms = float(pr.rtt_ms)
                        except Exception:
                            pass

                        merged = None
                        if ports_ok:
                            merged = port_probe_mod.merge_open_ports(
                                device.open_ports
                                if isinstance(device.open_ports, list)
                                else None,
                                scanned_ports,
                                open_now,
                                "quick",
                            )

                        update_device_probe_fields(
                            db,
                            device,
                            latency_ms,
                            merged,
                            ports_ok,
                        )
                        if latency_ms is not None:
                            try:
                                latency_mod.record_latency(
                                    db, device.id, latency_ms
                                )
                            except Exception:
                                pass
                    except Exception:
                        # One host must not abort the scan
                        continue

                # Optional: SMB share enum when 445 open (opt-in setting)
                auto_shares = _get_setting_value(db, "share_scan_auto", "0")
                if auto_shares.strip() in ("1", "true", "yes", "on"):
                    _auto_scan_smb_shares(db)

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
