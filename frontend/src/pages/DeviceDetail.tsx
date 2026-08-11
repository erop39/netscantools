import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  btnDangerClassName,
  btnPrimaryClassName,
  btnSecondaryClassName,
  ErrorBanner,
  fieldClassName,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import { IconPicker } from "../components/IconPicker";
import { deviceLabel } from "../lib/deviceLabel";
import {
  DeviceIcon,
  TYPE_PRESETS,
  type DeviceIconKey,
} from "../lib/deviceIcons";
import { httpUrlForIp, httpsUrlForIp, openExternal } from "../lib/links";
import type { Device, PingResult, ResolveResult } from "../types";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const [toolOk, setToolOk] = useState<boolean | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [webUiLocal, setWebUiLocal] = useState("");
  const [webUiExternal, setWebUiExternal] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setError("Invalid device id");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const d = await apiFetch<Device>(`/api/devices/${id}`);
        if (cancelled) return;
        setDevice(d);
        setName(d.name ?? "");
        setType(d.type ?? "");
        setIcon(d.icon ?? null);
        setNotes(d.notes ?? "");
        setWebUiLocal(d.web_ui_local ?? "");
        setWebUiExternal(d.web_ui_external ?? "");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 404
              ? "Device not found"
              : err instanceof ApiError
                ? `Failed to load device (${err.status})`
                : "Failed to load device",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || null,
          type: type.trim() || null,
          icon: icon || null,
          notes: notes.trim() || null,
          web_ui_local: webUiLocal.trim() || null,
          web_ui_external: webUiExternal.trim() || null,
        }),
      });
      setDevice(updated);
      setName(updated.name ?? "");
      setType(updated.type ?? "");
      setIcon(updated.icon ?? null);
      setSuccess("Device updated");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Save failed (${err.status})`
          : "Save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!id || !device) return;
    const label = deviceLabel(device);
    if (!window.confirm(`Delete device ${label}? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await apiFetch<void>(`/api/devices/${id}`, { method: "DELETE" });
      navigate("/devices", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Delete failed (${err.status})`
          : "Delete failed",
      );
      setDeleting(false);
    }
  }

  async function onPing() {
    if (!id || !device?.ip) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const r = await apiFetch<PingResult>(`/api/devices/${id}/ping`, { method: "POST" });
      setToolMsg(r.message);
      setToolOk(r.ok);
      setDevice((d) =>
        d ? { ...d, status: r.ok ? "online" : "offline" } : d,
      );
    } catch (err) {
      setToolMsg(err instanceof ApiError ? `Ping failed (${err.status})` : "Ping failed");
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  async function onResolve() {
    if (!id || !device?.ip) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const r = await apiFetch<ResolveResult>(`/api/devices/${id}/resolve`, {
        method: "POST",
      });
      setToolMsg(r.hostname ? `Hostname: ${r.hostname}` : "No PTR record for this IP");
      setToolOk(Boolean(r.hostname));
      if (r.device) setDevice(r.device);
    } catch (err) {
      setToolMsg(
        err instanceof ApiError ? `Resolve failed (${err.status})` : "Resolve failed",
      );
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={device ? deviceLabel(device) : "Device detail"}
        description={device ? device.mac : "Edit inventory fields"}
        actions={
          <Link to="/devices" className={`${btnSecondaryClassName} h-[40px]`}>
            ← Back to devices
          </Link>
        }
      />

      {loading && <LoadingState label="Loading device…" />}
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      {!loading && device && (
        <div className="grid gap-6 lg:grid-cols-3">
          <GlassCard className="lg:col-span-1">
            <div className="mb-4 flex items-center gap-3">
              <div className="device-avatar !h-12 !w-12 !rounded-2xl">
                <DeviceIcon name={device.icon} size={24} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-white/95">{deviceLabel(device)}</div>
                <div className="text-xs text-white/45">
                  {device.type || "No type"} · {device.icon || "no icon"}
                </div>
              </div>
            </div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-white/50">
              Discovery
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-white/45">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={device.status} />
                </dd>
              </div>
              <div>
                <dt className="text-white/45">IP</dt>
                <dd className="mt-0.5 font-mono text-white/90">{device.ip ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-white/45">MAC</dt>
                <dd className="mt-0.5 font-mono text-white/90">{device.mac}</dd>
              </div>
              <div>
                <dt className="text-white/45">Name (manual)</dt>
                <dd className="mt-0.5 text-white/90">{device.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-white/45">DNS hostname</dt>
                <dd className="mt-0.5 text-white/90">{device.hostname ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-white/45">Vendor</dt>
                <dd className="mt-0.5 text-white/90">{device.vendor ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-white/45">Last seen</dt>
                <dd className="mt-0.5 text-white/90">{formatDateTime(device.last_seen)}</dd>
              </div>
              <div>
                <dt className="text-white/45">First seen</dt>
                <dd className="mt-0.5 text-white/90">{formatDateTime(device.first_seen)}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-white/10 pt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/50">
                Open & tools
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!device.web_ui_local}
                  className={btnSecondaryClassName}
                  onClick={() => openExternal(device.web_ui_local)}
                >
                  Open LAN
                </button>
                <button
                  type="button"
                  disabled={!device.web_ui_external}
                  className={btnSecondaryClassName}
                  onClick={() => openExternal(device.web_ui_external)}
                >
                  Open Ext
                </button>
                <button
                  type="button"
                  disabled={!device.ip}
                  className={btnSecondaryClassName}
                  onClick={() => openExternal(httpUrlForIp(device.ip))}
                >
                  HTTP
                </button>
                <button
                  type="button"
                  disabled={!device.ip}
                  className={btnSecondaryClassName}
                  onClick={() => openExternal(httpsUrlForIp(device.ip))}
                >
                  HTTPS
                </button>
                <button
                  type="button"
                  disabled={!device.ip || toolBusy}
                  className={btnSecondaryClassName}
                  onClick={() => void onPing()}
                >
                  {toolBusy ? "…" : "Ping"}
                </button>
                <button
                  type="button"
                  disabled={!device.ip || toolBusy}
                  className={btnSecondaryClassName}
                  onClick={() => void onResolve()}
                >
                  Resolve name
                </button>
              </div>
              {toolMsg && (
                <p
                  className={`mt-2 text-xs ${
                    toolOk === false
                      ? "text-red-200"
                      : toolOk
                        ? "text-emerald-200"
                        : "text-white/60"
                  }`}
                >
                  {toolMsg}
                </p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-white/50">
              Editable fields
            </h2>
            <form onSubmit={onSave} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Name (rename)
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Living room AP, NAS, Camera porch…"
                  className={fieldClassName}
                />
                <span className="text-xs text-white/45">
                  Manual label — not overwritten by scan or DNS resolve
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm text-white/80">Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {TYPE_PRESETS.map((p) => (
                    <button
                      key={p.type}
                      type="button"
                      className={`type-chip ${type === p.type ? "is-selected" : ""}`}
                      onClick={() => {
                        setType(p.type);
                        setIcon(p.icon);
                      }}
                    >
                      <DeviceIcon name={p.icon} size={14} />
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="Or type custom: router, camera, NAS…"
                  className={fieldClassName}
                />
              </div>

              <IconPicker
                value={icon}
                onChange={(key: DeviceIconKey | null) => setIcon(key)}
              />

              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Web UI (LAN)
                <input
                  type="url"
                  value={webUiLocal}
                  onChange={(e) => setWebUiLocal(e.target.value)}
                  placeholder="http://192.168.1.1"
                  className={fieldClassName}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Web UI (external)
                <input
                  type="url"
                  value={webUiExternal}
                  onChange={(e) => setWebUiExternal(e.target.value)}
                  placeholder="https://router.example.com"
                  className={fieldClassName}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Location, credentials reminder, serial…"
                  className="glass-input w-full px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-2 flex flex-wrap gap-3">
                <button type="submit" disabled={saving} className={btnPrimaryClassName}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDelete}
                  className={btnDangerClassName}
                >
                  {deleting ? "Deleting…" : "Delete device"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
