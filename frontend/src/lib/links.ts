/** Build openable URLs for a discovered device. */

export function ensureHttpUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

export function openExternal(url: string | null | undefined) {
  if (!url) return;
  const href = ensureHttpUrl(url);
  window.open(href, "_blank", "noopener,noreferrer");
}

export function httpUrlForIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return `http://${ip}`;
}

export function httpsUrlForIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return `https://${ip}`;
}
