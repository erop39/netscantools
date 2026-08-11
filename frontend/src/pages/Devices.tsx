import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import { DarkSelect } from "../components/DarkSelect";
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
import { DeviceIconTrigger } from "../components/DeviceIconTrigger";
import { deviceLabel } from "../lib/deviceLabel";
import { typeFromIcon, type DeviceIconKey } from "../lib/deviceIcons";
import { downloadHtmlReport, printPdfReport } from "../lib/exportReport";
import { hasRiskyOpenPort, scoreClass } from "../lib/hygiene";
import { httpUrlForIp, openExternal } from "../lib/links";
import type {
  Device,
  PingResult,
  ResolveAllResult,
  ResolveResult,
} from "../types";

type ActionState = { kind: "ping" | "resolve" | "rename" | "icon"; text: string; ok?: boolean };

/** Compact square tool button for the actions column */
function ToolBtn({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="dev-tool-btn"
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

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
        list.map((x) =>
          x.id === d.id
            ? {
                ...x,
                status: r.ok ? "online" : "offline",
                latency_ms: r.ok && r.rtt_ms != null ? r.rtt_ms : x.latency_ms,
              }
            : x,
        ),
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

  async function onSetIcon(d: Device, icon: DeviceIconKey | null) {
    setBusyId(d.id);
    const nextType = typeFromIcon(icon);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${d.id}`, {
        method: "PATCH",
        // Icon and equipment type stay in sync
        body: JSON.stringify({ icon, type: nextType }),
      });
      setDevices((list) => list.map((x) => (x.id === d.id ? updated : x)));
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "icon",
          text: icon
            ? `Icon → ${icon}${nextType ? ` · type ${nextType}` : ""}`
            : "Icon & type cleared",
          ok: true,
        },
      }));
    } catch (err) {
      setActionMsg((m) => ({
        ...m,
        [d.id]: {
          kind: "icon",
          text: err instanceof ApiError ? `Icon update failed (${err.status})` : "Icon update failed",
          ok: false,
        },
      }));
      throw err;
    } finally {
      setBusyId(null);
    }
  }

  function primaryOpenUrl(d: Device): string | null {
    return d.web_ui_local || d.web_ui_external || httpUrlForIp(d.ip);
  }

  return (
    <div className="devices-page">
      <PageHeader
        title="Devices"
        description="Network inventory"
        actions={
          <div className="devices-header-actions">
            <button
              type="button"
              disabled={bulkBusy || devices.length === 0}
              onClick={() => void onResolveAll()}
              className={btnSecondaryClassName}
              title="Reverse-DNS all devices with an IP"
            >
              {bulkBusy ? "Resolving…" : "Resolve all"}
            </button>
            <button
              type="button"
              disabled={devices.length === 0}
              onClick={() => {
                downloadHtmlReport(devices);
                setBanner("HTML report downloaded");
              }}
              className={btnSecondaryClassName}
            >
              HTML
            </button>
            <button
              type="button"
              disabled={devices.length === 0}
              onClick={() => {
                try {
                  printPdfReport(devices);
                  setBanner("Print dialog opened — choose “Save as PDF”");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "PDF export failed");
                }
              }}
              className={btnPrimaryClassName}
            >
              PDF
            </button>
          </div>
        }
      />

      <form
        className="devices-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
        }}
      >
        <DarkSelect
          value={status}
          onChange={setStatus}
          className="dark-dd--compact devices-filter"
          aria-label="Filter by status"
          options={[
            { value: "", label: "All statuses" },
            { value: "online", label: "Online" },
            { value: "offline", label: "Offline" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, IP, MAC, host…"
          className={`${fieldClassName} devices-search`}
          aria-label="Search devices"
        />
        <button type="submit" className={btnSecondaryClassName + " shrink-0"}>
          Search
        </button>
        {!loading && (
          <span className="devices-count" aria-live="polite">
            {devices.length} device{devices.length === 1 ? "" : "s"}
          </span>
        )}
      </form>

      {loading && <LoadingState label="Loading devices…" />}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {banner && (
        <div className="devices-banner" role="status">
          {banner}
          <button type="button" className="devices-banner-dismiss" onClick={() => setBanner(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {!loading && !error && devices.length === 0 && (
        <EmptyState
          title="No devices found"
          hint="Run a network scan from the Scans page to populate inventory."
        />
      )}

      {!loading && !error && devices.length > 0 && (
        <div className="glass-card devices-table-wrap p-0">
          <div className="devices-table-scroll">
            <table className="devices-table">
              <thead>
                <tr>
                  <th className="col-status">Status</th>
                  <th className="col-device">Device</th>
                  <th className="col-type">Type</th>
                  <th className="col-ip">IP</th>
                  <th className="col-mac">MAC</th>
                  <th className="col-host">Host</th>
                  <th className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const msg = actionMsg[d.id];
                  const busy = busyId === d.id || bulkBusy;
                  const isRenaming = renamingId === d.id;
                  const openUrl = primaryOpenUrl(d);
                  const portCount = d.open_ports?.length ?? 0;
                  const risky = hasRiskyOpenPort(d.open_ports);
                  return (
                    <tr key={d.id}>
                      <td className="col-status">
                        <div className="devices-status-stack">
                          <StatusBadge status={d.status} />
                          {d.is_new && (
                            <span className="hygiene-badge hygiene-badge--new" title="First seen within 24h">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="col-device">
                        {isRenaming ? (
                          <div className="devices-rename">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveRename(d);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              placeholder="Friendly name"
                              className={fieldClassName}
                              aria-label="Device name"
                            />
                            <div className="devices-rename-actions">
                              <button
                                type="button"
                                className={btnPrimaryClassName}
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
                          <div className="devices-identity">
                            <DeviceIconTrigger
                              value={d.icon}
                              size={18}
                              disabled={busy}
                              onChange={(icon) => onSetIcon(d, icon)}
                            />
                            <div className="devices-identity-text">
                              <Link to={`/devices/${d.id}`} className="devices-name">
                                {deviceLabel(d)}
                              </Link>
                              {d.name && d.hostname && (
                                <span className="devices-sub">{d.hostname}</span>
                              )}
                              <div className="devices-hygiene-chips" aria-label="Hygiene summary">
                                {d.latency_ms != null && (
                                  <span className="hygiene-chip" title="Last ping latency">
                                    {Math.round(d.latency_ms)} ms
                                  </span>
                                )}
                                <span
                                  className="hygiene-chip"
                                  title={
                                    d.ports_scanned_at
                                      ? `Open ports (scanned ${d.ports_scanned_at})`
                                      : "Open ports"
                                  }
                                >
                                  {portCount} port{portCount === 1 ? "" : "s"}
                                </span>
                                {d.security_score != null ? (
                                  <span
                                    className={`hygiene-chip hygiene-score ${scoreClass(d.security_score)}`}
                                    title="Security score"
                                  >
                                    {d.security_score}
                                  </span>
                                ) : (
                                  <span className="hygiene-chip hygiene-score score-muted" title="No score yet">
                                    —
                                  </span>
                                )}
                                {risky && (
                                  <span
                                    className="hygiene-chip hygiene-chip--risk"
                                    title="Risky open port detected"
                                  >
                                    risk
                                  </span>
                                )}
                              </div>
                              {msg && (
                                <span
                                  className={`devices-msg ${
                                    msg.ok === false ? "is-err" : msg.ok ? "is-ok" : ""
                                  }`}
                                >
                                  {msg.text}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="col-type">
                        <span className="devices-type">{d.type ?? "—"}</span>
                      </td>
                      <td className="col-ip">
                        <span className="devices-mono">{d.ip ?? "—"}</span>
                      </td>
                      <td className="col-mac">
                        <span className="devices-mono devices-mac">{d.mac}</span>
                      </td>
                      <td className="col-host">
                        <span className="devices-host">{d.hostname ?? "—"}</span>
                      </td>
                      <td className="col-actions">
                        <div className="dev-tools" role="group" aria-label={`Actions for ${deviceLabel(d)}`}>
                          <ToolBtn
                            label="Open web UI"
                            title={openUrl ?? "No URL"}
                            disabled={!openUrl}
                            onClick={() => openExternal(openUrl)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M14 4h6v6" />
                              <path d="M10 14 20 4" />
                              <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
                            </svg>
                          </ToolBtn>
                          <ToolBtn
                            label="Ping"
                            disabled={!d.ip || busy}
                            onClick={() => void onPing(d)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M5 12.5a9 9 0 0 1 14 0" />
                              <path d="M8.5 15.5a4.5 4.5 0 0 1 7 0" />
                              <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                            </svg>
                          </ToolBtn>
                          <ToolBtn
                            label="Resolve DNS"
                            disabled={!d.ip || busy}
                            onClick={() => void onResolve(d)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                            </svg>
                          </ToolBtn>
                          <ToolBtn
                            label="Rename"
                            disabled={busy}
                            onClick={() => startRename(d)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                          </ToolBtn>
                          <Link
                            to={`/devices/${d.id}`}
                            className="dev-tool-btn is-link"
                            title="Details"
                            aria-label="Details"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="m9 6 6 6-6 6" />
                            </svg>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
