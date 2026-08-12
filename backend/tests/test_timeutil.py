from datetime import datetime, timezone, timedelta

from app.timeutil import ensure_utc, to_api_iso, utc_now


def test_to_api_iso_naive_assumed_utc():
    dt = datetime(2026, 8, 12, 15, 30, 0)
    assert to_api_iso(dt) == "2026-08-12T15:30:00Z"


def test_to_api_iso_aware_converted_to_utc():
    # UTC+3 → 12:30Z
    dt = datetime(2026, 8, 12, 15, 30, 0, tzinfo=timezone(timedelta(hours=3)))
    assert to_api_iso(dt) == "2026-08-12T12:30:00Z"


def test_utc_now_aware():
    n = utc_now()
    assert n.tzinfo is not None
    assert ensure_utc(n) is not None


def test_health_includes_server_time(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "server_time_utc" in body
    assert body["server_time_utc"].endswith("Z")


def test_time_endpoint(client):
    r = client.get("/api/time")
    assert r.status_code == 200
    body = r.json()
    assert body["server_timezone"] == "UTC"
    assert body["server_time_utc"].endswith("Z")
    assert int(body["unix_ms"]) > 0
