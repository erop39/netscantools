from datetime import datetime, timezone

from app.models.device import Device
from app.models.scan import Scan
from app.services import scanner as scanner_mod


def _seed_one_host(monkeypatch):
    monkeypatch.setattr(
        scanner_mod,
        "run_ping_sweep",
        lambda subnet, concurrency=50: ["192.168.1.5"],
    )
    monkeypatch.setattr(
        scanner_mod,
        "get_arp_table",
        lambda: "  192.168.1.5           aa-bb-cc-dd-ee-05     dynamic",
    )
    monkeypatch.setattr(scanner_mod, "resolve_hostnames", lambda ips, **kw: {})


def test_scan_applies_latency_and_ports(db_session, monkeypatch):
    # seed: pretend sweep finds one host
    _seed_one_host(monkeypatch)
    probes = {"ports": 0, "latency": 0}

    def _probe(ip, ports, timeout_s=0.35):
        probes["ports"] += 1
        return [80] if 80 in ports else []

    def _ping(ip, count=1, timeout_ms=800):
        probes["latency"] += 1
        return type("R", (), {"ok": True, "ip": ip, "rtt_ms": 12.5, "message": "ok"})()

    monkeypatch.setattr("app.services.port_probe.probe_host_ports", _probe)
    monkeypatch.setattr("app.services.nettools.ping_detail", _ping)
    # override quick_ports (default seeded by ensure_default_settings)
    from app.models.setting import Setting
    row = db_session.query(Setting).filter_by(key="quick_ports").first()
    if row is None:
        db_session.add(Setting(key="quick_ports", value="80,443"))
    else:
        row.value = "80,443"
    db_session.commit()

    scan = scanner_mod.run_scan_job(db_session, mode="full")
    assert scan.status == "success"
    assert scan.mode == "full"
    assert probes["ports"] >= 1
    d = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:05").one()
    assert d.latency_ms == 12.5
    assert any(p["port"] == 80 for p in (d.open_ports or []))
    assert d.security_score is not None


def test_quick_scan_skips_ports_and_latency(db_session, monkeypatch):
    _seed_one_host(monkeypatch)
    called = {"ports": 0, "latency": 0}

    def _probe(*a, **k):
        called["ports"] += 1
        return [80]

    def _ping(*a, **k):
        called["latency"] += 1
        return type("R", (), {"ok": True, "ip": "x", "rtt_ms": 1.0, "message": "ok"})()

    monkeypatch.setattr("app.services.port_probe.probe_host_ports", _probe)
    monkeypatch.setattr("app.services.nettools.ping_detail", _ping)

    scan = scanner_mod.run_scan_job(db_session, mode="quick")
    assert scan.status == "success"
    assert scan.mode == "quick"
    assert called["ports"] == 0
    assert called["latency"] == 0
    d = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:05").one()
    assert d.status == "online"
    assert d.open_ports in (None, [],) or d.latency_ms is None
    # ports/latency not filled by quick scan
    assert d.latency_ms is None
    assert not d.open_ports


def test_reclaim_orphaned_running_scans(db_session):
    stuck = Scan(
        status="running",
        mode="full",
        subnet="192.168.1.0/24",
        devices_found=0,
        new_devices=0,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(stuck)
    db_session.commit()
    n = scanner_mod.reclaim_orphaned_scans(
        db_session, reason="Interrupted (test)"
    )
    assert n == 1
    db_session.refresh(stuck)
    assert stuck.status == "failed"
    assert stuck.finished_at is not None
    assert "Interrupted" in (stuck.error_message or "")
    # Second call is a no-op
    assert scanner_mod.reclaim_orphaned_scans(db_session) == 0
