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
