from app.services.nettools import _parse_rtt_ms, default_web_ui_local


def test_parse_rtt_english():
    out = "Reply from 192.168.1.1: bytes=32 time=4ms TTL=64"
    assert _parse_rtt_ms(out) == 4.0


def test_parse_rtt_less_than():
    out = "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64"
    assert _parse_rtt_ms(out) == 1.0


def test_default_web_ui():
    assert default_web_ui_local("10.0.0.5") == "http://10.0.0.5"
