import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import {
  btnPrimaryClassName,
  EmptyState,
  ErrorBanner,
  formatDateTime,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import type { Scan } from "../types";

const POLL_MS = 2000;

export function Scans() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

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
        setError(
          err instanceof ApiError
            ? `Failed to load scans (${err.status})`
            : "Failed to load scans",
        );
      }
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  const hasRunning = scans.some((s) => s.status === "running");

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
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function startScan() {
    setStarting(true);
    setError(null);
    setToast(null);
    try {
      await apiFetch<Scan>("/api/scans", { method: "POST" });
      setToast("Scan started");
      await loadScans(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setToast("A scan is already running");
        await loadScans(true);
      } else {
        setError(
          err instanceof ApiError
            ? `Could not start scan (${err.status})`
            : "Could not start scan",
        );
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Scans"
        description="Manual scan trigger and history"
        actions={
          <button
            type="button"
            onClick={startScan}
            disabled={starting || hasRunning}
            className={btnPrimaryClassName}
          >
            {starting || hasRunning ? "Scanning…" : "Start Scan"}
          </button>
        }
      />

      {toast && (
        <div
          className="mb-4 rounded-md border border-sky-400/30 bg-sky-500/15 px-4 py-3 text-sm text-sky-100"
          role="status"
        >
          {toast}
        </div>
      )}

      {loading && <LoadingState label="Loading scan history…" />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && scans.length === 0 && (
        <EmptyState
          title="No scans yet"
          hint="Click Start Scan to discover devices on the configured subnet."
        />
      )}

      {!loading && scans.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/12 bg-black/12 backdrop-blur-[20px]">
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
                  <td className="px-4 py-3 text-white/85">{formatDateTime(s.started_at)}</td>
                  <td className="px-4 py-3 text-white/70">{formatDateTime(s.finished_at)}</td>
                  <td className="px-4 py-3 font-mono text-white/80">{s.subnet}</td>
                  <td className="px-4 py-3 text-white/85">{s.devices_found}</td>
                  <td className="px-4 py-3 text-white/85">{s.new_devices}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-red-200/90" title={s.error_message ?? undefined}>
                    {s.error_message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
