# netscantools (eG::39)

See [docs/README.md](docs/README.md) for product docs.

- Design: [docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md](docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md)
- Changelog: [docs/changelog.md](docs/changelog.md)

## Quick start (one command)

Double-click from the repo root:

| Bat | What it does |
|---|---|
| **`start.bat`** | Start API + UI (opens browser) |
| **`stop.bat`** | Kill listeners on ports 8000 + 5173 |
| **`restart.bat`** | Stop, then start (`--skip-install`) |

Or in a terminal:

```powershell
python run.py
```

This starts **API + UI** in one window, opens the browser, and stops both on **Ctrl+C** (or `stop.bat`).

| | URL |
|---|---|
| UI | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000 |
| Login | `admin` / `admin` |

Options (passed through `start.bat` / `restart.bat`):

```powershell
python run.py --no-browser
python run.py --api-port 8001
python run.py --skip-install
```

Requirements: **Python 3.12+**, **Node.js** (npm).
