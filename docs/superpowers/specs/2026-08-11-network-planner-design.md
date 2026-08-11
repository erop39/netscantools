# Network Planner — Design Spec

**Product:** netscantools (eG::39)  
**Date:** 2026-08-11  
**Status:** Approved for planning (brainstorming complete)  
**UI skin:** Classic glass only  

---

## 1. Problem

After scanning the LAN, devices appear in **Devices** with whatever DHCP gave them. Users still need a **desired** network layout: fixed order, reserved IPs, and a note of which ports/apps run on each host (cameras, NAS, PCs, self-hosted stacks). When the router is replaced, that layout should be restorable as a **cheatsheet** (export/import), not lost with the old DHCP leases.

## 2. Goals

1. Sidebar tab **Planner** with a single active network plan.
2. Ordered slots: planned IP, role label, optional bind to inventory by **MAC**.
3. Reserved slots without a device yet.
4. Per-slot ports: **port number + free-text label** (app presets later).
5. Live vs planned comparison when MAC matches a Device.
6. Export / import full plan as JSON (replace on import).
7. **No** pushing config to the router (documentation-only).

## 3. Non-goals (MVP)

- Multiple named plans or version history  
- DHCP / static-lease apply on any router vendor  
- Application preset library (future “C”)  
- Canvas / topology map  
- Auto-scanning ports into the plan from nmap  
- Mutating Device.ip from the plan  

## 4. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Relation to Devices | Separate plan; link by MAC |
| Plan count | Singleton (one active plan) |
| Slots without device | Yes (reserve) |
| Services | port + label only |
| Apply to network | Schema only + export/import |
| Storage | Normalized SQL tables |
| UI style | Classic glass |

## 5. Data model

### 5.1 `network_plans` (singleton)

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | Prefer single row; ensure-on-read |
| `name` | String | Default `"Home LAN"` |
| `cidr` | String nullable | e.g. `192.168.1.0/24`; used for IP validation |
| `notes` | Text nullable | |
| `updated_at` | DateTime | |

### 5.2 `plan_slots`

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | |
| `plan_id` | FK → network_plans | |
| `sort_order` | Integer | 0..n contiguous after reorder |
| `planned_ip` | String nullable | Unique among non-null in plan |
| `hostname_hint` | String nullable | Desired name |
| `role_label` | String nullable | “NAS”, “Cam porch” |
| `device_mac` | String nullable | Normalized uppercase MAC; unique if set |
| `notes` | Text nullable | |

**Rules**

- `device_mac` null ⇒ reserve slot.  
- At most one slot per MAC per plan.  
- `planned_ip` unique when not null.  
- If `plan.cidr` set and `planned_ip` set ⇒ IP must fall in CIDR (backend validate).  
- Deleting a Device does **not** delete the slot; live fields become empty / unknown.

### 5.3 `plan_ports`

| Column | Type | Notes |
|--------|------|--------|
| `id` | Integer PK | |
| `slot_id` | FK → plan_slots ON DELETE CASCADE | |
| `port` | Integer | 1–65535 |
| `label` | String | e.g. “SMB”, “HA” |
| `sort_order` | Integer | |

**Unique:** `(slot_id, port)`.

### 5.4 Live enrichment (read model, not stored)

When returning a slot, join Devices by MAC (case-insensitive normalize):

- `live_ip`, `live_status`, `device_id` (nullable if no inventory row)

**Match badge**

| Condition | Badge |
|-----------|--------|
| MAC bound and live_ip == planned_ip | match |
| MAC bound and live_ip differs | mismatch |
| MAC bound, no live_ip / offline / unknown | linked-no-ip |
| No MAC | reserve |

## 6. Export format

```json
{
  "format": "netscantools.network_plan",
  "version": 1,
  "exported_at": "ISO-8601",
  "plan": {
    "name": "Home LAN",
    "cidr": "192.168.1.0/24",
    "notes": null
  },
  "slots": [
    {
      "sort_order": 0,
      "planned_ip": "192.168.1.1",
      "hostname_hint": "gateway",
      "role_label": "Router",
      "device_mac": "AA:BB:CC:DD:EE:FF",
      "notes": null,
      "ports": [
        { "port": 80, "label": "Web UI", "sort_order": 0 }
      ]
    }
  ]
}
```

**Import:** validate → **replace** entire plan (slots + ports). UI requires explicit confirm. Unknown fields ignored; wrong `format`/`version` → 400.

## 7. API

Auth: same JWT cookie as rest of app. Prefix: `/api/planner`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/planner` | Ensure singleton; return plan + slots + ports + live fields |
| PUT | `/api/planner` | Update plan meta: name, cidr, notes |
| POST | `/api/planner/slots` | Create slot (append order) |
| PATCH | `/api/planner/slots/{id}` | Update slot fields |
| DELETE | `/api/planner/slots/{id}` | Delete slot + ports |
| PUT | `/api/planner/slots/reorder` | Body: `{ "slot_ids": number[] }` full permutation |
| POST | `/api/planner/slots/{id}/ports` | Create port |
| PATCH | `/api/planner/ports/{id}` | Update port |
| DELETE | `/api/planner/ports/{id}` | Delete port |
| GET | `/api/planner/export` | Download JSON attachment |
| POST | `/api/planner/import` | Replace from JSON body |
| GET | `/api/planner/candidates` | Devices whose MAC not yet in plan (for picker) |

**Errors**

- `400` — validation (cidr, port range, IP not in cidr, bad import, incomplete reorder)  
- `409` — duplicate planned_ip or MAC  
- `404` — missing slot/port  

**Ensure plan:** on first GET, create plan with `name="Home LAN"`, `cidr` from settings `scan_subnet` if present.

## 8. Frontend

### 8.1 Navigation

- Sidebar item **Planner** (route `/planner`), icon distinct from Devices/Scans.  
- Place after **Devices**.

### 8.2 Page layout

1. Header: title, plan name + cidr (editable), Export / Import / Add slot.  
2. Ordered list of slots (glass cards or dense rows).  
3. Per slot: sort controls, planned IP, role, MAC bind, live badge, ports chips, expand for notes.  
4. Actions: “Add from inventory”, “Add empty reserve”.  
5. Empty state when no slots.

### 8.3 Interactions (MVP)

- Reorder: **up/down** buttons calling reorder API (drag optional later).  
- Bind: picker from `candidates` (MAC + label).  
- Ports: add form (port + label), edit, delete.  
- Import: file → confirm replace → POST.

### 8.4 Visual language

Classic glass: glass-card, existing buttons, DarkSelect if needed, status-style badges for match/mismatch.

## 9. Edge cases

| Situation | Behavior |
|-----------|----------|
| Device deleted, MAC still on slot | Keep slot; live fields empty |
| DHCP changes live IP | planned unchanged; badge mismatch |
| Bad import JSON | 400; DB unchanged |
| Reorder missing ids | 400 |
| Concurrent edits | Last write wins; acceptable for single-user app |

## 10. Testing

- API tests: ensure plan, CRUD slot/port, uniqueness, reorder, import replace, cidr validation.  
- Frontend smoke: route renders, empty state, load plan.

## 11. Implementation phases (for later plan)

1. Models + migration + ensure singleton  
2. API CRUD + export/import + candidates  
3. Frontend page + sidebar + API client types  
4. Polish badges, empty states, confirm import  
5. Changelog entry  

## 12. Success criteria

1. Planner visible in sidebar and at `/planner`.  
2. Can build ordered plan with reserves + inventory binds + ports.  
3. Live vs planned is visible for bound MACs.  
4. Export → wipe → import restores slots/ports.  
5. No regression to Classic glass shell; auth unchanged.

---

## Appendix A — Relationship to existing features

| Feature | Role |
|---------|------|
| Devices | Live inventory; source of MAC/IP/status for bind + live |
| Scans | Discover devices; does not write plan |
| Settings.scan_subnet | Default plan.cidr on ensure |
| Inventory (README) | Future journal; Planner is **network addressing plan**, not asset journal |

## Appendix B — Future (not MVP)

- Application presets (ports bundled per app)  
- Multiple plans / snapshots  
- Drag-and-drop reorder  
- Optional “copy planned IP into device notes”  
- Export as human-readable Markdown/HTML cheatsheet  
