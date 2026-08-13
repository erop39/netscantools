/** Risky TCP ports — keep in sync with backend `app.services.scoring.RISKY_PORTS`. */
export const RISKY_PORTS = new Set([21, 23, 135, 139, 445, 3389, 5900]);

/** CSS class for security score color: ≥80 green, 50–79 amber, <50 red. */
export function scoreClass(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "score-muted";
  if (score >= 80) return "score-good";
  if (score >= 50) return "score-warn";
  return "score-bad";
}

export function hasRiskyOpenPort(
  openPorts: { port: number }[] | null | undefined,
): boolean {
  if (!openPorts?.length) return false;
  return openPorts.some((p) => RISKY_PORTS.has(p.port));
}

/** Tone class for event / notification types (distinct new vs offline vs port). */
export function eventTone(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "new_device") return "is-new";
  if (t === "device_offline" || t === "went_offline") return "is-offline";
  if (t === "port_opened") return "is-port-open";
  if (t === "port_closed") return "is-port-closed";
  if (t === "ip_changed") return "is-ip-change";
  if (t === "share_found") return "is-share-found";
  if (t === "share_gone") return "is-share-gone";
  return "is-neutral";
}

const EVENT_LABELS: Record<string, string> = {
  new_device: "New device",
  device_offline: "Went offline",
  went_offline: "Went offline",
  ip_changed: "IP changed",
  port_opened: "Port opened",
  port_closed: "Port closed",
  share_found: "Share found",
  share_gone: "Share gone",
  came_online: "Came online",
};

export function eventTypeLabel(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t && EVENT_LABELS[t]) return EVENT_LABELS[t];
  return (type ?? "event").replace(/_/g, " ");
}

/** Port number from event details, if any. */
export function eventPort(
  details: Record<string, unknown> | null | undefined,
): number | null {
  if (!details || typeof details !== "object") return null;
  const p = details.port;
  return typeof p === "number" && Number.isFinite(p) ? p : null;
}
