# LAN Hygiene Dashboard — Design Spec

**Product:** netscantools (eG::39)  
**Date:** 2026-08-12  
**Status:** Approved for planning (brainstorming complete)  
**Source plan:** `E:\ai results\implementation-plan.md` (adapted to real codebase)  
**Approach:** Events-first hygiene (no rogue DHCP / IP-conflict in v1)

---

## 1. Problem

The app already discovers hosts (ping + ARP), tracks online/offline, and notifies on new MAC / IP change. It does **not** yet give a home-LAN hygiene picture: how healthy each device looks (open ports, latency, risk score), a durable timeline of changes, or a single place to review network risk and a personal security checklist.

## 2. Goals

1. Persist **latency** and **open ports** on devices (quick probe after scan; full list on demand).
2. **DeviceEvent** timeline per device (and recent network-wide feed).
3. **Security score** per device (0–100) and **network score** aggregate.
4. Sidebar page **Hygiene**: network score, risk cards, recent events, manual checklist.
5. Enrich **Devices** list and **DeviceDetail** (score, ports, NEW badge, timeline).
6. Windows-first implementation (no scapy / Docker NET_RAW requirement in v1).

## 3. Non-goals (v1)

- Rogue DHCP / DNS probing  
- ARP IP-conflict detection  
- scapy, Npcap mandate, Docker `NET_ADMIN` / `NET_RAW`  
- Inventory journal (separate roadmap item)  
- Applying config to the router  
- Merging **Planner ports** (planned labels) with **open_ports** (observed) — different concepts  
- Latency history time-series (only last RTT on Device)  
- `came_online` / `score_changed` notification spam  

## 4. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Product slice | Home hygiene (option A) |
| UI surface | Devices + DeviceDetail + **Hygiene** page (option B) |
| Port scanning | Quick ports after each network scan; full Settings ports on demand (option D) |
| Port merge | **Scoped merge** for quick and full — only claim truth about scanned ports (§6.1) |
| Score + checklist | Device + network score; checklist separate, not hard-bound to score (option D) |
| Architecture | Events-first: `DeviceEvent` + scoring service + `/api/hygiene` |
| Port probe method | TCP connect (short timeout); nmap optional later |
| NEW badge | Computed: `first_seen` within window (default 24h); no extra column |
| Planner ports | Unchanged; do not write open_ports into plan |
| MAC storage | Project-wide **lowercase** `aa:bb:cc:dd:ee:ff` (Devices + Planner) |
| Event vs notification | Separate enums; map `went_offline` → notification `device_offline` (§5.2.1) |

---

## 5. Data model

### 5.1 `devices` (extensions)

| Column | Type | Notes |
|--------|------|--------|
| `latency_ms` | Float nullable | Last ICMP RTT |
| `open_ports` | JSON list | `[{ "port": int, "service": str \| null, "source": "quick" \| "full" }]` |
| `ports_scanned_at` | DateTime nullable | Last successful port probe (any kind) |
| `security_score` | Integer nullable | Cached 0–100; recompute on relevant changes |

**Existing fields reused** (as shipped in code; Doc 1 originally omitted post-MVP columns — Doc 1 updated):

| Field | Notes |
|-------|--------|
| `mac` | **Canonical lowercase** `aa:bb:cc:dd:ee:ff` (project-wide; same as Planner `device_mac`) |
| `ip`, `vendor`, `hostname` | discovery / OUI / reverse DNS |
| `name` | user-assigned label; never overwritten by scan/DNS (`Device.name` in code) |
| `type`, `icon` | user classification / UI |
| `status`, `last_seen`, `first_seen` | presence |

**Computed (API only, not stored):**

- `is_new`: `now - first_seen < new_device_hours` (default 24; constant or setting).

### 5.2 `device_events` (new)

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | |
| `device_id` | FK → devices, nullable | Null reserved for future network-level events; v1 always set |
| `type` | String(32) | **Event type** — see below; **not** always equal to `notification.type` |
| `details` | JSON nullable | e.g. `{ "old": "...", "new": "..." }` |
| `created_at` | DateTime TZ | |

**Event types (v1):**

| `device_events.type` | When |
|----------------------|------|
| `new_device` | First time MAC seen |
| `ip_changed` | IP differs from stored |
| `went_offline` | Was online, missing from scan |
| `came_online` | Was offline, seen again |
| `port_opened` | Port newly present in open set |
| `port_closed` | Port no longer present |

#### 5.2.1 Mapping `device_events.type` → `notification.type`

Two **independent** string enums. Events are the durable timeline; notifications are user-facing inbox rows. Always write the **event** first; create a **notification** only when the mapping says so.

| Event type | Notification created? | `notification.type` | Notes |
|------------|----------------------|---------------------|--------|
| `new_device` | Yes | `new_device` | Same string |
| `ip_changed` | Yes | `ip_changed` | Same string |
| `went_offline` | Yes | **`device_offline`** | **Different string** — keep legacy notification value for API/UI |
| `came_online` | No | — | Event only |
| `port_opened` | Only if `port ∈ RISKY_PORTS` | `port_opened` | `details` include port; non-risky open → event only |
| `port_closed` | No | — | Event only |

Implementers must not invent a `notification.type = went_offline` or `device_events.type = device_offline`. Helper recommended: `maybe_notify(event_type, details) → notification.type | None`.

### 5.3 `hygiene_checklist_items` (new)

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | |
| `key` | String unique | Stable seed key, e.g. `router_password` |
| `label` | String | User-visible |
| `checked` | Boolean | Default false |
| `checked_at` | DateTime nullable | Set when checked=true |
| `sort_order` | Integer | |

**Seed on empty table** (first API read or app startup):

1. `router_password` — Router admin password changed from default  
2. `guest_isolation` — Guest Wi‑Fi isolated from LAN  
3. `upnp_off` — UPnP disabled (or reviewed)  
4. `firmware_updated` — Router / AP firmware up to date  
5. `remote_admin_off` — WAN remote admin disabled  
6. `wifi_auth` — Wi‑Fi uses WPA2/WPA3 (not open/WEP)  
7. `unused_ports` — Unused forwarded ports closed  

Checklist **does not** modify device or network security score in v1.

### 5.4 Settings keys

| Key | Meaning | When used |
|-----|---------|-----------|
| `scan_ports` | Full / deep port list CSV | **Manual only** — `POST /api/devices/{id}/scan-ports`, `POST /api/hygiene/scan-ports` |
| `quick_ports` | Light port list CSV; default `22,80,443,445,3389,8080,8443` | **Automatic** after each network scan job |

This **supersedes** Doc 1’s implication that `scan_ports` runs on every scan. Doc 1 settings table now points here.

Optional constant (no setting unless needed): `NEW_DEVICE_HOURS = 24`.

---

## 6. Scan pipeline

Extend existing `run_scan_job` (same lock):

```
1. Ping sweep
2. ARP table parse
3. Reverse DNS (batch)
4. Quick port probe  — online hosts only, quick_ports, TCP connect
5. Latency sample    — one RTT per online host (reuse nettools ping)
6. apply_scan_results + DeviceEvent + score recompute
```

### 6.1 Port merge rules (scoped merge — same policy for quick and full)

**Decision (locked):** A probe only claims truth about ports it actually scanned. It never wipes ports outside its scan list.

Algorithm for both quick and full, given `scanned_ports: set[int]` and `open_now: set[int]` (ports that accepted connect):

1. Start from previous `open_ports` list (or `[]`).
2. For each `p` in `scanned_ports`:
   - if `p ∈ open_now` → upsert entry `{ port: p, service, source }` where `source` is `quick` or `full`
   - if `p ∉ open_now` → **remove** `p` from stored open_ports (closed among probed)
3. Ports **not** in `scanned_ports` → **leave unchanged** (preserves prior quick/full discoveries outside this probe list).

| Probe | `scanned_ports` source | `source` tag on upserts |
|-------|------------------------|-------------------------|
| Quick (auto after network scan) | Settings `quick_ports` | `quick` |
| Full (manual endpoint) | Settings `scan_ports` | `full` |

**Not chosen:** “full = authoritative snapshot of entire host” (would delete open ports found only by quick if they are outside `scan_ports`). If we ever want that mode, it needs an explicit API flag — out of v1.

**Examples**

- Had `{80:full, 22:quick}`; quick scans `{22,80,443}`, only 80 open → result `{80:quick}` (22 removed as closed in quick set; no other full-only ports).  
- Had `{445:quick, 8443:full}`; full scans `{80,443,8080}` all closed → still keeps `{445:quick, 8443:full}` because 445/8443 were not in the full list.

### 6.2 Failure isolation

- Port probe or latency failure for one host must not abort the whole scan.
- If the probe **errors** (timeout infrastructure, exception) for a host → **do not change** that host’s `open_ports`.
- If the probe **succeeds** and all scanned ports are closed → apply removals for those scanned ports only (step 2 above).

### 6.3 Full port scan (on demand)

- `POST /api/devices/{id}/scan-ports` — Settings `scan_ports`, scoped merge §6.1
- `POST /api/hygiene/scan-ports` — all online devices; uses same scan lock; **409** if busy

Manual **Ping** already exists: also **persist** `latency_ms` (score does not use latency).

---

## 7. Scoring

### 7.1 Device score

Start at **100**, apply penalties, clamp to **0–100**. Higher = healthier.

| Condition | Penalty |
|-----------|---------|
| Any open port in RISKY_PORTS | −20 once, then −5 per additional distinct risky port (cap −35 total for risky) |
| Count of open ports excluding 80 and 443 is &gt; 8 | −10 |
| No `vendor` | −5 |
| No `hostname` and no `name` | −5 |
| Offline or `last_seen` older than 7 days | −15 |
| `is_new` (within new window) | −5 |

**RISKY_PORTS (v1):** `{21, 23, 135, 139, 445, 3389, 5900}`.

**Not in score:** checklist, latency, notes, planner data.

Recompute when: scan apply, full port scan, ping (no-op for score), device fields that affect penalties (rare).

API detail may include `score_breakdown`: list of `{ "code", "label", "delta" }` for UI.

### 7.2 Network score

- Mean of `security_score` over devices with `status == online`.
- If no online devices → `network_score = null` (empty state on Hygiene).

Summary counts (not formula): `online`, `offline`, `new_24h`, `risky_devices` (score &lt; 50 or any risky open port).

---

## 8. API

### 8.1 Devices (extend)

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/devices`, `/api/devices/{id}` | + latency_ms, open_ports, ports_scanned_at, security_score, is_new; detail + score_breakdown |
| POST | `/api/devices/{id}/ping` | Persist latency_ms |
| POST | `/api/devices/{id}/scan-ports` | Full port scan |
| GET | `/api/devices/{id}/events` | Timeline, `limit` default 50 |

### 8.2 Hygiene (new router `/api/hygiene`)

| Method | Path | Response / behavior |
|--------|------|---------------------|
| GET | `/api/hygiene` | network_score, counts, top_risks[], recent_events[] |
| GET | `/api/hygiene/checklist` | items ordered |
| PATCH | `/api/hygiene/checklist/{id}` | `{ "checked": bool }` |
| PUT | `/api/hygiene/checklist` | bulk replace checked states (optional; PATCH sufficient for v1) |
| POST | `/api/hygiene/scan-ports` | Full scan all online; 409 if lock busy |

Auth: same JWT cookie as rest of API.

### 8.3 Settings

- Expose `quick_ports` on GET/PUT settings with same CSV validation as `scan_ports`.

---

## 9. UI

### 9.1 Navigation

- New sidebar item **Hygiene** after **Devices** (shield / heart-pulse icon).

### 9.2 Devices list

- Show latency, open port count, security_score (color: ≥80 green, 50–79 amber, &lt;50 red).
- **NEW** badge when `is_new`.
- Visual hint if any risky open port.

### 9.3 DeviceDetail

- Ports table: port, service, source.
- Score + breakdown.
- Timeline of events (newest first).
- Actions: Ping, Scan ports (full).

### 9.4 Hygiene page

1. Network score (large) + empty state if null  
2. Stat cards: online / new 24h / risky / offline  
3. Top risk devices (link to detail)  
4. Recent events feed  
5. Checklist with % complete  
6. Action: Scan ports (all online); link to Scans  

### 9.5 Settings

- Labels: **Quick ports** (after each scan) vs **Full ports** (manual deep scan).  
- No DHCP whitelist / active probing toggles in v1.

### 9.6 Style

Classic glass UI only; reuse existing compact controls / DarkSelect patterns.

---

## 10. Services / file map (existing layout)

| Module | Role |
|--------|------|
| `services/port_probe.py` | TCP connect scan for a host + port list |
| `services/device_events.py` | `log_event(...)` helper |
| `services/scoring.py` | `compute_device_score`, breakdown, network aggregate |
| `services/device_diff.py` | Emit events; update ports/latency inputs; score |
| `services/scanner.py` | Phases 4–5 in job |
| `services/nettools.py` | Existing ping RTT → persist path |
| `api/hygiene.py` | New router |
| `api/devices.py` | events + scan-ports + schema fields |
| `api/settings.py` | quick_ports |
| `models/device.py`, `models/event.py`, `models/hygiene.py` | ORM |
| Frontend: `pages/Hygiene.tsx`, Devices/Detail, Sidebar, types, client | |

Do **not** introduce a parallel `scanner/` package tree unless refactor is needed later; keep services flat like today.

---

## 11. Testing (minimum)

- Unit: scoring penalties and clamps  
- Unit: port merge quick vs full  
- Unit/API: device_diff emits new_device / ip_changed / port_opened  
- API: GET `/api/hygiene` shape with seed checklist  
- Mock: port_probe without real network  

---

## 12. Rollout order (for implementation plan)

1. Models + migrations/create_all + Device schema fields  
2. DeviceEvent + log from device_diff (new/ip/offline/online)  
3. port_probe + quick phase in scan + full scan endpoint  
4. latency persist (scan + ping)  
5. scoring + fields on Device API  
6. Hygiene API + checklist seed  
7. Frontend: Devices/Detail enrich → Hygiene page → Settings quick_ports  
8. Tests + changelog  

---

## 13. Open points resolved in design

| Question | Resolution |
|----------|------------|
| Separate Hygiene page? | Yes |
| Checklist in score? | No |
| Port tool | TCP connect first |
| Network score empty | null + empty UI |
| Notifications for every port change | Only risky opens |
| `Device.name` | Real column (user label); Doc 1 backfilled |
| MAC case Devices vs Planner | **One canon: lowercase** `aa:bb:cc:dd:ee:ff` everywhere; migrate Planner uppercase rows |
| Event vs notification type strings | Independent enums; map offline `went_offline` → `device_offline`; see §5.2.1 |
| Full scan vs keep prior ports | **Scoped merge** for both quick and full (§6.1) — not full wipe |
| Doc 1 `scan_ports` auto | Superseded: auto=`quick_ports`, manual=`scan_ports` |

No TBD left for v1 scope.

## 14. Spec cross-links / errata applied (2026-08-12 review)

| Item | Where fixed |
|------|-------------|
| `name` / `icon` on devices | Doc 1 data model + this §5.1 |
| MAC canon lowercase | Doc 1, Doc 2, this §5.1; Planner JSON example lowercase |
| Notification enum + mapping | Doc 1 notifications + this §5.2.1 |
| Port merge contradiction | This §6.1 scoped merge |
| `scan_ports` semantics | Doc 1 settings + scanner + this §5.4 |
| Planner singleton | Doc 2 §5.1 `id=1` + `ensure_plan` |
