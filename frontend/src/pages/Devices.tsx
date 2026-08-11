import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  fieldClassName,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import { httpUrlForIp, httpsUrlForIp, openExternal } from "../lib/links";
import type { Device, PingResult, ResolveResult } from "../types";

type ActionState = { kind: "ping" | "resolve"; text: string; ok?: boolean };

export function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<number, ActionState>>({});

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
            ? { ...x, status: r.ok ? "online" : "offline" }
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
          text: r.hostname ? `→ ${r.hostname}` : "No PTR record",
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

  return (
    <div>
      <PageHeader
        title="Devices"
        description="Discovered network equipment — open web UI, ping, resolve hostname"
        actions={
          <form
            className="flex flex-wrap items-center gap-2"
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
              placeholder="Search IP, MAC, host…"
              className={`${fieldClassName} h-[40px] w-52`}
            />
            <button type="submit" className={btnSecondaryClassName + " h-[40px]"}>
              Search
            </button>
          </form>
        }
      />

      {loading && <LoadingState label="Loading devices…" />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && devices.length === 0 && (
        <EmptyState
          title="No devices found"
          hint="Run a network scan from the Scans page to populate inventory."
        />
      )}

      {!loading && !error && devices.length > 0 && (
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">MAC</th>
                <th className="px-4 py-3 font-medium">Hostname</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
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
                const busy = busyId === d.id;
                return (
                  <tr key={d.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-white/90">{d.ip ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-white/70">{d.mac}</td>
                    <td className="px-4 py-3 text-white/85">{d.hostname ?? "—"}</td>
                    <td className="px-4 py-3 text-white/70">{d.vendor ?? "—"}</td>
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
                          title={http ?? "No IP"}
                        >
                          HTTP
                        </button>
                        <button
                          type="button"
                          disabled={!https}
                          onClick={() => openExternal(https)}
                          className={btnSecondaryClassName}
                          title={https ?? "No IP"}
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
                            title="ICMP ping"
                          >
                            {busy ? "…" : "Ping"}
                          </button>
                          <button
                            type="button"
                            disabled={!d.ip || busy}
                            onClick={() => void onResolve(d)}
                            className={btnSecondaryClassName}
                            title="Reverse DNS (PTR)"
                          >
                            Resolve
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
