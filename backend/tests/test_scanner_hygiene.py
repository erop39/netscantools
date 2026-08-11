from app.services import scanner as scanner_mod
from app.models.device import Device


def test_scan_applies_latency_and_ports(db_session, monkeypatch):
    # seed: pretend sweep finds one host
    monkeypatch.setattr(scanner_mod, "run_ping_sweep", lambda subnet, concurrency=50: ["192.168.1.5"])
    monkeypatch.setattr(scanner_mod, "get_arp_table", lambda: "  192.168.1.5           aa-bb-cc-dd-ee-05     dynamic")
    monkeypatch.setattr(scanner_mod, "resolve_hostnames", lambda ips, **kw: {})
    monkeypatch.setattr(
        "app.services.port_probe.probe_host_ports",
        lambda ip, ports, timeout_s=0.35: [80] if 80 in ports else [],
    )
    monkeypatch.setattr(
        "app.services.nettools.ping_detail",
        lambda ip, count=1, timeout_ms=800: type("R", (), {"ok": True, "ip": ip, "rtt_ms": 12.5, "message": "ok"})(),
    )
    # override quick_ports (default seeded by ensure_default_settings)
    from app.models.setting import Setting
    row = db_session.query(Setting).filter_by(key="quick_ports").first()
    if row is None:
        db_session.add(Setting(key="quick_ports", value="80,443"))
    else:
        row.value = "80,443"
    db_session.commit()

    scan = scanner_mod.run_scan_job(db_session)
    assert scan.status == "success"
    d = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:05").one()
    assert d.latency_ms == 12.5
    assert any(p["port"] == 80 for p in (d.open_ports or []))
    assert d.security_score is not None
