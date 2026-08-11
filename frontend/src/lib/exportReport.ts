import type { Device } from "../types";
import { ensureHttpUrl, httpUrlForIp } from "./links";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayName(d: Device): string {
  return d.name || d.hostname || d.ip || d.mac;
}

function linkHtml(label: string, url: string | null | undefined): string {
  if (!url) return `<span class="muted">—</span>`;
  const href = ensureHttpUrl(url);
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

export function buildInventoryHtml(devices: Device[]): string {
  const generated = new Date().toLocaleString();
  const online = devices.filter((d) => d.status === "online").length;
  const rows = devices
    .slice()
    .sort((a, b) => {
      const an = displayName(a).toLowerCase();
      const bn = displayName(b).toLowerCase();
      return an.localeCompare(bn);
    })
    .map((d, i) => {
      const lan = d.web_ui_local || httpUrlForIp(d.ip);
      const statusClass =
        d.status === "online" ? "ok" : d.status === "offline" ? "bad" : "unk";
      return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="name">${esc(displayName(d))}</div>
          ${d.name && d.hostname ? `<div class="sub">${esc(d.hostname)}</div>` : ""}
        </td>
        <td><span class="badge ${statusClass}">${esc(d.status)}</span></td>
        <td class="mono">${esc(d.ip) || "—"}</td>
        <td class="mono">${esc(d.mac)}</td>
        <td>${esc(d.vendor) || "—"}</td>
        <td>${esc(d.type) || "—"}${d.icon ? ` <span class="sub">(${esc(d.icon)})</span>` : ""}</td>
        <td class="links">
          ${linkHtml("LAN", lan)}
          ${d.web_ui_external ? " · " + linkHtml("Ext", d.web_ui_external) : ""}
          ${d.ip ? " · " + linkHtml("HTTP", httpUrlForIp(d.ip)) : ""}
          ${d.ip ? " · " + linkHtml("HTTPS", `https://${d.ip}`) : ""}
        </td>
        <td class="notes">${esc(d.notes) || "—"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NetInventory — Device Report</title>
  <style>
    :root {
      --bg: #0a1628;
      --card: #0f2138;
      --text: #e8f0fa;
      --muted: #8aa0b8;
      --line: rgba(255,255,255,.1);
      --accent: #5eb0ff;
      --ok: #3dd68c;
      --bad: #f07178;
      --unk: #a8b4c4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(165deg, #061018 0%, #0a2744 50%, #073e77 100%);
      color: var(--text);
      min-height: 100vh;
      padding: 32px 20px 48px;
    }
    .wrap { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
      gap: 16px; margin-bottom: 28px;
    }
    .brand { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); opacity: .9; }
    h1 { margin: 6px 0 0; font-size: 28px; font-weight: 650; letter-spacing: -0.02em; }
    .meta { color: var(--muted); font-size: 13px; text-align: right; line-height: 1.5; }
    .stats {
      display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px;
    }
    .stat {
      background: rgba(0,0,0,.22);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px 18px;
      min-width: 120px;
      backdrop-filter: blur(12px);
    }
    .stat b { display: block; font-size: 22px; margin-top: 4px; }
    .stat span { font-size: 12px; color: var(--muted); }
    .card {
      background: rgba(8, 24, 44, .72);
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,.28);
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
      text-align: left; padding: 12px 14px; font-size: 11px; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted); background: rgba(0,0,0,.2);
      border-bottom: 1px solid var(--line);
    }
    td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: rgba(255,255,255,.03); }
    .name { font-weight: 600; }
    .sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
    .num { color: var(--muted); width: 36px; }
    .notes { max-width: 180px; color: var(--muted); font-size: 12px; }
    .links a {
      color: var(--accent); text-decoration: none; font-weight: 500;
    }
    .links a:hover { text-decoration: underline; }
    .muted { color: var(--muted); }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 600; text-transform: capitalize;
      border: 1px solid transparent;
    }
    .badge.ok { color: var(--ok); background: rgba(61,214,140,.12); border-color: rgba(61,214,140,.25); }
    .badge.bad { color: var(--bad); background: rgba(240,113,120,.12); border-color: rgba(240,113,120,.25); }
    .badge.unk { color: var(--unk); background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }
    footer {
      margin-top: 20px; font-size: 12px; color: var(--muted); text-align: center;
    }
    @media print {
      body { background: #fff; color: #111; padding: 12px; }
      .card { box-shadow: none; border-color: #ccc; background: #fff; }
      th { background: #f3f5f8; color: #445; }
      td { border-color: #e5e8ec; }
      .links a { color: #0652a8; }
      .badge.ok { color: #0a7a45; }
      .badge.bad { color: #b42318; }
      .meta, .brand, .sub, .notes, .muted, .num, footer { color: #666; }
      tr:hover td { background: transparent; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <div class="brand">qube.li · NetInventory</div>
        <h1>Device inventory report</h1>
      </div>
      <div class="meta">
        Generated ${esc(generated)}<br/>
        ${devices.length} device${devices.length === 1 ? "" : "s"}
      </div>
    </header>
    <div class="stats">
      <div class="stat"><span>Total</span><b>${devices.length}</b></div>
      <div class="stat"><span>Online</span><b>${online}</b></div>
      <div class="stat"><span>Offline / other</span><b>${devices.length - online}</b></div>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Status</th>
            <th>IP</th>
            <th>MAC</th>
            <th>Vendor</th>
            <th>Type</th>
            <th>Web UI</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="9" class="muted">No devices</td></tr>`}
        </tbody>
      </table>
    </div>
    <footer>NetInventory export · open LAN / Ext / HTTP links to device web interfaces</footer>
  </div>
</body>
</html>`;
}

export function downloadHtmlReport(devices: Device[], filename?: string) {
  const html = buildInventoryHtml(devices);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = filename || `netinventory-devices-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Opens a print-ready report window (user can Save as PDF). */
export function printPdfReport(devices: Device[]) {
  const html = buildInventoryHtml(devices);
  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Popup blocked — allow popups to export PDF");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Wait for layout, then print
  w.onload = () => {
    w.focus();
    w.print();
  };
  // Fallback if onload already fired
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
  }, 350);
}
