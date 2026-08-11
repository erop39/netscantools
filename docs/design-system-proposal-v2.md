# netscantools (eG::39) — Modern UI Proposal v2

> Сгенерировано с опорой на **ui-ux-pro-max** design-system  
> Product: network inventory / ops tool · Stack: React + Tailwind · Mode: dark-only

---

## 1. Positioning

| | Now | Proposed |
|---|-----|----------|
| Style | Scene photo + glass float rail | **Ops Console** — OLED dark + restrained glass |
| Density | Mixed, sometimes sparse / chaotic actions | **Data-dense** dashboard (8–12px rhythm) |
| Emotion | Atmospheric night lake | Calm control room — “NOC lite” |
| Brand | `#073e77` + sky accents | Keep brand blue, shift surfaces to slate-navy |

**Pattern (ui-ux-pro-max):** *Real-Time / Operations* — metrics first, status colors, scannable tables.

**Primary style:** *Dark Mode (OLED)* + touches of *Data-Dense Dashboard*  
**Avoid:** full cyberpunk neon, pure black smear, white OS selects, emoji icons, button piles.

---

## 2. Design tokens

### Color (semantic)

| Token | Hex | Use |
|-------|-----|-----|
| `--bg` | `#020617` | App background (slate-950) |
| `--bg-elevated` | `#0B1220` | Side rail, sticky bars |
| `--surface` | `#0F172A` | Cards / panels |
| `--surface-2` | `#1E293B` | Inputs, nested surfaces |
| `--border` | `rgba(148,163,184,0.16)` | Hairline borders |
| `--text` | `#F8FAFC` | Primary text |
| `--text-muted` | `#94A3B8` | Secondary |
| `--brand` | `#0EA5E9` | eG::39 accent (sky-500) |
| `--brand-deep` | `#073e77` | Brand deep (keep) |
| `--success` | `#22C55E` | Online / ok |
| `--warning` | `#F59E0B` | Degraded / dirty form |
| `--danger` | `#EF4444` | Offline / delete |
| `--focus` | `#38BDF8` | Focus ring |

**Status (color + text, never color alone):**  
online = green dot + “Online” · offline = red · unknown = slate.

### Typography

| Role | Font | Size / weight |
|------|------|----------------|
| UI body | **Plus Jakarta Sans** or keep Inter | 14 / 400–500 |
| Headings | Same family | 20–24 / 600–700, tracking -0.02em |
| Data (IP, MAC, CIDR) | **JetBrains Mono** / Fira Code | 12–13 / 500, tabular nums |

Scale: `11 · 12 · 13 · 14 · 16 · 20 · 24`

### Spacing & radius

- Grid: **8px** base (`4 8 12 16 24 32`)
- Card padding: `16` desktop / `12` dense tables  
- Radius: controls `10`, cards `14`, rail `20`  
- Touch: controls ≥ **40px** height; icon tools ≥ **36px** hit area

### Motion

- Micro: **150–200ms** ease-out  
- Panel open: 160ms scale+fade  
- Respect `prefers-reduced-motion`

### Elevation

1. Background scene (optional, dimmed to 40% opacity)  
2. Surface cards  
3. Sticky toolbar  
4. Dropdowns / dialogs (`z-index: 10050`)  
5. Toasts  

---

## 3. Layout shell

```
┌──────────┬────────────────────────────────────────────┐
│  Rail    │  Top bar (page title + primary CTA)         │
│  64/240  ├────────────────────────────────────────────┤
│  fixed   │  Filter toolbar (status · search · count)  │
│          ├────────────────────────────────────────────┤
│  logo    │  Main content (max 72rem, left-biased)      │
│  nav     │  Tables / cards — not vertically centered   │
│  logout  │                                            │
└──────────┴────────────────────────────────────────────┘
```

**Changes vs current**

| Current | Proposed |
|---------|----------|
| Floating island sidebar | **Docked** rail flush left, full height, 1px border-right |
| Content centered in free area | Content **starts under top bar**, max-width, padding 24 |
| Heavy scene bg | Scene **optional**; default solid slate gradient |
| Glass everywhere | Glass only on **modals + dropdowns**; cards = solid surface |

Why: ops tools read better with stable dock + dense surface; photo bg fights tables.

---

## 4. Component language

### Buttons
- **Primary:** solid brand, white text, one per view  
- **Secondary:** surface-2 + border  
- **Ghost / tool:** icon-only in a **segmented strip** (already started on Devices)  
- Danger: outline or soft red, never next to primary without gap  

### Tables (Devices / Scans history)
- Sticky header, row height **44–48px**  
- Columns: Status · Device · Type · IP · MAC · Host · **Actions strip**  
- Row hover: `surface-2 @ 40%`  
- Mobile: card list (status + name + IP + overflow menu)

### Dropdowns
- Solid navy surface (`#0c1e36` family) — already fixed  
- Portaled, fixed, always on top  
- Radio options + optional footer (custom CIDR)

### Status
- Pill + dot + text (a11y)  
- Table may use compact pill only + `title`

### Forms
- Visible labels always  
- Helper under field  
- Error under field + `role="alert"`  

---

## 5. Page-level UI

### Home — “Ops overview”
```
[ Online 34/40 ] [ New today 2 ] [ Last scan OK · 12:48 ] [ Start scan → ]
[ Recent devices — compact list 5 rows ]
[ Alerts strip — unread notifications ]
```
KPI cards in one row; no decorative empty space.

### Devices — inventory console
- Top: title + Resolve all / Export  
- Toolbar: status filter · search · count  
- Table + icon action strip (Open · Ping · DNS · Rename · Detail)  
- Detail: left discovery/tools, right edit; icon picker **collapsed by default**

### Scans — control + history
- One “Network scan” card: subnet combobox · interval · ports · Start  
- History table below (no duplicate settings blocks)

### Notifications
- List with unread accent bar; bulk “Mark all read”

### Settings
- Account + Appearance only; scan defaults live on Scans

---

## 6. Visual direction mock (ASCII)

```
┌ sidebar ─┐  Devices                    [Resolve] [HTML] [PDF]
│ eG::39   │  ────────────────────────────────────────────────
│ ● Home   │  [ All statuses ▾ ]  [ Search………… ]  35 devices
│ ● Devices│  ┌────────────────────────────────────────────┐
│   Scans  │  │ ● Online  🖥 192.168.1.1  nas  1.1  …  [↗📡🔍✎›] │
│   Notif. │  │ ● Online  ？ 192.168.1.2  —    1.2  …  [↗📡🔍✎›] │
│   Sett.  │  └────────────────────────────────────────────┘
│  Log out │
└──────────┘
```

Mood: Linear / Vercel dashboard × UniFi-ish NOC — not marketing landing.

---

## 7. Migration path (incremental)

| Phase | Scope | Risk |
|-------|--------|------|
| **A. Tokens** | Map CSS vars to table above; surfaces solid | Low |
| **B. Shell** | Dock sidebar, remove vertical float/centering | Low |
| **C. Density** | Table row height, toolbar, type scale | Low |
| **D. Scene** | Background intensity slider: Off / Soft / Full | Low |
| **E. Home** | KPI row + recent list | Medium |
| **F. Polish** | Skeleton loaders, reduced-motion, focus audit | Low |

No big-bang rewrite: keep React structure, restyle tokens + shell first.

---

## 8. Anti-patterns (explicit)

- ❌ White native `<select>`  
- ❌ 7 text buttons per table row  
- ❌ Always-open wall of 40 icons  
- ❌ Content vertically centered under sidebar  
- ❌ Mixing purple SaaS gradients with brand blue  
- ❌ Pure cyberpunk neon (hurts a11y, not eG::39)  
- ❌ Color-only status without label  

---

## 9. Success criteria

1. Devices scannable in &lt;3s (status / name / IP without hunting buttons)  
2. Contrast body text ≥ 4.5:1 on surfaces  
3. axe: 0 critical/serious on main routes  
4. Shell: content top = rail top ±4px  
5. One primary CTA per page  

---

## 10. Recommended next step

Implement **Phase A+B** (tokens + docked shell + surface cards) on current app — largest visual jump, smallest code churn. Then tighten Devices/Home density.

If you approve, implement as `0.6.0` UI refresh without changing API.
