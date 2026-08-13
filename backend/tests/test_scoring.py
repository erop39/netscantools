from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from app.services.scoring import compute_device_score, compute_network_score, RISKY_PORTS


def _dev(**kw):
    base = dict(
        open_ports=[],
        vendor="X",
        hostname="h",
        name=None,
        status="online",
        last_seen=datetime.now(timezone.utc),
        first_seen=datetime.now(timezone.utc) - timedelta(days=30),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_perfect_device_scores_100():
    score, br = compute_device_score(_dev())
    assert score == 100
    assert br == []


def test_risky_port_penalty():
    score, br = compute_device_score(_dev(open_ports=[{"port": 445, "source": "quick"}]))
    assert score == 80  # 100-20
    assert any(x["code"] == "risky_ports" for x in br)


def test_new_device_penalty():
    score, _ = compute_device_score(_dev(first_seen=datetime.now(timezone.utc)))
    assert score == 95


def test_network_score_mean_and_empty():
    assert compute_network_score([80, 100]) == 90
    assert compute_network_score([]) is None
