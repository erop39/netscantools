"""HTTPS certificate probe for LAN devices."""

from __future__ import annotations

import socket
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse


@dataclass
class TlsProbeResult:
    status: str  # ok | expired | self_signed | error | unreachable | skipped
    expires_at: datetime | None = None
    issuer: str | None = None
    error: str | None = None


def _parse_not_after(cert: dict[str, Any]) -> datetime | None:
    # Python 3.13+: notAfter may be absent; use notAfter from getpeercert
    raw = cert.get("notAfter")
    if not raw or not isinstance(raw, str):
        return None
    # e.g. 'Aug 12 12:00:00 2027 GMT'
    try:
        return datetime.strptime(raw, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(raw, "%b %d %H:%M:%S %Y GMT").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def _issuer_cn(cert: dict[str, Any]) -> str | None:
    issuer = cert.get("issuer")
    if not issuer:
        return None
    # issuer is tuple of tuples ((('countryName', 'US'),), (('commonName', 'x'),), ...)
    parts: list[str] = []
    try:
        for rdn in issuer:
            for key, val in rdn:
                if key in ("commonName", "organizationName"):
                    parts.append(str(val))
    except (TypeError, ValueError):
        return str(issuer)[:255]
    return ", ".join(parts)[:255] if parts else None


def resolve_tls_target(device_like: Any) -> tuple[str, int] | None:
    """Pick host:port for TLS check — prefer https web_ui, else IP:443."""
    for attr in ("web_ui_local", "web_ui_external"):
        url = getattr(device_like, attr, None)
        if not url or not isinstance(url, str):
            continue
        u = url.strip()
        if not u.lower().startswith("https://"):
            continue
        parsed = urlparse(u)
        host = parsed.hostname
        if not host:
            continue
        port = parsed.port or 443
        return host, port

    ip = getattr(device_like, "ip", None)
    if ip and str(ip).strip():
        return str(ip).strip(), 443
    return None


def probe_tls(host: str, port: int = 443, *, timeout_s: float = 3.0) -> TlsProbeResult:
    """Connect with CERT_NONE, inspect peer cert (LAN-friendly; self-signed expected)."""
    if not host:
        return TlsProbeResult(status="skipped", error="No host")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with socket.create_connection((host, port), timeout=timeout_s) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                # With CERT_NONE, getpeercert() may be empty — use binary form
                if not cert:
                    cert = ssock.getpeercert(binary_form=False) or {}
                # Try again with binary decode via openssl-less path
                if not cert:
                    der = ssock.getpeercert(binary_form=True)
                    if der:
                        # Minimal: no cryptography dep — mark ok if handshake worked
                        return TlsProbeResult(
                            status="ok",
                            issuer="(peer cert present)",
                            expires_at=None,
                        )
                    return TlsProbeResult(status="error", error="Empty peer certificate")

                expires = _parse_not_after(cert)
                issuer = _issuer_cn(cert)
                now = datetime.now(timezone.utc)
                if expires is not None and expires < now:
                    return TlsProbeResult(
                        status="expired",
                        expires_at=expires,
                        issuer=issuer,
                        error="Certificate expired",
                    )

                # Heuristic self-signed: subject == issuer commonName
                subject_cn = None
                try:
                    for rdn in cert.get("subject") or ():
                        for key, val in rdn:
                            if key == "commonName":
                                subject_cn = str(val)
                except (TypeError, ValueError):
                    pass
                if subject_cn and issuer and subject_cn in issuer:
                    # Could still be OK for LAN — flag as self_signed
                    return TlsProbeResult(
                        status="self_signed",
                        expires_at=expires,
                        issuer=issuer,
                    )

                return TlsProbeResult(status="ok", expires_at=expires, issuer=issuer)
    except TimeoutError:
        return TlsProbeResult(status="unreachable", error="Connection timed out")
    except (ConnectionRefusedError, OSError) as exc:
        return TlsProbeResult(status="unreachable", error=str(exc)[:200])
    except ssl.SSLError as exc:
        msg = str(exc)[:200]
        low = msg.lower()
        if "certificate has expired" in low:
            return TlsProbeResult(status="expired", error=msg)
        if "self signed" in low or "self-signed" in low:
            return TlsProbeResult(status="self_signed", error=msg)
        return TlsProbeResult(status="error", error=msg)


def probe_device_tls(device_like: Any) -> TlsProbeResult:
    target = resolve_tls_target(device_like)
    if not target:
        return TlsProbeResult(status="skipped", error="No HTTPS target or IP")
    host, port = target
    return probe_tls(host, port)
