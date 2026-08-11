# UI skins (hybrid)

Runtime switch between two visual systems without redeploy.

| Skin | Key | Look |
|------|-----|------|
| **Classic** | `classic` | Floating glass sidebar, scenic background (default) |
| **Ops Console** | `ops` | Docked rail, solid surfaces, denser layout |

## How to switch

1. **Settings → Interface skin** — click Classic or Ops (instant).
2. Or DevTools: `localStorage.setItem('netpad_ui_skin','ops'); location.reload()`

Storage: browser `localStorage` key `netpad_ui_skin`.  
DOM: `document.documentElement.dataset.ui`.

## Rollback

- In-app: switch to **Classic**.
- Git: tag **`pre-ops-ui`** = commit `4ae5784` (last pure classic before hybrid).  
  Tag **`v0.6.0-hybrid`** = hybrid switch release.

```bash
git checkout pre-ops-ui   # classic-only tree
git checkout feat/netinventory-mvp  # back to hybrid
```
