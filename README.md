# NetInventory (qube.li)

See [docs/README.md](docs/README.md) for product docs.

- Design: [docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md](docs/superpowers/specs/2026-08-11-netinventory-mvp-design.md)
- Changelog: [docs/changelog.md](docs/changelog.md)

## Quick start (one command)

**Double-click** `start.bat`  
or in a terminal from the repo root:

```powershell
python run.py
```

This starts **API + UI** in one window, opens the browser, and stops both on **Ctrl+C**.

| | URL |
|---|---|
| UI | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000 |
| Login | `admin` / `admin` |

Options:

```powershell
python run.py --no-browser
python run.py --api-port 8001
python run.py --skip-install
```

Requirements: **Python 3.12+**, **Node.js** (npm).
