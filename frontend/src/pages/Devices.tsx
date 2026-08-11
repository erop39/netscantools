import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  btnPrimaryClassName,
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  fieldClassName,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import { deviceLabel } from "../lib/deviceLabel";
import { DeviceIcon } from "../lib/deviceIcons";
import { downloadHtmlReport, printPdfReport } from "../lib/exportReport";
import { httpUrlForIp, httpsUrlForIp, openExternal } from "../lib/links";
import type {
  Device,
  PingResult,
  ResolveAllResult,
  ResolveResult,
} from "../types";

type ActionState = { kind: "ping" | "resolve" | "rename"; text: string; ok?: boolean };

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<Record<number, ActionState>>({});
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function loadDevices() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const qs = params.toString();
      const list = await apiFetch<Device[]>(`/api/devices${qs ? `?${qs}` : ""}`);
      setDevices(list);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Failed to load devices (${err.status})`
          : "Failed to load devices",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  async function onPing(d: Device) {
    if (!d.ip) return;
    setBusyId(d.id);
    try {
      const r = await apiFetch<PingResult>(`/api/devices/${d.id}/ping`, { method: "POST" });
      setActionMsg((m) => ({
        ...m,
        [d.id]: { kind: "ping", text: r.message, ok: r.ok },
      }));
      setDevices((list) =>
        list.map((x) => (x.id === d.id ? { ...x, status: r.ok ? "online" : "offline" } : x)),
      );
    } catch (err) {
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "ping",
          text: err instanceof ApiError ? `Ping failed (${err.status})` : "Ping failed",
          ok: false,
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function onResolve(d: Device) {
    if (!d.ip) return;
    setBusyId(d.id);
    try {
      const r = await apiFetch<ResolveResult>(`/api/devices/${d.id}/resolve`, {
        method: "POST",
      });
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "resolve",
          text: r.hostname ? `DNS → ${r.hostname}` : "No PTR record",
          ok: Boolean(r.hostname),
        },
      }));
      if (r.device) {
        setDevices((list) => list.map((x) => (x.id === d.id ? r.device : x)));
      }
    } catch (err) {
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "resolve",
          text: err instanceof ApiError ? `Resolve failed (${err.status})` : "Resolve failed",
          ok: false,
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function onResolveAll() {
    setBulkBusy(true);
    setBanner(null);
    setError(null);
    try {
      const r = await apiFetch<ResolveAllResult>("/api/devices/resolve-all", {
        method: "POST",
      });
      setDevices(r.devices);
      setBanner(
        `Resolve all: ${r.resolved} of ${r.total} hosts got a DNS name` +
          (r.failed ? ` (${r.failed} without PTR)` : ""),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Resolve all failed (${err.status})`
          : "Resolve all failed",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function startRename(d: Device) {
    setRenamingId(d.id);
    setRenameValue(d.name ?? "");
  }

  async function saveRename(d: Device) {
    setBusyId(d.id);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() || null }),
      });
      setDevices((list) => list.map((x) => (x.id === d.id ? updated : x)));
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "rename",
          text: updated.name ? `Named “${updated.name}”` : "Name cleared",
          ok: true,
        },
      }));
      setRenamingId(null);
    } catch (err) {
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "rename",
          text: err instanceof ApiError ? `Rename failed (${err.status})` : "Rename failed",
          ok: false,
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  function onExportHtml() {
    downloadHtmlReport(devices);
    setBanner("HTML report downloaded");
  }

  function onExportPdf() {
    try {
      printPdfReport(devices);
      setBanner("Print dialog opened — choose “Save as PDF”");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF export failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Devices"
        description="Inventory — open web UI, ping, resolve DNS, rename, export"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy || devices.length === 0}
              onClick={() => void onResolveAll()}
              className={btnSecondaryClassName + " h-[40px]"}
              title="Reverse-DNS all devices with an IP"
            >
              {bulkBusy ? "Resolving…" : "Resolve all"}
            </button>
            <button
              type="button"
              disabled={devices.length === 0}
              onClick={onExportHtml}
              className={btnSecondaryClassName + " h-[40px]"}
            >
              Export HTML
            </button>
            <button
              type="button"
              disabled={devices.length === 0}
              onClick={onExportPdf}
              className={btnPrimaryClassName + " h-[40px]"}
            >
              Export PDF
            </button>
          </div>
        }
      />

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
        }}
      >
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${fieldClassName} h-[40px] w-auto min-w-[120px]`}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="unknown">Unknown</option>
        </select>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, IP, MAC, host…"
          className={`${fieldClassName} h-[40px] w-56`}
        />
        <button type="submit" className={btnSecondaryClassName + " h-[40px]"}>
          Search
        </button>
      </form>

      {loading && <LoadingState label="Loading devices…" />}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {banner && (
        <div
          className="mb-4 rounded-[12px] border border-sky-400/30 bg-sky-500/15 px-4 py-3 text-sm text-sky-100"
          role="status"
        >
          {banner}
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <EmptyState
          title="No devices found"
          hint="Run a network scan from the Scans page to populate inventory."
        />
      )}

      {!loading && !error && devices.length > 0 && (
        <div className="glass-card data-table-wrap overflow-x-auto p-0">
          <table className="data-table min-w-full text-left">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">MAC</th>
                <th className="px-4 py-3 font-medium">DNS host</th>
                <th className="px-4 py-3 font-medium">Open</th>
                <th className="px-4 py-3 font-medium">Tools</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {devices.map((d) => {
                const http = httpUrlForIp(d.ip);
                const https = httpsUrlForIp(d.ip);
                const msg = actionMsg[d.id];
                const busy = busyId === d.id || bulkBusy;
                const isRenaming = renamingId === d.id;
                return (
                  <tr key={d.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3">
                      {isRenaming ? (
                        <div className="flex min-w-[160px] flex-col gap-1.5">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename(d);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            placeholder="Friendly name"
                            className={`${fieldClassName} h-[36px]`}
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className={btnSecondaryClassName}
                              disabled={busy}
                              onClick={() => void saveRename(d)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={btnSecondaryClassName}
                              onClick={() => setRenamingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="device-avatar">
                            <DeviceIcon name={d.icon} size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white/90">
                              {deviceLabel(d)}
                            </div>
                            {d.name && d.hostname && (
                              <div className="truncate text-[11px] text-white/40">
                                {d.hostname}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/70">{d.type ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-white/90">{d.ip ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-white/70">{d.mac}</td>
                    <td className="px-4 py-3 text-white/70">{d.hostname ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={!d.web_ui_local}
                          onClick={() => openExternal(d.web_ui_local)}
                          className={btnSecondaryClassName}
                          title={d.web_ui_local ?? "No LAN URL"}
                        >
                          LAN
                        </button>
                        <button
                          type="button"
                          disabled={!d.web_ui_external}
                          onClick={() => openExternal(d.web_ui_external)}
                          className={btnSecondaryClassName}
                          title={d.web_ui_external ?? "No external URL"}
                        >
                          Ext
                        </button>
                        <button
                          type="button"
                          disabled={!http}
                          onClick={() => openExternal(http)}
                          className={btnSecondaryClassName}
                        >
                          HTTP
                        </button>
                        <button
                          type="button"
                          disabled={!https}
                          onClick={() => openExternal(https)}
                          className={btnSecondaryClassName}
                        >
                          HTTPS
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={!d.ip || busy}
                            onClick={() => void onPing(d)}
                            className={btnSecondaryClassName}
                          >
                            Ping
                          </button>
                          <button
                            type="button"
                            disabled={!d.ip || busy}
                            onClick={() => void onResolve(d)}
                            className={btnSecondaryClassName}
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startRename(d)}
                            className={btnSecondaryClassName}
                          >
                            Rename
                          </button>
                        </div>
                        {msg && (
                          <span
                            className={`text-[11px] ${
                              msg.ok === false
                                ? "text-red-200/90"
                                : msg.ok
                                  ? "text-emerald-200/90"
                                  : "text-white/50"
                            }`}
                          >
                            {msg.text}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/devices/${d.id}`}
                        className="text-sky-300/90 hover:text-sky-200"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
