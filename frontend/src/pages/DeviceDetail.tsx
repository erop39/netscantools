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
import type { Device } from "../types";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [type, setType] = useState("");
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
        setType(d.type ?? "");
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
          type: type.trim() || null,
          notes: notes.trim() || null,
          web_ui_local: webUiLocal.trim() || null,
          web_ui_external: webUiExternal.trim() || null,
        }),
      });
      setDevice(updated);
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
    const label = device.hostname || device.ip || device.mac;
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

  return (
    <div>
      <PageHeader
        title="Device detail"
        description={device ? device.mac : "Edit inventory fields"}
        actions={
          <Link to="/devices" className={btnSecondaryClassName + " h-[40px]"}>
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
                <dt className="text-white/45">Hostname</dt>
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
          </GlassCard>

          <GlassCard className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-white/50">
              Editable fields
            </h2>
            <form onSubmit={onSave} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Type
                <input
                  type="text"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="router, camera, NAS, IoT…"
                  className={fieldClassName}
                />
              </label>

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
