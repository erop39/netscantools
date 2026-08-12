/**
 * Client-side time: API stores UTC; UI shows the PC / user timezone.
 */

const TZ_STORAGE_KEY = "netpad_timezone"; // "system" | IANA name

/** IANA zone from OS (e.g. Europe/Moscow). */
export function getSystemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Active display zone: system (default) or user override. */
export function getUserTimeZone(): string {
  try {
    const saved = localStorage.getItem(TZ_STORAGE_KEY);
    if (saved && saved !== "system") return saved;
  } catch {
    /* ignore */
  }
  return getSystemTimeZone();
}

export function setUserTimeZone(tz: string): void {
  try {
    if (!tz || tz === "system") {
      localStorage.removeItem(TZ_STORAGE_KEY);
    } else {
      localStorage.setItem(TZ_STORAGE_KEY, tz);
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("netpad-timezone-change"));
}

export function isSystemTimeZone(): boolean {
  try {
    const saved = localStorage.getItem(TZ_STORAGE_KEY);
    return !saved || saved === "system";
  } catch {
    return true;
  }
}

/**
 * Parse API datetime. Naive ISO (no Z/offset) is treated as UTC
 * because the backend stores UTC and SQLite may strip tzinfo.
 */
export function parseApiDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  let s = String(value).trim();
  if (!s) return null;
  // "2026-08-12 10:00:00" → ISO
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) {
    s = s.replace(" ", "T");
  }
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !hasZone) {
    s = `${s}Z`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(
  d: Date,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: getUserTimeZone(),
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** Date + time in the user PC timezone. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parseApiDate(value);
  if (!d) return "—";
  return fmt(d, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Date only. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = parseApiDate(value);
  if (!d) return "—";
  return fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Short time. */
export function formatTime(value: string | Date | null | undefined): string {
  const d = parseApiDate(value);
  if (!d) return "—";
  return fmt(d, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** e.g. GMT+3 or MSK — for labels next to timestamps. */
export function formatTimeZoneLabel(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone: getUserTimeZone(),
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || getUserTimeZone();
  } catch {
    return getUserTimeZone();
  }
}

/** Offset string like UTC+03:00 for the active zone. */
export function formatUtcOffset(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: getUserTimeZone(),
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name) return name.replace("GMT", "UTC");
  } catch {
    /* fall through */
  }
  // Fallback: compute offset minutes in that zone via format
  try {
    const local = new Date(
      date.toLocaleString("en-US", { timeZone: getUserTimeZone() }),
    );
    const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const diffMin = Math.round((local.getTime() - utc.getTime()) / 60000);
    const sign = diffMin >= 0 ? "+" : "-";
    const abs = Math.abs(diffMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `UTC${sign}${hh}:${mm}`;
  } catch {
    return "UTC";
  }
}

/** Milliseconds between two API datetimes (or now). */
export function diffMs(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const a = parseApiDate(start);
  if (!a) return null;
  const b = end ? parseApiDate(end) : new Date();
  if (!b) return null;
  return b.getTime() - a.getTime();
}

/** Clock skew: server_unix_ms − Date.now() (positive = server ahead). */
export function clockSkewMs(serverUnixMs: number): number {
  return serverUnixMs - Date.now();
}

export function formatSkew(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 2000) return "in sync (<2s)";
  const sec = Math.round(abs / 1000);
  const dir = ms > 0 ? "server ahead" : "PC ahead";
  if (sec < 60) return `${dir} by ${sec}s`;
  const m = Math.round(sec / 60);
  return `${dir} by ~${m}m`;
}
