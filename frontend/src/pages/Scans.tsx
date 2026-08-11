import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import { SubnetSelect } from "../components/SubnetSelect";
import {
  btnPrimaryClassName,
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  fieldClassName,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import type { Scan, Settings } from "../types";

const POLL_MS = 2000;

/** Common private LAN ranges (RFC1918 + popular home routers) */
const SUBNET_PRESETS: { cidr: string; label: string; hint: string }[] = [
  { cidr: "192.168.1.0/24", label: "192.168.1.x", hint: "Most home routers" },
  { cidr: "192.168.0.0/24", label: "192.168.0.x", hint: "TP-Link / common default" },
  { cidr: "192.168.88.0/24", label: "192.168.88.x", hint: "MikroTik" },
  { cidr: "192.168.31.0/24", label: "192.168.31.x", hint: "Xiaomi / Redmi" },
  { cidr: "192.168.100.0/24", label: "192.168.100.x", hint: "Some ISPs / CPE" },
  { cidr: "10.0.0.0/24", label: "10.0.0.x", hint: "Corporate / Docker host" },
  { cidr: "10.0.1.0/24", label: "10.0.1.x", hint: "Alt 10.x LAN" },
  { cidr: "172.16.0.0/24", label: "172.16.0.x", hint: "Private 172.16" },
  { cidr: "172.17.0.0/24", label: "172.17.0.x", hint: "Docker bridge default" },
];

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as {
      detail?: string | { msg?: string }[];
    };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail.map((d) => d.msg).join("; ");
    }
  } catch {
    /* raw */
  }
  return `${fallback} (${err.status})`;
}

export function Scans() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOk, setToastOk] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scanSubnet, setScanSubnet] = useState("192.168.1.0/24");
  const [scanInterval, setScanInterval] = useState(0);
  const [scanPorts, setScanPorts] = useState("80,443,8080");
  const [quickPorts, setQuickPorts] = useState("22,80,443,445,3389,8080,8443");
  const [uiBackground, setUiBackground] = useState<Settings["ui_background"]>("default");
  const [savedFingerprint, setSavedFingerprint] = useState("");

  const pollRef = useRef<number | null>(null);

  const fingerprint = `${scanSubnet.trim()}|${scanInterval}|${scanPorts.trim()}|${quickPorts.trim()}`;
  const dirty = fingerprint !== savedFingerprint && savedFingerprint !== "";

  const loadScans = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const list = await apiFetch<Scan[]>("/api/scans");
      setScans(list);
      return list;
    } catch (err) {
      if (!silent) {
        setError(parseApiError(err, "Failed to load scans"));
      }
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const s = await apiFetch<Settings>("/api/settings");
      setScanSubnet(s.scan_subnet);
      setScanInterval(s.scan_interval_minutes);
      setScanPorts(s.scan_ports);
      setQuickPorts(s.quick_ports);
      setUiBackground(s.ui_background);
      setSavedFingerprint(
        `${s.scan_subnet.trim()}|${s.scan_interval_minutes}|${s.scan_ports.trim()}|${s.quick_ports.trim()}`,
      );
    } catch (err) {
      setError(parseApiError(err, "Failed to load scan settings"));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
    void loadSettings();
  }, [loadScans, loadSettings]);

  const hasRunning = scans.some((s) => s.status === "running");
  const lastScan = scans[0] ?? null;

  useEffect(() => {
    if (!hasRunning) {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(() => {
      void loadScans(true);
    }, POLL_MS);
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunning, loadScans]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  function showToast(message: string, ok = true) {
    setToast(message);
    setToastOk(ok);
  }

  async function saveSettings(silent = false): Promise<boolean> {
    setSaving(true);
    if (!silent) setError(null);
    try {
      const updated = await apiFetch<Settings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          scan_subnet: scanSubnet.trim(),
          scan_interval_minutes: Number(scanInterval),
          scan_ports: scanPorts.trim(),
          quick_ports: quickPorts.trim(),
          ui_background: uiBackground,
        }),
      });
      setScanSubnet(updated.scan_subnet);
      setScanInterval(updated.scan_interval_minutes);
      setScanPorts(updated.scan_ports);
      setQuickPorts(updated.quick_ports);
      setUiBackground(updated.ui_background);
      setSavedFingerprint(
        `${updated.scan_subnet.trim()}|${updated.scan_interval_minutes}|${updated.scan_ports.trim()}|${updated.quick_ports.trim()}`,
      );
      if (!silent) showToast("Scan settings saved");
      return true;
    } catch (err) {
      setError(parseApiError(err, "Could not save settings"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function startScan() {
    setStarting(true);
    setError(null);
    try {
      // Always persist current form before scan so chosen subnet is used
      const ok = await saveSettings(true);
      if (!ok) return;

      await apiFetch<Scan>("/api/scans", { method: "POST" });
      showToast(`Scan started on ${scanSubnet.trim()}`);
      await loadScans(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast("A scan is already running", false);
        await loadScans(true);
      } else {
        setError(parseApiError(err, "Could not start scan"));
      }
    } finally {
      setStarting(false);
    }
  }

  const statusLabel = hasRunning
    ? "Scanning"
    : lastScan?.status === "failed"
      ? "Last failed"
      : lastScan
        ? "Ready"
        : "Ready";

  const statusTone = hasRunning
    ? "bg-sky-400/20 text-sky-100 ring-sky-300/30"
    : lastScan?.status === "failed"
      ? "bg-red-400/20 text-red-100 ring-red-300/30"
      : "bg-emerald-400/15 text-emerald-100 ring-emerald-300/25";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Scans"
        description="Choose a subnet and run discovery — history below"
      />

      {toast && (
        <div
          className={`rounded-[12px] border px-4 py-3 text-sm ${
            toastOk
              ? "border-sky-400/30 bg-sky-500/15 text-sky-100"
              : "border-amber-400/30 bg-amber-500/15 text-amber-100"
          }`}
          role="status"
        >
          {toast}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* ── Network scan control panel ── */}
      <section className="glass-card relative overflow-visible p-0">
        {/* subtle top accent */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-gradient-to-r from-transparent via-sky-300/40 to-transparent"
          aria-hidden
        />
        <div className="relative z-[1] border-b border-white/[0.08] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 ring-1 ring-sky-300/25">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  className="text-sky-200"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white/95">
                  Network scan
                </h2>
                <p className="mt-0.5 text-sm text-white/55">
                  Ping sweep + ARP table · reverse DNS for hostnames
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusTone}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasRunning ? "animate-pulse bg-sky-300" : "bg-current opacity-70"
                }`}
              />
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="relative z-[1] overflow-visible px-5 py-5 sm:px-6">
          {settingsLoading ? (
            <LoadingState label="Loading scan settings…" />
          ) : (
            <div className="flex flex-col gap-5 overflow-visible">
              <div className="grid gap-4 overflow-visible sm:grid-cols-2 lg:grid-cols-12">
                <div className="relative z-20 flex flex-col gap-1.5 overflow-visible sm:col-span-2 lg:col-span-5">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Subnet (CIDR)
                  </span>
                  <SubnetSelect
                    value={scanSubnet}
                    onChange={setScanSubnet}
                    presets={SUBNET_PRESETS}
                  />
                  <span className="text-[11px] text-white/40">
                    Presets + custom range in one menu
                  </span>
                </div>

                <label className="flex flex-col gap-1.5 lg:col-span-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Auto interval
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={scanInterval}
                      onChange={(e) => setScanInterval(Number(e.target.value))}
                      className={fieldClassName}
                      aria-label="Scan interval minutes"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
                      min
                    </span>
                  </div>
                  <span className="text-xs text-white/40">0 = only manual scans</span>
                </label>

                <label className="flex flex-col gap-1.5 lg:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Quick ports
                  </span>
                  <input
                    type="text"
                    value={quickPorts}
                    onChange={(e) => setQuickPorts(e.target.value)}
                    placeholder="22,80,443,445,3389,8080,8443"
                    spellCheck={false}
                    className={`${fieldClassName} font-mono`}
                    aria-label="Quick ports"
                  />
                  <span className="text-xs text-white/40">After each scan</span>
                </label>

                <label className="flex flex-col gap-1.5 lg:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/45">
                    Full ports
                  </span>
                  <input
                    type="text"
                    value={scanPorts}
                    onChange={(e) => setScanPorts(e.target.value)}
                    placeholder="80,443,8080"
                    spellCheck={false}
                    className={`${fieldClassName} font-mono`}
                    aria-label="Full ports"
                  />
                  <span className="text-xs text-white/40">Manual deep scan</span>
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-h-[2.5rem] text-sm text-white/55">
                  {lastScan ? (
                    <p>
                      Last scan:{" "}
                      <span className="text-white/80">
                        <StatusBadge status={lastScan.status} />
                      </span>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="font-mono text-white/70">{lastScan.subnet}</span>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="text-white/80">{lastScan.devices_found}</span> found
                      {lastScan.new_devices > 0 && (
                        <>
                          <span className="mx-1.5 text-white/30">·</span>
                          <span className="text-emerald-200/90">{lastScan.new_devices} new</span>
                        </>
                      )}
                      <span className="mx-1.5 text-white/30">·</span>
                      <span className="text-white/50">{formatDateTime(lastScan.started_at)}</span>
                    </p>
                  ) : (
                    <p className="text-white/45">No scans yet — pick a subnet and start.</p>
                  )}
                  {dirty && (
                    <p className="mt-1 text-xs text-amber-200/80">Unsaved changes — will apply on Start or Save</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || starting || !dirty}
                    onClick={() => void saveSettings()}
                    className={btnSecondaryClassName}
                  >
                    {saving && !starting ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void startScan()}
                    disabled={starting || hasRunning || settingsLoading}
                    className={`${btnPrimaryClassName} min-w-[140px] gap-2 bg-gradient-to-b from-sky-400/25 to-sky-500/10 ring-1 ring-sky-300/25 hover:from-sky-400/35`}
                  >
                    {starting || hasRunning ? (
                      <>
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white/90" />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.2-3.2" />
                        </svg>
                        Start scan
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── History ── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white/50">
            History
          </h2>
          {scans.length > 0 && (
            <span className="text-xs text-white/40">{scans.length} run{scans.length === 1 ? "" : "s"}</span>
          )}
        </div>

        {loading && <LoadingState label="Loading scan history…" />}

        {!loading && scans.length === 0 && (
          <EmptyState
            title="No scans yet"
            hint="Set the subnet above and click Start scan."
          />
        )}

        {!loading && scans.length > 0 && (
          <GlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Finished</th>
                    <th className="px-4 py-3 font-medium">Subnet</th>
                    <th className="px-4 py-3 font-medium">Found</th>
                    <th className="px-4 py-3 font-medium">New</th>
                    <th className="px-4 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {scans.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-white/85">
                        {formatDateTime(s.started_at)}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {formatDateTime(s.finished_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-white/80">{s.subnet}</td>
                      <td className="px-4 py-3 text-white/85">{s.devices_found}</td>
                      <td className="px-4 py-3 text-white/85">{s.new_devices}</td>
                      <td
                        className="max-w-xs truncate px-4 py-3 text-red-200/90"
                        title={s.error_message ?? undefined}
                      >
                        {s.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </section>
    </div>
  );
}
