import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import { DeviceLink } from "../components/DeviceLink";
import {
  btnPrimaryClassName,
  EmptyState,
  ErrorBanner,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
  StatCard,
} from "../components/ui";
import {
  eventPort,
  eventTone,
  eventTypeLabel,
  RISKY_PORTS,
  scoreClass,
} from "../lib/hygiene";
import type { ChecklistItem, DeviceEvent, HygieneSummary } from "../types";

function eventDetailsText(ev: DeviceEvent): string | null {
  if (!ev.details || typeof ev.details !== "object") return null;
  const parts: string[] = [];
  const d = ev.details;
  // Port shown as pill next to type — skip duplicate in details
  if (typeof d.old_ip === "string" || typeof d.new_ip === "string") {
    parts.push(`${String(d.old_ip ?? "—")} → ${String(d.new_ip ?? "—")}`);
  }
  if (typeof d.ip === "string") parts.push(String(d.ip));
  if (typeof d.message === "string") parts.push(String(d.message));
  if (parts.length === 0 && typeof d.port !== "number") {
    try {
      const s = JSON.stringify(d);
      return s === "{}" ? null : s;
    } catch {
      return null;
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

function riskLabel(r: HygieneSummary["top_risks"][number]): string {
  if (r.name?.trim()) return r.name.trim();
  if (r.ip) return r.ip;
  return r.mac;
}

export function Hygiene() {
  const [summary, setSummary] = useState<HygieneSummary | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanOk, setScanOk] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [patchingId, setPatchingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hygiene, items] = await Promise.all([
        apiFetch<HygieneSummary>("/api/hygiene"),
        apiFetch<ChecklistItem[]>("/api/hygiene/checklist"),
      ]);
      setSummary(hygiene);
      setChecklist(items);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Failed to load hygiene (${err.status})`
          : "Failed to load hygiene",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggleChecklist(item: ChecklistItem) {
    const next = !item.checked;
    setPatchingId(item.id);
    // Optimistic update
    setChecklist((prev) =>
      prev.map((c) =>
        c.id === item.id
          ? {
              ...c,
              checked: next,
              checked_at: next ? new Date().toISOString() : null,
            }
          : c,
      ),
    );
    try {
      const updated = await apiFetch<ChecklistItem>(
        `/api/hygiene/checklist/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ checked: next }),
        },
      );
      setChecklist((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      // Revert on failure
      setChecklist((prev) =>
        prev.map((c) => (c.id === item.id ? item : c)),
      );
      setError(
        err instanceof ApiError
          ? `Could not update checklist (${err.status})`
          : "Could not update checklist",
      );
    } finally {
      setPatchingId(null);
    }
  }

  async function onScanPortsAll() {
    setScanning(true);
    setScanMsg(null);
    setScanOk(null);
    try {
      const result = await apiFetch<{
        total: number;
        scanned: number;
        ok: number;
        failed: number;
      }>("/api/hygiene/scan-ports", { method: "POST" });
      setScanMsg(
        `Scanned ${result.scanned}/${result.total} online · ${result.ok} ok` +
          (result.failed ? ` · ${result.failed} failed` : ""),
      );
      setScanOk(true);
      // Refresh scores / risks after bulk probe
      try {
        const hygiene = await apiFetch<HygieneSummary>("/api/hygiene");
        setSummary(hygiene);
      } catch {
        /* best-effort */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setScanMsg("Scan already running — try again shortly");
      } else {
        setScanMsg(
          err instanceof ApiError
            ? `Port scan failed (${err.status})`
            : "Port scan failed",
        );
      }
      setScanOk(false);
    } finally {
      setScanning(false);
    }
  }

  const checkedCount = checklist.filter((c) => c.checked).length;
  const checklistPct =
    checklist.length === 0 ? 0 : Math.round((checkedCount / checklist.length) * 100);

  return (
    <div>
      <PageHeader
        title="Hygiene"
        description="Network health and security checklist"
        actions={
          <button
            type="button"
            className={btnPrimaryClassName}
            disabled={scanning || loading}
            onClick={() => void onScanPortsAll()}
          >
            {scanning ? "Scanning ports…" : "Scan ports (all online)"}
          </button>
        }
      />

      {loading && <LoadingState label="Loading hygiene…" />}
      {error && <ErrorBanner message={error} />}
      {scanMsg && (
        <div
          className={`banner ${scanOk === false ? "banner-error" : "banner-success"} mb-4`}
          role="status"
        >
          {scanMsg}
        </div>
      )}

      {!loading && !error && summary && (
        <div className="flex flex-col gap-4">
          {/* Network score */}
          {summary.network_score != null ? (
            <GlassCard className="!py-6">
              <p className="stat-label">Network score</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span
                  className={`hygiene-score text-5xl font-bold tracking-tight ${scoreClass(
                    summary.network_score,
                  )}`}
                >
                  {Math.round(summary.network_score)}
                </span>
                <span className="pb-1.5 text-sm text-white/45">
                  mean of scored online devices · 0–100
                </span>
              </div>
            </GlassCard>
          ) : (
            <EmptyState
              title="No network score yet"
              hint="Run a scan so devices get security scores."
            />
          )}

          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Online" value={summary.counts.online} success />
            <StatCard
              label="New (24h)"
              value={summary.counts.new_24h}
              hint="first seen within 24 hours"
            />
            <StatCard
              label="Risky devices"
              value={summary.counts.risky_devices}
              hint="security score below threshold"
            />
            <StatCard label="Offline" value={summary.counts.offline} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Top risks */}
            <GlassCard>
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-white/95">
                Top risks
              </h2>
              {summary.top_risks.length === 0 ? (
                <EmptyState
                  title="No risky devices"
                  hint="Devices with lower security scores will appear here."
                />
              ) : (
                <ul className="divide-y divide-white/8">
                  {summary.top_risks.map((r) => (
                    <li key={r.device_id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <DeviceLink
                          id={r.device_id}
                          name={riskLabel(r)}
                          className="device-link truncate text-sm font-medium"
                        />
                        <p className="mt-0.5 truncate font-mono text-xs text-white/45">
                          {r.ip ?? "—"} · {r.mac}
                        </p>
                      </div>
                      <span
                        className={`hygiene-score shrink-0 text-sm ${scoreClass(
                          r.security_score,
                        )}`}
                      >
                        {r.security_score != null ? r.security_score : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            {/* Recent events */}
            <GlassCard>
              <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-white/95">
                Recent events
              </h2>
              {summary.recent_events.length === 0 ? (
                <EmptyState
                  title="No recent events"
                  hint="Device changes and port activity will show up here."
                />
              ) : (
                <ul className="detail-timeline hygiene-recent-events">
                  {summary.recent_events.map((ev) => {
                    const extra = eventDetailsText(ev);
                    const port = eventPort(ev.details);
                    const riskyPort = port != null && RISKY_PORTS.has(port);
                    return (
                      <li key={ev.id} className="detail-timeline-item">
                        <div className="detail-timeline-head">
                          <span className={`event-type ${eventTone(ev.type)}`}>
                            {eventTypeLabel(ev.type)}
                          </span>
                          {port != null && (
                            <span
                              className={
                                riskyPort ? "port-pill is-risk" : "port-pill"
                              }
                            >
                              {port}
                            </span>
                          )}
                        </div>
                        <span className="detail-timeline-time">
                          {formatDateTime(ev.created_at)}
                        </span>
                        {ev.device_id != null && (
                          <DeviceLink
                            id={ev.device_id}
                            name={ev.device_name}
                            className="device-link text-sm font-medium"
                          />
                        )}
                        {extra && (
                          <span className="detail-timeline-details">{extra}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassCard>
          </div>

          {/* Checklist */}
          <GlassCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-white/95">
                Security checklist
              </h2>
              {checklist.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <span>
                    {checkedCount}/{checklist.length} done
                  </span>
                  <span
                    className={`hygiene-chip ${
                      checklistPct >= 80
                        ? "score-good"
                        : checklistPct >= 50
                          ? "score-warn"
                          : "score-muted"
                    }`}
                  >
                    {checklistPct}%
                  </span>
                </div>
              )}
            </div>

            {checklist.length > 0 && (
              <div
                className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={checklistPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Checklist progress"
              >
                <div
                  className="h-full rounded-full bg-emerald-400/70 transition-[width] duration-300"
                  style={{ width: `${checklistPct}%` }}
                />
              </div>
            )}

            {checklist.length === 0 ? (
              <EmptyState
                title="No checklist items"
                hint="Checklist will appear after first load."
              />
            ) : (
              <ul className="divide-y divide-white/8">
                {checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-white/25 bg-white/5 text-emerald-500 focus:ring-emerald-400/40"
                        checked={item.checked}
                        disabled={patchingId === item.id}
                        onChange={() => void onToggleChecklist(item)}
                        aria-label={item.label}
                      />
                      <span
                        className={`text-sm ${
                          item.checked
                            ? "text-white/50 line-through"
                            : "text-white/85"
                        }`}
                      >
                        {item.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
