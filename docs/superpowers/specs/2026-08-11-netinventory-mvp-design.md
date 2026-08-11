# NetInventory (qube.li) — MVP Design

**Date:** 2026-08-11  
**Status:** Approved (design dialogue)  
**Product name:** NetInventory / qube.li  
**Repo folder:** netPad

## Goal

Personal utility for LAN scanning, device inventory, and quick access to device web UIs (LAN and external). Dark glassmorphic sidebar UI inspired by the CSS sidebar reference in `ui/`.

## Decisions (locked)

| Topic | Decision |
|---|---|
| First increment | Full MVP (backend + React UI + core pages) |
| Frontend | React + Vite + Tailwind CSS |
| Auth | Simple single-user login (JWT in httpOnly cookie) |
| Primary runtime | Windows local (scanner with Windows-friendly pipeline) |
| Architecture | Monorepo: FastAPI backend + React SPA |
| Out of MVP | Manual Inventory journal, multi-user, Docker prod hardening, VPN setup, email/Telegram alerts |

## Architecture

```
[Scanner Engine] → [SQLite + SQLAlchemy] → [FastAPI] → [React SPA]
        ↑                                      ↑
   APScheduler                          JWT cookie auth
```

- Backend: Python 3.12, FastAPI, SQLAlchemy, APScheduler
- Scanner: Windows ping-sweep + `arp -a` (+ optional scapy/nmap when available)
- Frontend: React Router, Vite proxy `/api` → `http://127.0.0.1:8000`
- DB: SQLite file (e.g. `backend/data/netpad.db`)

## Repository layout

```
netPad/
  docs/
    README.md
    changelog.md
    superpowers/specs/2026-08-11-netinventory-mvp-design.md
  backend/
    app/
      main.py
      config.py
      db.py
      models/
      api/            # auth, devices, scans, notifications, settings, dashboard
      services/       # scanner, scheduler, oui, auth
    requirements.txt
    .env.example
  frontend/
    package.json
    vite.config.ts
    src/
      components/layout/Sidebar.tsx
      pages/          # Home, Devices, DeviceDetail, Scans, Notifications, Settings, Login
      api/client.ts
      styles/
  ui/                 # design references (unchanged)
  docker-compose.yml  # optional skeleton only
  README.md           # short pointer to docs/README.md
```

## Data model

### users

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| username | string unique | |
| password_hash | string | bcrypt |
| created_at | datetime | |

### devices

MAC is the stable identity key.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| mac | string unique | normalized `aa:bb:cc:dd:ee:ff` |
| ip | string nullable | current IP |
| vendor | string nullable | OUI lookup |
| hostname | string nullable | reverse DNS if available |
| type | string nullable | router, camera, nas, iot, other, or free text |
| status | enum | `online` / `offline` / `unknown` |
| last_seen | datetime nullable | |
| web_ui_local | string nullable | LAN web UI URL |
| web_ui_external | string nullable | external URL (user-provided only) |
| notes | text nullable | |
| first_seen | datetime | |
| updated_at | datetime | |

### scans

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| started_at | datetime | |
| finished_at | datetime nullable | |
| status | enum | `running` / `success` / `failed` |
| subnet | string | e.g. `192.168.1.0/24` |
| devices_found | int | |
| new_devices | int | |
| error_message | string nullable | |

### notifications

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| type | enum | `new_device` / `device_offline` / `ip_changed` |
| device_id | FK nullable | |
| message | string | |
| read | bool | default false |
| created_at | datetime | |

### settings

Key-value store (or single-row config). Required keys:

| Key | Example | Notes |
|---|---|---|
| scan_subnet | `192.168.1.0/24` | |
| scan_interval_minutes | `60` | `0` disables auto-scan |
| scan_ports | `80,443,8080` | optional web-UI port probes |

Bootstrap auth: `ADMIN_USER` / `ADMIN_PASSWORD` from env on first run (defaults `admin`/`admin` for local dev; document change in `.env`).

## REST API

Prefix: `/api`. All routes except login require valid JWT cookie.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | username/password → set httpOnly JWT cookie |
| POST | `/auth/logout` | clear cookie |
| GET | `/auth/me` | current user |
| GET | `/dashboard` | online count, last scan summary, recent activity |
| GET | `/devices` | list; query params `status`, `q` |
| GET | `/devices/{id}` | detail |
| PATCH | `/devices/{id}` | update type, notes, web_ui_local, web_ui_external |
| DELETE | `/devices/{id}` | remove from inventory |
| POST | `/scans` | start manual scan (async); `409` if already running |
| GET | `/scans` | history (newest first) |
| GET | `/scans/{id}` | single scan |
| GET | `/notifications` | list |
| PATCH | `/notifications/{id}/read` | mark one read |
| POST | `/notifications/read-all` | mark all read |
| GET | `/settings` | current settings |
| PUT | `/settings` | update settings; reschedule APScheduler |

## Scanner (Windows)

Pipeline:

1. Load subnet (and ports) from settings.
2. Concurrent ping-sweep over subnet hosts (asyncio; ICMP and/or TCP connect probes).
3. Parse Windows `arp -a` for IP↔MAC mapping of responsive hosts.
4. OUI vendor lookup (local package or embedded table).
5. Optional: port check on configured ports for web UI hints.
6. Diff against DB:
   - new MAC → insert device + `new_device` notification
   - known MAC, different IP → update IP + `ip_changed` notification
   - previously online, missing from scan → `offline` + `device_offline` notification
   - found → `online`, update `last_seen`
7. Persist `scans` row (`success` / `failed` + counts).

Scheduler: APScheduler interval from `scan_interval_minutes`; reschedule on settings PUT. Manual scan shares the same engine; concurrent scans rejected with 409.

Note: scapy ARP is optional enhancement when Npcap/admin available; MVP must work via ping + `arp -a` without scapy.

## Frontend UX

### Visual system (from `ui/` reference)

- App background: deep blue `#073e77` (and related dark blues)
- Sidebar: fixed, width ~260px, `border-radius: 34px`, padding 16px, glass:
  - `background: rgb(0 0 0 / 12%)`
  - `border: 3px solid rgb(255 255 255 / 12%)`
  - `backdrop-filter: blur(30px)`
- Header in sidebar: logo + brand **qube.li** / NetInventory + menu control
- Nav items: height ~50px, gap 16px, radius 6px, text `rgb(255 255 255 / 95%)`
- Active: background `rgb(255 255 255 / 10%)`
- Hover: `rgb(255 255 255 / 3%)`
- Main content: cards on dark canvas, minimal chrome, clear online/offline status

### Pages (MVP)

| Route | Page | Content |
|---|---|---|
| `/login` | Login | simple form |
| `/` | Home | dashboard stats, last scan, recent changes |
| `/devices` | Devices | table/list, status, open LAN/external web UI |
| `/devices/:id` | Device detail | edit type, notes, web UI URLs |
| `/scans` | Scans | history + manual Start scan |
| `/notifications` | Notifications | list + mark read |
| `/settings` | Settings | subnet, interval, ports, account hint |

Protected routes redirect unauthenticated users to `/login`.

## Versioning and changelog

Semantic versioning. **Every release/increment must update `docs/changelog.md`** (Keep a Changelog style: Added / Changed / Fixed).

Planned MVP slices:

| Version | Scope |
|---|---|
| 0.1.0 | Monorepo scaffold, auth, DB models, UI shell + glass sidebar, login |
| 0.2.0 | Devices CRUD + dashboard API/UI |
| 0.3.0 | Windows scanner + Scans page + APScheduler |
| 0.4.0 | Notifications + Settings + MVP polish |

## Local development (Windows)

```bash
# backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000

# frontend
cd frontend
npm install
npm run dev
```

Backend `:8000`, frontend Vite default `:5173` (or `:3000` if configured) with `/api` proxy.

## Security notes (MVP)

- Do not expose API/UI to the public internet without reverse proxy + HTTPS + auth (documented in product README).
- `web_ui_external` is user-supplied bookmark only; app does not create tunnels.
- Default admin password must be changed for any non-dev use.
- JWT secret from env (`JWT_SECRET`); generate strong value in `.env.example` guidance.

## Error handling

- Scanner failures: scan row `failed` + error_message; UI shows last error.
- Auth failures: 401; missing resources: 404; concurrent scan: 409.
- Frontend: toast or inline error on failed mutations.

## Testing (MVP bar)

- Backend: unit tests for device diff logic (new / offline / IP change) and auth login.
- API smoke: login → list devices → start scan (mock scanner in tests).
- Manual UI check: sidebar states, device edit, scan button.

## Explicit non-goals (MVP)

- Inventory section (manual serials / locations journal)
- Multi-user accounts / roles
- Production Docker Compose hardening
- WireGuard/Tailscale automation
- External notification channels (email, Telegram, push)

## Success criteria

1. User can log in on Windows, open dark glass UI matching design reference spirit.
2. User configures subnet, runs a scan, sees devices with MAC/IP/vendor/status.
3. User can annotate device (type, notes, web UI links) and open links.
4. Auto-scan interval works; notifications appear for new / offline / IP change.
5. `docs/changelog.md` reflects each version shipped during implementation.
