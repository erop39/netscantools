# Network Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar **Planner** tab with a singleton network plan: ordered slots (planned IP, role, optional MAC bind), per-slot ports (port + label), live vs planned comparison, and JSON export/import replace.

**Architecture:** Normalized SQLite tables (`network_plans`, `plan_slots`, `plan_ports`) + FastAPI router `/api/planner` (ensure-on-read singleton). Frontend React page `/planner` loads plan, CRUD slots/ports, reorder via up/down, export download + import file with confirm. Live fields enriched by joining `devices` on normalized MAC. No DHCP apply.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, pytest, React + Vite + Tailwind, Classic glass UI, JWT cookie auth.

**Spec:** `docs/superpowers/specs/2026-08-11-network-planner-design.md`

## Global Constraints

- Classic glass UI only (no Ops skin)
- Single-user local app; JWT cookie auth like other routes
- One plan per installation (singleton)
- Link inventory by MAC only; never mutate `Device.ip` from planner
- Import always **replace** entire plan after confirm
- Ports: integer 1–65535 + free-text label only (no app presets in MVP)
- YAGNI: no multi-plan, no canvas map, no router DHCP APIs
- Follow existing patterns: `app/models/*`, `app/api/*`, `tests/conftest.py` client fixture, `frontend/src/pages/*`, `Sidebar` navItems

## File map

| Path | Responsibility |
|------|----------------|
| `backend/app/models/plan.py` | SQLAlchemy models NetworkPlan, PlanSlot, PlanPort |
| `backend/app/models/__init__.py` | Register models |
| `backend/app/schemas/planner.py` | Pydantic request/response + import schema |
| `backend/app/services/planner.py` | ensure_plan, normalize_mac, ip_in_cidr, serialize with live, import replace |
| `backend/app/api/planner.py` | HTTP routes |
| `backend/app/main.py` | include_router |
| `backend/tests/test_planner_api.py` | API tests |
| `frontend/src/types/index.ts` | Planner TypeScript types |
| `frontend/src/pages/Planner.tsx` | Page UI |
| `frontend/src/components/layout/Sidebar.tsx` | Nav item |
| `frontend/src/components/icons.tsx` | IconPlanner |
| `frontend/src/App.tsx` | Route |
| `frontend/src/index.css` | Planner layout classes (minimal) |
| `docs/changelog.md` | Release notes |
| `docs/README.md` | Feature bullet |

---

### Task 1: Models + schemas + ensure_plan service

**Files:**
- Create: `backend/app/models/plan.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/planner.py`
- Create: `backend/app/services/planner.py`
- Test: `backend/tests/test_planner_api.py` (start with ensure + empty get)

**Interfaces:**
- Produces: `NetworkPlan`, `PlanSlot`, `PlanPort` models
- Produces: `ensure_plan(db) -> NetworkPlan`
- Produces: `normalize_mac(mac: str | None) -> str | None`
- Produces: `ip_in_cidr(ip: str, cidr: str) -> bool`
- Produces: Pydantic `PlanOut`, `SlotOut`, `PortOut`, create/update bodies

- [ ] **Step 1: Write failing test — ensure plan on GET**

```python
# backend/tests/test_planner_api.py
def _login(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200

def test_get_planner_ensures_singleton(client):
    _login(client)
    r = client.get("/api/planner")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Home LAN"
    assert "slots" in data
    assert data["slots"] == []
    r2 = client.get("/api/planner")
    assert r2.json()["id"] == data["id"]
```

- [ ] **Step 2: Run test — expect fail (no route)**

```bash
cd backend
.\.venv\Scripts\Activate.ps1
pytest tests/test_planner_api.py::test_get_planner_ensures_singleton -v
```

Expected: FAIL (404 or import error)

- [ ] **Step 3: Implement models**

```python
# backend/app/models/plan.py
from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class NetworkPlan(Base):
    __tablename__ = "network_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), default="Home LAN")
    cidr: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    slots: Mapped[list["PlanSlot"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanSlot.sort_order"
    )

class PlanSlot(Base):
    __tablename__ = "plan_slots"
    __table_args__ = (
        UniqueConstraint("plan_id", "planned_ip", name="uq_plan_slot_ip"),
        UniqueConstraint("plan_id", "device_mac", name="uq_plan_slot_mac"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("network_plans.id", ondelete="CASCADE"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    planned_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    hostname_hint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    device_mac: Mapped[str | None] = mapped_column(String(17), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped["NetworkPlan"] = relationship(back_populates="slots")
    ports: Mapped[list["PlanPort"]] = relationship(
        back_populates="slot", cascade="all, delete-orphan", order_by="PlanPort.sort_order"
    )

class PlanPort(Base):
    __tablename__ = "plan_ports"
    __table_args__ = (UniqueConstraint("slot_id", "port", name="uq_plan_port"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("plan_slots.id", ondelete="CASCADE"))
    port: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(128), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    slot: Mapped["PlanSlot"] = relationship(back_populates="ports")
```

Note: SQLite unique constraints with NULL — multiple NULL `planned_ip` / `device_mac` may be allowed by SQLite; enforce uniqueness in service when non-null.

- [ ] **Step 4: Register models in `__init__.py`**

```python
from app.models.plan import NetworkPlan, PlanPort, PlanSlot
# add to __all__
```

- [ ] **Step 5: Schemas + service helpers**

Implement in `schemas/planner.py`:
- `PortOut`, `SlotOut` (with live_ip, live_status, device_id, match: match|mismatch|linked-no-ip|reserve)
- `PlanOut`
- `PlanUpdate`, `SlotCreate`, `SlotUpdate`, `PortCreate`, `PortUpdate`
- `ReorderBody` with `slot_ids: list[int]`
- `PlanImport` matching export JSON

Implement in `services/planner.py`:
- `normalize_mac` — strip, upper, allow `AA:BB:…` or `AA-BB-…` → colon form; invalid → ValueError
- `ip_in_cidr` using `ipaddress` module
- `ensure_plan(db)` — if no NetworkPlan: create with name Home LAN, cidr from Setting key `scan_subnet` if present
- `plan_to_out(db, plan) -> PlanOut` — join devices by mac for live fields

- [ ] **Step 6: Minimal GET route so test passes**

```python
# backend/app/api/planner.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.schemas.planner import PlanOut
from app.services import planner as svc

router = APIRouter(prefix="/api/planner", tags=["planner"])

@router.get("", response_model=PlanOut)
def get_plan(db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = svc.ensure_plan(db)
    return svc.plan_to_out(db, plan)
```

Wire in `main.py`: `app.include_router(planner_router.router)`

- [ ] **Step 7: Run test — expect pass**

```bash
pytest tests/test_planner_api.py::test_get_planner_ensures_singleton -v
```

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/plan.py backend/app/models/__init__.py backend/app/schemas/planner.py backend/app/services/planner.py backend/app/api/planner.py backend/app/main.py backend/tests/test_planner_api.py
git commit -m "feat(planner): models, ensure plan, GET /api/planner"
```

---

### Task 2: Slot and port CRUD + reorder + validation

**Files:**
- Modify: `backend/app/api/planner.py`
- Modify: `backend/app/services/planner.py`
- Modify: `backend/tests/test_planner_api.py`

**Interfaces:**
- Consumes: Task 1 models/schemas/ensure_plan
- Produces: full CRUD endpoints as in spec §7

- [ ] **Step 1: Failing tests**

```python
def test_create_slot_and_port(client, db_session):
    _login(client)
    # seed device
    from app.models.device import Device
    db_session.add(Device(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.50", status="online"))
    db_session.commit()

    r = client.put("/api/planner", json={"name": "Home", "cidr": "192.168.1.0/24", "notes": None})
    assert r.status_code == 200

    r = client.post("/api/planner/slots", json={
        "planned_ip": "192.168.1.10",
        "role_label": "NAS",
        "device_mac": "aa:bb:cc:dd:ee:01",
    })
    assert r.status_code == 200
    slot = r.json()
    assert slot["device_mac"] == "AA:BB:CC:DD:EE:01"
    assert slot["live_ip"] == "192.168.1.50"
    assert slot["match"] == "mismatch"

    r = client.post(f"/api/planner/slots/{slot['id']}/ports", json={"port": 445, "label": "SMB"})
    assert r.status_code == 200
    assert r.json()["port"] == 445

def test_duplicate_ip_conflict(client):
    _login(client)
    client.put("/api/planner", json={"name": "H", "cidr": "192.168.1.0/24", "notes": None})
    client.post("/api/planner/slots", json={"planned_ip": "192.168.1.10"})
    r = client.post("/api/planner/slots", json={"planned_ip": "192.168.1.10"})
    assert r.status_code == 409

def test_ip_outside_cidr(client):
    _login(client)
    client.put("/api/planner", json={"name": "H", "cidr": "192.168.1.0/24", "notes": None})
    r = client.post("/api/planner/slots", json={"planned_ip": "10.0.0.1"})
    assert r.status_code == 400

def test_reorder_slots(client):
    _login(client)
    a = client.post("/api/planner/slots", json={"role_label": "A"}).json()
    b = client.post("/api/planner/slots", json={"role_label": "B"}).json()
    r = client.put("/api/planner/slots/reorder", json={"slot_ids": [b["id"], a["id"]]})
    assert r.status_code == 200
    slots = client.get("/api/planner").json()["slots"]
    assert [s["id"] for s in slots] == [b["id"], a["id"]]
```

- [ ] **Step 2: Run tests — expect fail**

```bash
pytest tests/test_planner_api.py -v
```

- [ ] **Step 3: Implement service validation**

In `services/planner.py`:

```python
def assert_slot_unique(db, plan_id, planned_ip, device_mac, exclude_slot_id=None):
    # query conflicts → raise HTTPException 409

def validate_planned_ip(plan, planned_ip: str | None):
    if planned_ip and plan.cidr and not ip_in_cidr(planned_ip, plan.cidr):
        raise HTTPException(400, detail="planned_ip outside plan.cidr")
```

- [ ] **Step 4: Implement routes**

- `PUT /api/planner` — update name/cidr/notes  
- `POST /api/planner/slots` — append `sort_order = max+1`  
- `PATCH /api/planner/slots/{id}`  
- `DELETE /api/planner/slots/{id}` then renumber sort_order 0..n  
- `PUT /api/planner/slots/reorder` — verify same set of ids as plan slots  
- `POST /api/planner/slots/{id}/ports`  
- `PATCH /api/planner/ports/{id}`  
- `DELETE /api/planner/ports/{id}`  

Use `HTTPException` 404 if missing.

- [ ] **Step 5: Run tests — pass**

```bash
pytest tests/test_planner_api.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/planner.py backend/app/services/planner.py backend/tests/test_planner_api.py
git commit -m "feat(planner): slot/port CRUD, reorder, validation"
```

---

### Task 3: Export, import, candidates

**Files:**
- Modify: `backend/app/api/planner.py`, `backend/app/services/planner.py`, `backend/app/schemas/planner.py`
- Modify: `backend/tests/test_planner_api.py`

- [ ] **Step 1: Failing tests**

```python
def test_export_import_roundtrip(client, db_session):
    _login(client)
    client.put("/api/planner", json={"name": "Lab", "cidr": "192.168.0.0/24", "notes": "x"})
    s = client.post("/api/planner/slots", json={"planned_ip": "192.168.0.5", "role_label": "PC"}).json()
    client.post(f"/api/planner/slots/{s['id']}/ports", json={"port": 22, "label": "SSH"})
    exp = client.get("/api/planner/export")
    assert exp.status_code == 200
    body = exp.json()
    assert body["format"] == "netscantools.network_plan"
    assert body["version"] == 1
    assert len(body["slots"]) == 1

    client.post("/api/planner/slots", json={"role_label": "temp"})
    imp = client.post("/api/planner/import", json=body)
    assert imp.status_code == 200
    plan = client.get("/api/planner").json()
    assert plan["name"] == "Lab"
    assert len(plan["slots"]) == 1
    assert plan["slots"][0]["ports"][0]["port"] == 22

def test_import_bad_format(client):
    _login(client)
    r = client.post("/api/planner/import", json={"format": "nope", "version": 1, "plan": {}, "slots": []})
    assert r.status_code == 400

def test_candidates_excludes_bound_mac(client, db_session):
    _login(client)
    from app.models.device import Device
    db_session.add(Device(mac="AA:BB:CC:DD:EE:01", ip="192.168.1.1", status="online"))
    db_session.add(Device(mac="AA:BB:CC:DD:EE:02", ip="192.168.1.2", status="online"))
    db_session.commit()
    client.post("/api/planner/slots", json={"device_mac": "AA:BB:CC:DD:EE:01"})
    r = client.get("/api/planner/candidates")
    assert r.status_code == 200
    macs = {c["mac"] for c in r.json()}
    assert "AA:BB:CC:DD:EE:02" in macs
    assert "AA:BB:CC:DD:EE:01" not in macs
```

- [ ] **Step 2: Implement export**

```python
@router.get("/export")
def export_plan(...):
    plan = ensure_plan(db)
    payload = build_export_dict(plan)  # no live fields
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="network-plan.json"'},
    )
```

- [ ] **Step 3: Implement import replace**

```python
def import_plan_replace(db, data: dict) -> NetworkPlan:
    if data.get("format") != "netscantools.network_plan" or data.get("version") != 1:
        raise HTTPException(400, detail="Unsupported plan format")
    # validate slots/ports
    plan = ensure_plan(db)
    # delete all slots (cascade ports)
    for slot in list(plan.slots):
        db.delete(slot)
    db.flush()
    plan.name = data["plan"].get("name") or "Home LAN"
    plan.cidr = data["plan"].get("cidr")
    plan.notes = data["plan"].get("notes")
    for i, s in enumerate(sorted(data["slots"], key=lambda x: x.get("sort_order", i))):
        # create PlanSlot + PlanPort
    db.commit()
    return plan
```

- [ ] **Step 4: GET `/api/planner/candidates`**

Return list `{ id, mac, ip, name, hostname, status }` for devices whose normalized MAC not in any slot of the plan.

- [ ] **Step 5: Tests pass + commit**

```bash
pytest tests/test_planner_api.py -v
git add backend/
git commit -m "feat(planner): export/import replace and candidates"
```

---

### Task 4: Frontend types, route, sidebar

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/icons.tsx` — add `IconPlanner`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/Planner.tsx` (stub load)

**Interfaces:**
- Produces: `Plan`, `PlanSlot`, `PlanPort`, `PlanCandidate` types matching API
- Route `/planner` behind ProtectedRoute + AppShell

- [ ] **Step 1: Types**

```typescript
export type PlanMatch = "match" | "mismatch" | "linked-no-ip" | "reserve";

export interface PlanPort {
  id: number;
  port: number;
  label: string;
  sort_order: number;
}

export interface PlanSlot {
  id: number;
  sort_order: number;
  planned_ip: string | null;
  hostname_hint: string | null;
  role_label: string | null;
  device_mac: string | null;
  notes: string | null;
  live_ip: string | null;
  live_status: string | null;
  device_id: number | null;
  match: PlanMatch;
  ports: PlanPort[];
}

export interface NetworkPlan {
  id: number;
  name: string;
  cidr: string | null;
  notes: string | null;
  updated_at: string | null;
  slots: PlanSlot[];
}

export interface PlanCandidate {
  id: number;
  mac: string;
  ip: string | null;
  name: string | null;
  hostname: string | null;
  status: string;
}
```

- [ ] **Step 2: IconPlanner** — simple grid/map SVG (stroke 1.75, 24 viewBox) in `icons.tsx`

- [ ] **Step 3: Sidebar** — insert after Devices:

```typescript
{ to: "/planner", label: "Planner", Icon: IconPlanner },
```

- [ ] **Step 4: App.tsx route**

```tsx
import { Planner } from "./pages/Planner";
// ...
<Route path="planner" element={<Planner />} />
```

- [ ] **Step 5: Stub Planner page**

```tsx
export function Planner() {
  const [plan, setPlan] = useState<NetworkPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        setPlan(await apiFetch<NetworkPlan>("/api/planner"));
      } catch (e) {
        setError("Failed to load plan");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return (
    <div>
      <PageHeader title="Planner" description="Desired LAN layout — IPs, order, ports" />
      {loading && <LoadingState />}
      {error && <ErrorBanner message={error} />}
      {plan && <p className="text-white/60 text-sm">{plan.name} · {plan.cidr ?? "no cidr"} · {plan.slots.length} slots</p>}
    </div>
  );
}
```

- [ ] **Step 6: `npm run build` passes**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(planner): route, sidebar, types, stub page"
```

---

### Task 5: Planner UI — full CRUD

**Files:**
- Modify: `frontend/src/pages/Planner.tsx` (full page)
- Modify: `frontend/src/index.css` (`.planner-*` classes)

**UI checklist (from spec §8):**
- Edit plan name/cidr (save via PUT)
- List slots ordered with ↑↓ reorder
- Add empty reserve / add from inventory (candidates modal or inline DarkSelect)
- Edit slot: planned_ip, role_label, hostname_hint, notes, bind/unbind MAC
- Ports: list chips, add port+label, delete
- Match badge colors: match green, mismatch amber, reserve slate, linked-no-ip muted
- Export: `window.open` or fetch blob download of `/api/planner/export` (with credentials)
- Import: file input → confirm → POST JSON body
- Empty state

- [ ] **Step 1: Implement load + refresh helper**

```typescript
async function refresh() {
  setPlan(await apiFetch<NetworkPlan>("/api/planner"));
}
```

- [ ] **Step 2: Plan meta form**

Inline inputs name + cidr + Save button → `PUT /api/planner`.

- [ ] **Step 3: Slot list**

Map `plan.slots` to glass rows. Each row:
- Up/down buttons → `PUT /api/planner/slots/reorder` with reordered ids
- Fields + PATCH on blur or Save
- Delete with confirm
- Badge from `slot.match`

- [ ] **Step 4: Add slot**

- "Add reserve" → `POST { }` or with planned_ip prompt  
- "From inventory" → load candidates, pick device → `POST { device_mac }`

- [ ] **Step 5: Ports UI**

Under expanded slot: list ports; form number + label; DELETE.

- [ ] **Step 6: Export / Import**

```typescript
async function onExport() {
  const data = await apiFetch<unknown>("/api/planner/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "network-plan.json";
  a.click();
}

async function onImport(file: File) {
  if (!confirm("Replace entire plan with this file?")) return;
  const text = await file.text();
  const json = JSON.parse(text);
  await apiFetch("/api/planner/import", { method: "POST", body: JSON.stringify(json) });
  await refresh();
}
```

- [ ] **Step 7: Manual smoke**

```bash
# backend uvicorn + frontend dev
# Login → Planner → add slots → ports → export → import
```

- [ ] **Step 8: Build + commit**

```bash
cd frontend && npm run build
git add frontend/
git commit -m "feat(planner): full Planner page CRUD export/import"
```

---

### Task 6: Docs + changelog

**Files:**
- Modify: `docs/changelog.md`
- Modify: `docs/README.md` (sections list + feature bullet)

- [ ] **Step 1: Changelog under Unreleased or 0.7.0**

```markdown
## [0.7.0] — 2026-08-11

### Added

- **Planner** tab: singleton network plan, ordered slots (planned IP, MAC bind, reserves),
  ports (port + label), live vs planned, JSON export/import replace
```

- [ ] **Step 2: README** — add Planner to capabilities and sections list

- [ ] **Step 3: Commit + push**

```bash
git add docs/changelog.md docs/README.md
git commit -m "docs: Planner feature in changelog and README"
git push origin feat/netinventory-mvp
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Singleton plan ensure | 1 |
| Slots ordered + reserves + MAC | 2 |
| Ports port+label | 2 |
| Live vs planned | 1–2 (plan_to_out) |
| Reorder | 2 |
| Export/import replace | 3 |
| Candidates | 3 |
| Sidebar + route + UI | 4–5 |
| Classic glass | 5 (reuse components) |
| No DHCP apply | N/A (not implemented) |
| Tests | 1–3 |
| Docs | 6 |

## Placeholder scan

No TBD/TODO left in task steps.

## Type consistency

- API JSON uses snake_case (`planned_ip`, `device_mac`, `sort_order`) matching existing API style  
- Frontend types mirror that  
- Match enum: `match | mismatch | linked-no-ip | reserve`

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-network-planner.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, task-by-task with checkpoints  

Which approach?
