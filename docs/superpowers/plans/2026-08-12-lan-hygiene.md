# LAN Hygiene Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship home-LAN hygiene: persist latency + open ports, DeviceEvent timeline, device/network security scores, Hygiene page with checklist — without rogue DHCP/scapy.

**Architecture:** Extend `Device` columns and `ensure_schema`; add `device_events` + `hygiene_checklist_items`; pure services `scoring`, `port_probe`, `device_events`; extend `device_diff` + `scanner` with quick ports + latency; new `/api/hygiene` router; enrich Devices/Detail + new Hygiene page. Port merge is **scoped** (probe only mutates ports it scanned). Event types ≠ notification types (`went_offline` → notify `device_offline`).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, pytest, React + Vite + Tailwind, Classic glass UI, JWT cookie auth. Windows TCP connect + ICMP ping (no scapy).

**Spec:** `docs/superpowers/specs/2026-08-12-lan-hygiene-design.md`

## Global Constraints

- Classic glass UI only
- Windows-first; no scapy / Npcap / Docker NET_RAW in this plan
- No rogue DHCP, no ARP IP-conflict
- Do not write open_ports into Planner ports
- MAC storage: **lowercase** `aa:bb:cc:dd:ee:ff` project-wide (fix Planner uppercase)
- Checklist does **not** affect security score
- Scoped port merge for quick **and** full (§6.1 of spec)
- Event → notification mapping §5.2.1 of spec (do not invent `notification.type=went_offline`)
- Follow existing patterns: `app/models/*`, `app/api/*`, `tests/conftest.py`, `frontend/src/pages/*`, `ensure_schema` for SQLite ALTER
- YAGNI: no latency history series, no score_changed spam, no multi-plan

## File map

| Path | Responsibility |
|------|----------------|
| `backend/app/models/device.py` | + latency_ms, open_ports, ports_scanned_at, security_score |
| `backend/app/models/event.py` | DeviceEvent |
| `backend/app/models/hygiene.py` | HygieneChecklistItem |
| `backend/app/models/__init__.py` | Register models |
| `backend/app/db.py` | ensure_schema ALTER for new device columns |
| `backend/app/services/scoring.py` | device score + breakdown + network mean |
| `backend/app/services/port_probe.py` | TCP connect scan + scoped merge |
| `backend/app/services/device_events.py` | log_event + maybe_notify mapping |
| `backend/app/services/device_diff.py` | Events, ports/latency apply hooks, score |
| `backend/app/services/scanner.py` | Phases: quick ports + latency |
| `backend/app/services/planner.py` | normalize_mac → lowercase; migrate reads |
| `backend/app/services/auth.py` | DEFAULT_SETTINGS quick_ports |
| `backend/app/schemas/device.py` | DeviceOut fields, events, scan-ports out |
| `backend/app/schemas/hygiene.py` | HygieneOut, checklist schemas |
| `backend/app/schemas/settings.py` | quick_ports |
| `backend/app/api/devices.py` | events, scan-ports, ping latency, to_out |
| `backend/app/api/hygiene.py` | Hygiene router |
| `backend/app/api/settings.py` | quick_ports get/put |
| `backend/app/main.py` | include hygiene router |
| `backend/tests/test_scoring.py` | Pure score unit tests |
| `backend/tests/test_port_probe.py` | Merge + parse ports |
| `backend/tests/test_device_diff.py` | Extend events/notifications |
| `backend/tests/test_hygiene_api.py` | Hygiene + checklist + scan-ports |
| `backend/tests/test_devices_api.py` | Schema fields, events endpoint |
| `backend/tests/test_planner_api.py` | Expect lowercase MAC |
| `frontend/src/types/index.ts` | Hygiene + Device fields |
| `frontend/src/pages/Hygiene.tsx` | New page |
| `frontend/src/pages/Devices.tsx` | latency/ports/score/NEW |
| `frontend/src/pages/DeviceDetail.tsx` | ports, score, timeline, scan ports |
| `frontend/src/pages/Settings.tsx` | quick_ports |
| `frontend/src/components/layout/Sidebar.tsx` | Hygiene nav |
| `frontend/src/components/icons.tsx` | IconHygiene |
| `frontend/src/App.tsx` | Route |
| `docs/changelog.md` | 0.8.0 notes |
| `docs/README.md` | Feature bullet |

---

### Task 1: Device columns + DeviceEvent + Checklist models + ensure_schema

**Files:**
- Modify: `backend/app/models/device.py`
- Create: `backend/app/models/event.py`
- Create: `backend/app/models/hygiene.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/db.py` (`ensure_schema`)
- Test: `backend/tests/test_models_hygiene.py` (lightweight create)

**Interfaces:**
- Produces: `Device.latency_ms: float | None`, `open_ports: list | None` (JSON), `ports_scanned_at`, `security_score: int | None`
- Produces: `DeviceEvent(id, device_id, type, details, created_at)`
- Produces: `HygieneChecklistItem(id, key, label, checked, checked_at, sort_order)`

- [ ] **Step 1: Write failing test — models import + create_all has tables**

```python
# backend/tests/test_models_hygiene.py
from app.models.device import Device
from app.models.event import DeviceEvent
from app.models.hygiene import HygieneChecklistItem


def test_device_has_hygiene_columns():
    assert hasattr(Device, "latency_ms")
    assert hasattr(Device, "open_ports")
    assert hasattr(Device, "ports_scanned_at")
    assert hasattr(Device, "security_score")


def test_event_and_checklist_tables(db_session):
    e = DeviceEvent(device_id=None, type="new_device", details={"mac": "aa:bb:cc:dd:ee:ff"})
    db_session.add(e)
    db_session.add(
        HygieneChecklistItem(key="router_password", label="Router password changed", sort_order=0)
    )
    db_session.commit()
    assert db_session.query(DeviceEvent).count() == 1
    assert db_session.query(HygieneChecklistItem).count() == 1
```

- [ ] **Step 2: Run test — expect fail**

```powershell
cd C:\Users\eGoR\netscantools\backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_models_hygiene.py -v
```

Expected: FAIL (import / missing attrs)

- [ ] **Step 3: Implement models**

```python
# device.py — add columns (JSON via sqlalchemy.JSON):
from sqlalchemy import JSON, Float, Integer
# ...
latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
open_ports: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
ports_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
security_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

```python
# backend/app/models/event.py
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

class DeviceEvent(Base):
    __tablename__ = "device_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
```

```python
# backend/app/models/hygiene.py
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

class HygieneChecklistItem(Base):
    __tablename__ = "hygiene_checklist_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255))
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
```

Register in `__init__.py`. In `ensure_schema`, after existing name/icon ALTERs:

```python
for col, ddl in [
    ("latency_ms", "ALTER TABLE devices ADD COLUMN latency_ms FLOAT"),
    ("open_ports", "ALTER TABLE devices ADD COLUMN open_ports JSON"),
    ("ports_scanned_at", "ALTER TABLE devices ADD COLUMN ports_scanned_at DATETIME"),
    ("security_score", "ALTER TABLE devices ADD COLUMN security_score INTEGER"),
]:
    if col not in col_names:
        conn.execute(text(ddl))
```

(`create_all` still creates new tables `device_events`, `hygiene_checklist_items` on startup via existing main path.)

- [ ] **Step 4: Run tests — PASS**

```powershell
pytest tests/test_models_hygiene.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/models backend/app/db.py backend/tests/test_models_hygiene.py
git commit -m "feat(hygiene): device columns, DeviceEvent, checklist models"
```

---

### Task 2: Scoring service (pure)

**Files:**
- Create: `backend/app/services/scoring.py`
- Test: `backend/tests/test_scoring.py`

**Interfaces:**
- Produces: `RISKY_PORTS: frozenset[int] = frozenset({21, 23, 135, 139, 445, 3389, 5900})`
- Produces: `NEW_DEVICE_HOURS: int = 24`
- Produces: `ScoreBreakdownItem` dataclass or typed dict `{code, label, delta}`
- Produces: `compute_device_score(device_like, *, now: datetime | None = None) -> tuple[int, list[dict]]`
- Produces: `compute_network_score(scores: list[int]) -> int | None` (mean of online scores; empty → None)

`device_like` needs: `open_ports` (list of dicts with `port`), `vendor`, `hostname`, `name`, `status`, `last_seen`, `first_seen`.

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_scoring.py
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
```

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_scoring.py -v
```

- [ ] **Step 3: Implement `scoring.py`**

Penalties from spec §7.1:
- risky: −20 first + −5 each additional (cap −35 total for risky)
- open ports excluding 80/443 count > 8 → −10
- no vendor → −5
- no hostname and no name → −5
- offline OR last_seen older than 7 days → −15
- is_new (first_seen within 24h) → −5
- clamp 0..100

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_scoring.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/scoring.py backend/tests/test_scoring.py
git commit -m "feat(hygiene): security score service"
```

---

### Task 3: port_probe + scoped merge

**Files:**
- Create: `backend/app/services/port_probe.py`
- Test: `backend/tests/test_port_probe.py`

**Interfaces:**
- Produces: `parse_port_csv(s: str) -> list[int]`
- Produces: `probe_host_ports(ip: str, ports: list[int], timeout_s: float = 0.35) -> list[int]`  
  (returns open port numbers; uses non-blocking TCP connect / `socket.create_connection`)
- Produces: `merge_open_ports(previous: list[dict] | None, scanned_ports: list[int], open_now: list[int], source: str) -> list[dict]`  
  Scoped merge per spec §6.1; each entry `{"port": int, "service": str | None, "source": str}`  
  Optional simple service map for well-known ports (80→http, 443→https, 22→ssh, 445→smb, 3389→rdp).

- [ ] **Step 1: Write failing merge tests (no network)**

```python
# backend/tests/test_port_probe.py
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
```

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_port_probe.py -v
```

- [ ] **Step 3: Implement merge + parse + probe_host_ports**

```python
def probe_host_ports(ip: str, ports: list[int], timeout_s: float = 0.35) -> list[int]:
    open_ports: list[int] = []
    for port in ports:
        try:
            with socket.create_connection((ip, port), timeout=timeout_s):
                open_ports.append(port)
        except OSError:
            continue
    return open_ports
```

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_port_probe.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/port_probe.py backend/tests/test_port_probe.py
git commit -m "feat(hygiene): TCP port probe and scoped merge"
```

---

### Task 4: device_events helper + extend device_diff

**Files:**
- Create: `backend/app/services/device_events.py`
- Modify: `backend/app/services/device_diff.py`
- Modify: `backend/tests/test_device_diff.py`

**Interfaces:**
- Produces: `log_event(db, device_id: int | None, type: str, details: dict | None = None) -> DeviceEvent`
- Produces: `notification_type_for_event(event_type: str, details: dict | None) -> str | None`  
  Mapping: `new_device`→`new_device`, `ip_changed`→`ip_changed`, `went_offline`→`device_offline`, `port_opened`→`port_opened` only if port in RISKY_PORTS, else None; others None.
- Produces: `log_event_and_maybe_notify(db, device_id, event_type, message: str, details=None)` — always event; notify if mapping non-None.
- Modifies: `apply_scan_results` to use log_event_and_maybe_notify for new/ip/offline; add `came_online` event (no notify) when status was offline; after updates call score recompute and set `device.security_score`.
- Optional kwargs or module-level: accept precomputed `latency_by_mac` / `ports_by_mac` dicts applied in same pass (or Task 5 calls separate apply after). Prefer Task 5 to call helpers from scanner after diff — keep diff focused:  
  **Produces also:** `apply_latency_and_ports(db, updates: list[tuple[mac, latency|None, open_ports|None, ports_ok: bool]])` if cleaner — otherwise Task 5 patches devices after diff.

**Recommended flow for Task 4:** only events + notify refactor + score on apply_scan_results. Latency/ports applied in Task 5 via small helper `update_device_probe_fields(db, device, latency_ms, open_ports_merged, ports_ok)`.

- [ ] **Step 1: Extend failing tests in `test_device_diff.py`**

```python
from app.models.event import DeviceEvent
from app.models.notification import Notification

def test_new_device_creates_event_and_notification(db_session):
    apply_scan_results(db_session, [HostResult(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.10")])
    db_session.commit()
    assert db_session.query(DeviceEvent).filter_by(type="new_device").count() == 1
    assert db_session.query(Notification).filter_by(type="new_device").count() == 1

def test_offline_event_type_went_offline_notify_device_offline(db_session):
    apply_scan_results(db_session, [HostResult(mac="aa:bb:cc:dd:ee:02", ip="192.168.1.11")])
    db_session.commit()
    apply_scan_results(db_session, [])  # all missing
    db_session.commit()
    assert db_session.query(DeviceEvent).filter_by(type="went_offline").count() == 1
    assert db_session.query(Notification).filter_by(type="device_offline").count() == 1
```

- [ ] **Step 2: Run — FAIL (no events)**

```powershell
pytest tests/test_device_diff.py -v
```

- [ ] **Step 3: Implement device_events + wire device_diff**

Replace direct `Notification(...)` creates for new/ip/offline with `log_event_and_maybe_notify`. Keep messages similar to existing strings. Set `security_score` via `compute_device_score` for each touched device at end of `apply_scan_results`.

- [ ] **Step 4: Run full device_diff tests — PASS**

```powershell
pytest tests/test_device_diff.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/device_events.py backend/app/services/device_diff.py backend/tests/test_device_diff.py
git commit -m "feat(hygiene): DeviceEvent logging and notify mapping"
```

---

### Task 5: Scanner phases — quick ports + latency

**Files:**
- Modify: `backend/app/services/scanner.py`
- Modify: `backend/app/services/device_diff.py` (helper to apply probe fields + port_opened/closed events)
- Test: `backend/tests/test_scanner_hygiene.py` (mock probe/ping)

**Interfaces:**
- Consumes: `parse_port_csv`, `probe_host_ports`, `merge_open_ports`, `ping_detail`
- Consumes: settings keys `quick_ports` (fallback DEFAULT)
- Produces: after ARP/DNS, for each online host with IP: probe quick ports; sample latency; apply to Device; emit `port_opened`/`port_closed` via event helper when set changes; recompute score.

- [ ] **Step 1: Write test with monkeypatch**

```python
# backend/tests/test_scanner_hygiene.py
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
    # ensure quick_ports setting exists
    from app.models.setting import Setting
    db_session.add(Setting(key="quick_ports", value="80,443"))
    db_session.commit()

    scan = scanner_mod.run_scan_job(db_session)
    assert scan.status == "success"
    d = db_session.query(Device).filter_by(mac="aa:bb:cc:dd:ee:05").one()
    assert d.latency_ms == 12.5
    assert any(p["port"] == 80 for p in (d.open_ports or []))
    assert d.security_score is not None
```

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_scanner_hygiene.py -v
```

- [ ] **Step 3: Implement in `run_scan_job` after host results built / after apply_scan_results**

Order:
1. Existing ping+arp+dns → `found` HostResults
2. `apply_scan_results(db, found)`
3. For each found host: if IP, `probe_host_ports` + `ping_detail` (count=1); load Device by mac; `merge_open_ports`; detect port open/close vs previous; log events; set latency_ms, ports_scanned_at, security_score
4. Commit as today

Keep failure isolation: try/except per host for probe/ping.

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_scanner_hygiene.py tests/test_scanner_parse.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/scanner.py backend/app/services/device_diff.py backend/tests/test_scanner_hygiene.py
git commit -m "feat(hygiene): quick ports and latency in scan job"
```

---

### Task 6: Settings `quick_ports` + Planner MAC lowercase

**Files:**
- Modify: `backend/app/services/auth.py` (`DEFAULT_SETTINGS`)
- Modify: `backend/app/schemas/settings.py`
- Modify: `backend/app/api/settings.py`
- Modify: `backend/app/services/planner.py` (`normalize_mac` → lowercase)
- Modify: `backend/tests/test_planner_api.py` (assert lowercase)
- Modify: `backend/tests/test_notifications_settings_api.py` if it asserts settings shape

**Interfaces:**
- Produces: settings GET/PUT include `quick_ports: str`
- Default: `"22,80,443,445,3389,8080,8443"`
- `normalize_mac` returns lowercase (same as device_diff)

- [ ] **Step 1: Failing test settings field**

```python
def test_settings_include_quick_ports(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert "quick_ports" in r.json()
```

Update planner test expectation: already expects `"AA:BB:..."` → change to `"aa:bb:..."`.

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_notifications_settings_api.py tests/test_planner_api.py -v
```

- [ ] **Step 3: Implement schema + DEFAULT + API + planner lowercase**

In `planner.normalize_mac` use `.lower()` not `.upper()`. On `ensure_plan` or slot serialize path, optionally normalize existing uppercase `device_mac` in DB when loading (write-back lowercase if different).

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_notifications_settings_api.py tests/test_planner_api.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/services/auth.py backend/app/schemas/settings.py backend/app/api/settings.py backend/app/services/planner.py backend/tests
git commit -m "feat(hygiene): quick_ports setting; MAC lowercase canon"
```

---

### Task 7: Devices API — fields, events, scan-ports, ping latency

**Files:**
- Modify: `backend/app/schemas/device.py`
- Modify: `backend/app/api/devices.py`
- Modify: `backend/tests/test_devices_api.py`

**Interfaces:**
- `DeviceOut` adds: `latency_ms`, `open_ports`, `ports_scanned_at`, `security_score`, `is_new: bool`, `score_breakdown: list[dict] | None = None` (include breakdown on detail GET only, or always — **always compute is_new; breakdown only on GET by id** to keep list light — implement `to_device_out(device, *, with_breakdown=False)`)
- `GET /api/devices/{id}/events` → `list[DeviceEventOut]` with `id, type, details, created_at`
- `POST /api/devices/{id}/scan-ports` → DeviceOut; uses `scan_ports` setting; scan lock shared with `scanner.is_scan_locked` / acquire same lock if exists
- `POST .../ping` persists `device.latency_ms = result.rtt_ms` when ok

- [ ] **Step 1: Failing API tests**

```python
def test_device_out_has_hygiene_fields(client, db_session):
    # create device via scan or direct insert
    ...
    r = client.get(f"/api/devices/{device_id}")
    body = r.json()
    assert "latency_ms" in body
    assert "security_score" in body
    assert "is_new" in body
    assert "score_breakdown" in body

def test_device_events_endpoint(client, db_session):
    ...
    r = client.get(f"/api/devices/{device_id}/events")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_ping_persists_latency(client, db_session, monkeypatch):
    ...
```

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_devices_api.py -v
```

- [ ] **Step 3: Implement schemas + routes**

For scan-ports: if `is_scan_locked()` raise 409; else set lock, probe, merge, events, score, unlock.

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_devices_api.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/schemas/device.py backend/app/api/devices.py backend/tests/test_devices_api.py
git commit -m "feat(hygiene): device API events, ports scan, latency persist"
```

---

### Task 8: Hygiene API

**Files:**
- Create: `backend/app/schemas/hygiene.py`
- Create: `backend/app/api/hygiene.py`
- Create: `backend/app/services/hygiene.py` (seed checklist + assemble summary)
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_hygiene_api.py`

**Interfaces:**
- `ensure_checklist(db) -> list[HygieneChecklistItem]` — seed 7 items if table empty (keys from spec)
- `GET /api/hygiene` →  
  `{ network_score, counts: {online, offline, new_24h, risky_devices}, top_risks: [{device_id, mac, name, security_score, ip}], recent_events: [{id, device_id, type, details, created_at}] }`
- `GET /api/hygiene/checklist`
- `PATCH /api/hygiene/checklist/{id}` body `{checked: bool}`
- `POST /api/hygiene/scan-ports` — full scan all online; 409 if locked

Risky device: `security_score is not None and security_score < 50` OR any open port in RISKY_PORTS.

- [ ] **Step 1: Failing tests**

```python
def test_hygiene_summary_and_checklist_seed(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    r = client.get("/api/hygiene")
    assert r.status_code == 200
    data = r.json()
    assert "network_score" in data
    assert "counts" in data
    r = client.get("/api/hygiene/checklist")
    assert r.status_code == 200
    assert len(r.json()) >= 7

def test_checklist_toggle(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    items = client.get("/api/hygiene/checklist").json()
    item_id = items[0]["id"]
    r = client.patch(f"/api/hygiene/checklist/{item_id}", json={"checked": True})
    assert r.status_code == 200
    assert r.json()["checked"] is True
```

- [ ] **Step 2: Run — FAIL**

```powershell
pytest tests/test_hygiene_api.py -v
```

- [ ] **Step 3: Implement service + router + include_router**

```python
# main.py
from app.api import hygiene as hygiene_router
app.include_router(hygiene_router.router)
```

Router prefix: `/api/hygiene`.

- [ ] **Step 4: Run — PASS**

```powershell
pytest tests/test_hygiene_api.py -v
```

- [ ] **Step 5: Commit**

```powershell
git add backend/app/schemas/hygiene.py backend/app/api/hygiene.py backend/app/services/hygiene.py backend/app/main.py backend/tests/test_hygiene_api.py
git commit -m "feat(hygiene): hygiene API summary and checklist"
```

---

### Task 9: Frontend types + Sidebar + route shell

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/icons.tsx` (IconHygiene — shield)
- Modify: `frontend/src/components/layout/Sidebar.tsx` — item after Devices
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/Hygiene.tsx` (minimal load + title)

**Interfaces:**
- TS `Device` + hygiene fields; `DeviceEvent`; `HygieneSummary`; `ChecklistItem`; `Settings.quick_ports`

- [ ] **Step 1: Add types**

```typescript
// extend Device
latency_ms?: number | null;
open_ports?: { port: number; service?: string | null; source?: string }[] | null;
ports_scanned_at?: string | null;
security_score?: number | null;
is_new?: boolean;
score_breakdown?: { code: string; label: string; delta: number }[] | null;

export interface DeviceEvent {
  id: number;
  type: string;
  details: Record<string, unknown> | null;
  created_at: string;
  device_id?: number | null;
}

export interface HygieneSummary {
  network_score: number | null;
  counts: { online: number; offline: number; new_24h: number; risky_devices: number };
  top_risks: { device_id: number; mac: string; name: string | null; security_score: number | null; ip: string | null }[];
  recent_events: DeviceEvent[];
}

export interface ChecklistItem {
  id: number;
  key: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  sort_order: number;
}
```

- [ ] **Step 2: Icon + nav + route**

```tsx
// App.tsx
<Route path="hygiene" element={<Hygiene />} />
// Sidebar after Devices:
{ to: "/hygiene", label: "Hygiene", Icon: IconHygiene },
```

- [ ] **Step 3: Minimal Hygiene page**

```tsx
// load GET /api/hygiene + checklist; show network_score or empty state
```

- [ ] **Step 4: Manual smoke** — `npm run build` in frontend

```powershell
cd C:\Users\eGoR\netscantools\frontend
npm run build
```

Expected: success

- [ ] **Step 5: Commit**

```powershell
git add frontend/src
git commit -m "feat(hygiene): route, nav, types, page shell"
```

---

### Task 10: Devices list + DeviceDetail enrich

**Files:**
- Modify: `frontend/src/pages/Devices.tsx`
- Modify: `frontend/src/pages/DeviceDetail.tsx`

**UI requirements:**
- List: show latency (ms), port count, score with color (≥80 green / 50–79 amber / &lt;50 red), NEW badge if `is_new`, risk hint if any port in risky set (hardcode same ports as backend in a small `lib/hygiene.ts`).
- Detail: ports table; score + breakdown; timeline from `GET /events`; buttons Ping (existing) + Scan ports (`POST .../scan-ports`).

- [ ] **Step 1: Add `frontend/src/lib/hygiene.ts`**

```typescript
export const RISKY_PORTS = new Set([21, 23, 135, 139, 445, 3389, 5900]);
export function scoreClass(score: number | null | undefined): string { ... }
```

- [ ] **Step 2: Wire Devices.tsx meta chips**

- [ ] **Step 3: Wire DeviceDetail sections**

- [ ] **Step 4: `npm run build`**

- [ ] **Step 5: Commit**

```powershell
git add frontend/src
git commit -m "feat(hygiene): devices list and detail score ports timeline"
```

---

### Task 11: Hygiene page full UI + Settings quick_ports

**Files:**
- Modify: `frontend/src/pages/Hygiene.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/types/index.ts` (Settings)

**Hygiene layout:**
1. Network score large + empty if null  
2. Stat cards: online / new_24h / risky / offline  
3. Top risks → Link to `/devices/:id`  
4. Recent events list  
5. Checklist with checkboxes → PATCH; show % done  
6. Button “Scan ports (all online)” → POST `/api/hygiene/scan-ports`

**Settings:** two fields — Quick ports (label: after each scan) and Full ports (manual deep).

- [ ] **Step 1: Implement Hygiene full page**

- [ ] **Step 2: Settings form fields for quick_ports** (PUT already sends full settings body — include new field)

- [ ] **Step 3: `npm run build`**

- [ ] **Step 4: Run backend test suite**

```powershell
cd C:\Users\eGoR\netscantools\backend
pytest -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```powershell
git add frontend/src
git commit -m "feat(hygiene): Hygiene dashboard UI and settings quick_ports"
```

---

### Task 12: Changelog + product docs

**Files:**
- Modify: `docs/changelog.md` — section `## [0.8.0] — 2026-08-12`
- Modify: `docs/README.md` — capabilities bullet for Hygiene; roadmap check if needed

- [ ] **Step 1: Write changelog**

```markdown
## [0.8.0] — 2026-08-12

### Added
- Hygiene page: network score, risk cards, checklist, recent events
- Device latency, open ports (quick after scan / full on demand), security score
- DeviceEvent timeline; GET `/api/devices/{id}/events`
- Settings `quick_ports` for automatic light port probe

### Changed
- `scan_ports` is manual deep scan only (not every network scan)
- Planner MAC storage normalized to lowercase (canon shared with Devices)

### Fixed
- (none required)
```

- [ ] **Step 2: Update docs/README.md capabilities**

- [ ] **Step 3: Commit**

```powershell
git add docs/changelog.md docs/README.md
git commit -m "docs: Hygiene 0.8.0 changelog and README"
```

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| Device columns | T1 |
| DeviceEvent + mapping | T4, T7 |
| Checklist model + seed | T1, T8 |
| Scoring | T2, T4–T5 |
| Port probe + scoped merge | T3, T5, T7–T8 |
| Scan pipeline quick + latency | T5 |
| Settings quick_ports | T6, T11 |
| Devices API | T7 |
| Hygiene API | T8 |
| UI Devices/Detail/Hygiene/Settings | T9–T11 |
| MAC lowercase | T6 |
| No rogue/scapy | Global (not implemented) |
| Changelog | T12 |

## Self-review notes

- No TBD steps; merge policy locked to scoped merge in T3.
- Notification mapping implemented only in `device_events.notification_type_for_event`.
- Planner uppercase regression covered by T6 test change.
- Frontend risky ports list duplicated intentionally for display — keep in sync with `scoring.RISKY_PORTS`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-lan-hygiene.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans, batch + checkpoints  

Which approach?
