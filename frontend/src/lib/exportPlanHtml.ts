import type { NetworkPlan, PlanMatch, PlanSlot } from "../types";
import { deviceIconSvgHtml } from "./deviceIconSvg";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matchLabel(m: PlanMatch): string {
  switch (m) {
    case "match":
      return "OK · live = planned";
    case "mismatch":
      return "Drift · live ≠ planned";
    case "linked-no-ip":
      return "Linked · no live IP";
    case "reserve":
    default:
      return "Reserve · no MAC";
  }
}

function matchClass(m: PlanMatch): string {
  return `badge badge-${m}`;
}

function lastOctet(ip: string | null | undefined): string {
  if (!ip) return "—";
  const parts = ip.trim().split(".");
  return parts.length === 4 ? parts[3] : ip;
}

function slotTitle(s: PlanSlot): string {
  return s.role_label || s.hostname_hint || s.planned_ip || "Unnamed slot";
}

/** Visual network map HTML for print / offline cheatsheet */
export function buildPlanMapHtml(plan: NetworkPlan): string {
  const generated = new Date().toLocaleString();
  const slots = [...plan.slots].sort((a, b) => a.sort_order - b.sort_order);
  const nMatch = slots.filter((s) => s.match === "match").length;
  const nMismatch = slots.filter((s) => s.match === "mismatch").length;
  const nReserve = slots.filter((s) => s.match === "reserve").length;

  const cards = slots
    .map((s, i) => {
      const ports =
        s.ports.length === 0
          ? `<span class="muted">No ports listed</span>`
          : s.ports
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order || a.port - b.port)
              .map(
                (p) =>
                  `<span class="port"><b>${p.port}</b>${
                    p.label ? ` · ${esc(p.label)}` : ""
                  }</span>`,
              )
              .join("");

      const iconHtml = deviceIconSvgHtml(s.device_icon, 20);
      const iconTitle = s.device_icon
        ? esc(s.device_icon)
        : s.device_mac
          ? "No icon set"
          : "Reserve";

      return `
      <article class="host ${esc(s.match)}">
        <div class="host-rail" aria-hidden="true">
          <span class="host-index">${i + 1}</span>
          ${i < slots.length - 1 ? `<span class="host-line"></span>` : ""}
        </div>
        <div class="host-card">
          <header class="host-head">
            <div class="ip-block">
              <div class="ip-planned mono">${esc(s.planned_ip) || "—.—.—.—"}</div>
              <div class="ip-octet" title="Last octet">${esc(lastOctet(s.planned_ip))}</div>
            </div>
            <div class="host-icon" title="${iconTitle}">${iconHtml}</div>
            <div class="host-meta">
              <h2 class="host-title">${esc(slotTitle(s))}</h2>
              <div class="host-sub">
                ${
                  s.hostname_hint
                    ? `<span class="chip">${esc(s.hostname_hint)}</span>`
                    : ""
                }
                <span class="${matchClass(s.match)}">${esc(matchLabel(s.match))}</span>
              </div>
            </div>
          </header>
          <dl class="facts">
            <div>
              <dt>MAC</dt>
              <dd class="mono">${esc(s.device_mac) || "—"}</dd>
            </div>
            <div>
              <dt>Live IP</dt>
              <dd class="mono">${esc(s.live_ip) || "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>${esc(s.live_status) || "—"}</dd>
            </div>
          </dl>
          ${
            s.notes
              ? `<p class="notes">${esc(s.notes)}</p>`
              : ""
          }
          <div class="ports-row">
            <span class="ports-label">Ports / apps</span>
            <div class="ports">${ports}</div>
          </div>
        </div>
      </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(plan.name)} — network map · eG::39</title>
  <style>
    :root {
      --bg: #020617;
      --card: #0f172a;
      --card-2: #111c33;
      --border: rgba(148, 163, 184, 0.18);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --sky: #38bdf8;
      --ok: #34d399;
      --warn: #fbbf24;
      --reserve: #94a3b8;
      --mono: "JetBrains Mono", "Cascadia Code", ui-monospace, Consolas, monospace;
      --sans: Inter, system-ui, -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      color: var(--text);
      background:
        radial-gradient(ellipse 70% 40% at 80% 0%, rgba(56,189,248,.12), transparent 55%),
        linear-gradient(180deg, #020617 0%, #0b1630 100%);
      min-height: 100vh;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrap { max-width: 920px; margin: 0 auto; padding: 28px 20px 48px; }
    header.page {
      display: flex; flex-wrap: wrap; gap: 16px 24px;
      align-items: flex-end; justify-content: space-between;
      margin-bottom: 22px; padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .brand { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--sky); font-weight: 600; }
    h1 { margin: 4px 0 0; font-size: 1.55rem; letter-spacing: -0.03em; }
    .subtitle { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
    .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .stats {
      display: flex; flex-wrap: wrap; gap: 8px;
      font-size: 12px;
    }
    .stat {
      padding: 6px 10px; border-radius: 999px;
      background: rgba(15,23,42,.85); border: 1px solid var(--border);
      color: var(--muted);
    }
    .stat b { color: var(--text); font-weight: 600; }
    .legend {
      display: flex; flex-wrap: wrap; gap: 10px 14px;
      margin: 0 0 18px; font-size: 11px; color: var(--muted);
    }
    .legend span::before {
      content: ""; display: inline-block; width: 8px; height: 8px;
      border-radius: 50%; margin-right: 6px; vertical-align: middle;
    }
    .legend .l-match::before { background: var(--ok); }
    .legend .l-mismatch::before { background: var(--warn); }
    .legend .l-reserve::before { background: var(--reserve); }
    .legend .l-linked::before { background: #64748b; }

    .map { display: flex; flex-direction: column; gap: 0; }

    .host {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 0 12px;
      align-items: stretch;
    }
    .host-rail {
      display: flex; flex-direction: column; align-items: center;
      padding-top: 18px;
    }
    .host-index {
      width: 28px; height: 28px; border-radius: 999px;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      background: rgba(56,189,248,.15); color: #7dd3fc;
      border: 1px solid rgba(56,189,248,.35);
      z-index: 1;
    }
    .host-line {
      flex: 1; width: 2px; min-height: 12px;
      background: linear-gradient(180deg, rgba(56,189,248,.45), rgba(56,189,248,.08));
      margin: 4px 0 0;
    }
    .host-card {
      margin-bottom: 12px;
      background: linear-gradient(155deg, rgba(255,255,255,.06), rgba(15,23,42,.92));
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px 14px 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.25);
    }
    .host.match .host-card { border-color: rgba(52,211,153,.28); }
    .host.mismatch .host-card { border-color: rgba(251,191,36,.35); }
    .host.reserve .host-card { border-style: dashed; }

    .host-head {
      display: flex; gap: 12px; align-items: flex-start;
      margin-bottom: 10px;
    }
    .host-icon {
      flex-shrink: 0;
      width: 40px; height: 40px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 12px;
      color: #7dd3fc;
      background: linear-gradient(145deg, rgba(56,189,248,.18), rgba(14,165,233,.1));
      border: 1px solid rgba(125,211,252,.28);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
    }
    .host-icon svg { display: block; }
    .ip-block {
      flex-shrink: 0;
      width: 118px;
      background: var(--card-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 8px 6px;
      text-align: center;
    }
    .ip-planned {
      font-size: 12.5px; font-weight: 600; color: #e0f2fe;
      word-break: break-all;
    }
    .ip-octet {
      margin-top: 4px; font-size: 22px; font-weight: 700;
      font-family: var(--mono); color: var(--sky); letter-spacing: -0.03em;
      line-height: 1.1;
    }
    .host-title {
      margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.02em;
    }
    .host-sub { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip {
      font-size: 11px; padding: 2px 8px; border-radius: 999px;
      background: rgba(255,255,255,.06); border: 1px solid var(--border);
      color: var(--muted);
    }
    .badge {
      font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
      border: 1px solid transparent;
    }
    .badge-match { color: #6ee7b7; background: rgba(16,185,129,.14); border-color: rgba(52,211,153,.3); }
    .badge-mismatch { color: #fcd34d; background: rgba(245,158,11,.14); border-color: rgba(251,191,36,.35); }
    .badge-linked-no-ip { color: #cbd5e1; background: rgba(148,163,184,.12); border-color: rgba(148,163,184,.28); }
    .badge-reserve { color: #cbd5e1; background: rgba(100,116,139,.16); border-color: rgba(148,163,184,.22); }

    .facts {
      display: grid; grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 8px; margin: 0 0 8px; font-size: 12px;
    }
    .facts dt {
      margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
      color: var(--muted); font-weight: 600;
    }
    .facts dd { margin: 2px 0 0; color: var(--text); }
    .notes {
      margin: 0 0 8px; font-size: 12px; color: var(--muted);
      padding: 6px 8px; border-radius: 8px; background: rgba(0,0,0,.18);
    }
    .ports-row { margin-top: 4px; }
    .ports-label {
      display: block; font-size: 10px; text-transform: uppercase;
      letter-spacing: .06em; color: var(--muted); font-weight: 600; margin-bottom: 6px;
    }
    .ports { display: flex; flex-wrap: wrap; gap: 6px; }
    .port {
      font-size: 11px; padding: 3px 8px; border-radius: 999px;
      background: rgba(14,165,233,.12); border: 1px solid rgba(56,189,248,.25);
      color: #bae6fd;
    }
    .port b { font-family: var(--mono); font-weight: 700; color: #e0f2fe; }
    .muted { color: var(--muted); font-size: 12px; }

    footer.page {
      margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--border);
      font-size: 11px; color: var(--muted);
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px;
    }

    @media print {
      body { background: #fff; color: #0f172a; }
      .host-card, .ip-block, .stat, .notes, .port, .chip, .host-icon {
        box-shadow: none !important;
        background: #f8fafc !important;
        border-color: #cbd5e1 !important;
        color: #0f172a !important;
      }
      .ip-planned, .host-title, .facts dd, .port b { color: #0f172a !important; }
      .ip-octet, .brand, .host-index, .host-icon { color: #0369a1 !important; }
      .ports-label, .facts dt, .muted, .subtitle, footer.page { color: #64748b !important; }
      .host-line { background: #cbd5e1 !important; }
      .badge-match { color: #047857 !important; background: #d1fae5 !important; }
      .badge-mismatch { color: #b45309 !important; background: #fef3c7 !important; }
    }
    @media (max-width: 640px) {
      .facts { grid-template-columns: 1fr; }
      .ip-block { width: 96px; }
      .ip-octet { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="page">
      <div>
        <div class="brand">eG::39 · netscantools</div>
        <h1>${esc(plan.name)}</h1>
        <p class="subtitle mono">
          ${esc(plan.cidr) || "no CIDR"}
          ${plan.notes ? ` · ${esc(plan.notes)}` : ""}
        </p>
      </div>
      <div class="stats">
        <span class="stat"><b>${slots.length}</b> hosts</span>
        <span class="stat"><b>${nMatch}</b> match</span>
        <span class="stat"><b>${nMismatch}</b> drift</span>
        <span class="stat"><b>${nReserve}</b> reserve</span>
      </div>
    </header>

    <div class="legend">
      <span class="l-match">Live = planned</span>
      <span class="l-mismatch">IP drift</span>
      <span class="l-linked">Linked, no live IP</span>
      <span class="l-reserve">Reserve (no MAC)</span>
    </div>

    <section class="map" aria-label="Network plan map">
      ${cards || `<p class="muted">No slots in this plan.</p>`}
    </section>

    <footer class="page">
      <span>Generated ${esc(generated)} · visual plan map (not a live scan)</span>
      <span>Use with router static DHCP / notes after hardware change</span>
    </footer>
  </div>
</body>
</html>`;
}

export function downloadPlanMapHtml(plan: NetworkPlan, filename = "network-plan-map.html"): void {
  const html = buildPlanMapHtml(plan);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
