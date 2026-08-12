# Changelog

All notable changes to netscantools (eG::39 / netPad) are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- Docker deploy + VPN docs (post-MVP)
- **HAOS IoT bridge** — pull/remember IoT from Home Assistant (see `docs/todo.md`)
- multi-VLAN (see `docs/todo.md`)

## [0.9.0-beta.1] — 2026-08-12

First public beta after Hygiene 0.8.0 — home LAN inventory, hygiene, and ops tools.

### Added

- SMB share enum: `POST /api/devices/{id}/scan-shares` (`net view`); shares UI on device detail
- SMB chips on Devices; opt-in auto enum after full scan when 445 open (`share_scan_auto`)
- **Location** on devices (field, filter, edit)
- **Wake-on-LAN** — `POST /api/devices/{id}/wol`
- **Inventory backup** — scheduled SQLite copies + `POST /api/settings/backup-now`
- **TLS cert check** — `POST /api/devices/{id}/check-tls`, score penalties
- **Quick scan** — presence only (`{"mode":"quick"}`); **Full scan** keeps ports + latency
- Scan history **duration** + scan **mode** column
- **Time sync** — UTC API timestamps; PC timezone UI; Settings Time card; sidebar clock; `GET /api/time`
- **Inventory journal** — `/inventory` + CRUD `/api/inventory`
- **QR web-UI** on device detail
- **Presence** — `is_person` + Home “Who’s home”
- **Latency history** (last 48 samples) + sparkline
- **Port catalog** — well-known TCP list + `PortSelector` on Scans (presets → `quick_ports` / `scan_ports`)
- OUI vendor auto-fill (IEEE cache + backfill)

### Changed

- Event type colors and open-port pills priority in UI

## [0.8.0] — 2026-08-12

### Added

- Hygiene page: network score, risk cards, checklist, recent events
- Device latency, open ports (quick after scan / full on demand), security score
- DeviceEvent timeline; GET `/api/devices/{id}/events`
- Settings `quick_ports` for automatic light port probe

### Changed

- `scan_ports` is manual deep scan only (not every network scan)
- Planner MAC storage normalized to lowercase (canon shared with Devices)

## [0.7.4] — 2026-08-11

### Added

- Device icons: Apple (iPhone, iPad, Mac, Apple TV, Watch, AirPods), Android / Android TV, kitchen appliances
- Devices list: click avatar to pick icon (popover) without opening detail

## [0.7.3] — 2026-08-11

### Fixed

- Buttons unified: all variants **32×12px pad, radius 10px** (no pill vs box mix; primary/secondary same size)

## [0.7.2] — 2026-08-11

### Changed

- Global compact controls: primary/danger ~34px, secondary ~32px, inputs 36px (was 44)

## [0.7.1] — 2026-08-11

### Changed

- Planner UI denser (compact cards, smaller buttons/inputs)
- Planner **Export HTML** — print-friendly visual network map (timeline of hosts, ports, live vs planned)

## [0.7.0] — 2026-08-11

### Added

- **Planner** tab: singleton network plan, ordered slots (planned IP, MAC bind, reserves),
  ports (port + label), live vs planned, JSON export/import replace

## [0.6.1] — 2026-08-11

### Changed

- **UI: Classic glass only** — removed Ops Console skin switch, provider, and CSS; stay on floating glass sidebar

## [0.6.0] — 2026-08-11

### Added

- Hybrid UI skins (Classic / Ops) — **removed in 0.6.1** (Ops not used)
- Devices list / detail reorganized; DarkSelect portaled; icon picker grouped
- App icon from `docs/icon2.png`
- Git tag **`pre-ops-ui`** classic baseline

## [0.5.13] — 2026-08-11

### Changed

- Device detail: Open & tools as compact icon toolbars; discovery as 2-col facts; type+icon unified (presets first, full icon picker on demand)

## [0.5.12] — 2026-08-11

### Changed

- Devices list: single compact action strip (open / ping / DNS / rename / detail) instead of scattered button piles
- Icon picker: grouped by Network / Compute / Media / Home — no flat icon dump
- Type presets: fixed grid; detail tools split into Open + Diagnostics

## [0.5.11] — 2026-08-11

### Fixed

- Layout root cause: `.glass-panel { position: relative }` overrode sidebar `position: fixed` → main sat under the rail; sidebar is fixed again, content top-aligned with sidebar and centered in free area

## [0.5.10] — 2026-08-11

### Fixed

- axe-core (Playwright Chromium): Login landmarks, Devices empty `<th>`, DarkSelect listbox name / required children / scrollable focus
- Audit script: `frontend/scripts/axe-audit.mjs` — 0 violations on all routes + open dropdown

## [0.5.9] — 2026-08-11

### Fixed

- UI a11y: focus-visible rings; DarkSelect keyboard (arrows/Enter/Esc); sidebar `aria-label`
- Icon asset: `icon2.png` resized 1254→256 for public use (~1.3MB → ~100KB)
- Narrow viewports: main padding no longer crushed under expanded sidebar width

## [0.5.8] — 2026-08-11

### Changed

- App icon switched to `docs/icon2.png` (favicon, login, sidebar)

## [0.5.7] — 2026-08-11

### Fixed

- Dropdowns: shared dark `DarkSelect` portaled to `document.body` with `position: fixed` + z-index 10050 — never clipped under cards, always on top
- Devices status filter uses the same dropdown style as Scans subnet

## [0.5.6] — 2026-08-11

### Changed

- App icon from `docs/icon.png` / `docs/icon.ico`: favicon, apple-touch-icon, login + sidebar brand mark

## [0.5.5] — 2026-08-11

### Fixed

- Scans: single solid dark subnet combobox (uiverse-style) — presets + custom CIDR inside the same panel; no separate field, no white OS select
- Layout: main content hard-pinned to sidebar top (no mid-page float under the rail)

## [0.5.4] — 2026-08-11

### Added

- Scans: subnet presets as compact dropdown + manual CIDR field

## [0.5.3] — 2026-08-11

### Fixed

- Restored real glass (translucent + blur): removed dark content scrim and opaque card/input fills
- Sidebar back to compact floating size (top/bottom inset, not full-height stretch)
- Main content horizontally centered; top aligned with sidebar

## [0.5.2] — 2026-08-11

### Changed

- Brand rename: **qube.li** → **eG::39**, **NetInventory** → **netscantools**
- Settings: removed duplicate Network scan defaults block (scan config only on Scans page)

## [0.5.1] — 2026-08-11

### Fixed

- Sidebar collapse: icon-only rail; expand/collapse is an edge control (not a nav item)
- Main content left-aligned next to sidebar (no longer floating mid-canvas)
- Stronger glass cards + high-contrast inputs over custom backgrounds
- Settings: password CTA not clipped; show/hide passwords; denser account form

## [0.5.0] — 2026-08-11

### Added

- Collapsible sidebar (icons-only mode, state persisted)
- Change password in Settings → Account (`POST /api/auth/change-password`)

### Fixed

- Main content alignment with sidebar (no extra vertical shift; padding tracks expanded/collapsed width)

## [0.4.9] — 2026-08-11

### Added

- Device type icons (Semantic UI–inspired set): picker on device detail, type presets, avatar in list

## [0.4.8] — 2026-08-11

### Changed

- UI polish (uiverse-inspired): pill buttons with shine/glow, soft glass inputs, animated status badges, premium sidebar nav, Inter + JetBrains Mono, dashboard stat cards, refined tables

## [0.4.7] — 2026-08-11

### Added

- **Resolve all** — reverse-DNS every device with an IP (`POST /api/devices/resolve-all`)
- **Rename** — manual `name` field (not overwritten by scan/DNS); rename in list + detail
- **Export HTML / PDF** — styled inventory report with clickable LAN / Ext / HTTP / HTTPS web UI links

## [0.4.6] — 2026-08-11

### Changed

- Scans page: Network scan control panel at the top (subnet, interval, ports, Start scan)
- Settings: network fields kept as defaults with link to Scans as primary workflow

## [0.4.5] — 2026-08-11

### Added

- Open device links: LAN / External / HTTP / HTTPS from list and detail
- Reverse DNS on network scan + **Resolve** action per device
- **Ping** action with RTT (updates online/offline)
- New devices get default `web_ui_local` = `http://{ip}`

## [0.4.4] — 2026-08-11

### Added

- Single launcher: `run.py` / `start.bat` — API + UI in one window (no two terminals)
- Auto port fallback if 8000/5173 are busy; opens browser; Ctrl+C stops both

## [0.4.3] — 2026-08-11

### Added

- UI Settings: choose background (Night landscape / Soft gradient / Solid blue / Custom upload)
- API: `ui_background` in settings, upload/delete custom background image

## [0.4.2] — 2026-08-11

### Fixed

- Network scan found 0 devices on Russian Windows: `arp -a` / `ping` output was decoded as UTF-8 and became empty. Now uses Windows OEM console encoding.

## [0.4.1] — 2026-08-11

### Changed

- Restored qube.li visual depth: night landscape background, real glassmorphism (blur + translucency + edge light)
- Sidebar nav items now show icons + soft active highlight
- Cards, inputs, and buttons use glass/volume styles instead of flat outlines

## [0.4.0] — 2026-08-11

### Added

- Notifications UI
- Settings UI (subnet, interval, ports)

### Changed

- MVP feature set complete per design spec

## [0.3.0] — 2026-08-11

### Added

- Windows network scanner (ping sweep + arp -a)
- Scans API, history UI, manual trigger
- APScheduler interval scans

## [0.2.0] — 2026-08-11

### Added

- Devices list/detail with edit web UI links
- Home dashboard (online count, last scan, recent activity)

## [0.1.0] — 2026-08-11

### Added

- FastAPI backend scaffold, SQLite models, admin bootstrap
- JWT cookie auth (login / logout / me)
- React + Vite + Tailwind frontend shell
- Glass sidebar UI (qube.li style from ui/ references)
- Login and protected routing

## [0.0.1] — 2026-08-11

### Added

- Product concept and roadmap in `docs/README.md`
- UI design references in `ui/` (glass sidebar, palette `#073e77`)
- MVP design specification: `docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md`
- This changelog; every subsequent version must update this file
