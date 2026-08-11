# Changelog

All notable changes to NetInventory (qube.li / netPad) are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- Inventory journal (post-MVP)
- Docker deploy + VPN docs (post-MVP)

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
