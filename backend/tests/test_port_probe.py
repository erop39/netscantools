from app.services.port_probe import merge_open_ports, parse_port_csv


def test_parse_port_csv():
    assert parse_port_csv("80, 443,22") == [80, 443, 22]


def test_quick_does_not_drop_full_outside_set():
    prev = [{"port": 8443, "service": None, "source": "full"}, {"port": 22, "service": "ssh", "source": "quick"}]
    # quick scans 22,80 — only 80 open
    out = merge_open_ports(prev, [22, 80], [80], "quick")
    ports = {p["port"]: p for p in out}
    assert 8443 in ports  # preserved
    assert 22 not in ports  # closed in quick set
    assert ports[80]["source"] == "quick"


def test_full_scoped_preserves_outside_list():
    prev = [{"port": 445, "service": "smb", "source": "quick"}]
    out = merge_open_ports(prev, [80, 443], [], "full")
    assert any(p["port"] == 445 for p in out)
