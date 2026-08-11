import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  iconFromType,
  iconLabel,
  typeFromIcon,
  type DeviceIconKey,
} from "../lib/deviceIcons";
import { httpUrlForIp, httpsUrlForIp, openExternal } from "../lib/links";
import type { Device, PingResult, ResolveResult } from "../types";

function ToolIconBtn({
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

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
  const [showAllIcons, setShowAllIcons] = useState(false);

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
      setNotes(updated.notes ?? "");
      setWebUiLocal(updated.web_ui_local ?? "");
      setWebUiExternal(updated.web_ui_external ?? "");
      setSuccess("Device updated");
    } catch (err) {
      setError(
        err instanceof ApiError ? `Save failed (${err.status})` : "Save failed",
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
      const r = await apiFetch<PingResult>(`/api/devices/${id}/ping`, {
        method: "POST",
      });
      setToolMsg(r.message);
      setToolOk(r.ok);
      setDevice((d) => (d ? { ...d, status: r.ok ? "online" : "offline" } : d));
    } catch (err) {
      setToolMsg(
        err instanceof ApiError ? `Ping failed (${err.status})` : "Ping failed",
      );
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
      setToolMsg(
        r.hostname ? `Hostname: ${r.hostname}` : "No PTR record for this IP",
      );
      setToolOk(Boolean(r.hostname));
      if (r.device) setDevice(r.device);
    } catch (err) {
      setToolMsg(
        err instanceof ApiError
          ? `Resolve failed (${err.status})`
          : "Resolve failed",
      );
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  function pickPreset(p: (typeof TYPE_PRESETS)[number]) {
    setType(p.type);
    setIcon(p.icon);
  }

  /** Icon pick always aligns type with equipment class. */
  function onPickIcon(key: DeviceIconKey | null) {
    setIcon(key);
    setType(typeFromIcon(key) ?? "");
  }

  /** Free-text type: if it matches a known type, snap icon to it. */
  function onTypeInput(value: string) {
    setType(value);
    const matched = iconFromType(value.trim());
    if (matched) setIcon(matched);
  }

  return (
    <div className="device-detail">
      <PageHeader
        title={device ? deviceLabel(device) : "Device detail"}
        description={device ? device.mac : "Edit inventory fields"}
        actions={
          <Link to="/devices" className={btnSecondaryClassName}>
            ← Devices
          </Link>
        }
      />

      {loading && <LoadingState label="Loading device…" />}
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="devices-banner mb-4" role="status">
          {success}
          <button
            type="button"
            className="devices-banner-dismiss"
            onClick={() => setSuccess(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {!loading && device && (
        <div className="device-detail-grid">
          {/* ── Left: identity + discovery + tools ── */}
          <GlassCard className="device-detail-side">
            <div className="device-detail-hero">
              <div className="device-avatar device-avatar--lg" aria-hidden>
                <DeviceIcon name={icon || device.icon} size={26} />
              </div>
              <div className="min-w-0">
                <div className="device-detail-title">{deviceLabel(device)}</div>
                <div className="device-detail-meta">
                  <StatusBadge status={device.status} />
                  <span className="device-detail-meta-sep">·</span>
                  <span>{type || device.type || "No type"}</span>
                  {(icon || device.icon) && (
                    <>
                      <span className="device-detail-meta-sep">·</span>
                      <span>{iconLabel(icon || device.icon)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Discovery</h2>
              <dl className="detail-facts">
                <Fact label="IP">
                  <span className="devices-mono">{device.ip ?? "—"}</span>
                </Fact>
                <Fact label="MAC">
                  <span className="devices-mono devices-mac">{device.mac}</span>
                </Fact>
                <Fact label="DNS">{device.hostname ?? "—"}</Fact>
                <Fact label="Vendor">{device.vendor ?? "—"}</Fact>
                <Fact label="Last seen">{formatDateTime(device.last_seen)}</Fact>
                <Fact label="First seen">{formatDateTime(device.first_seen)}</Fact>
              </dl>
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Open & tools</h2>

              <div className="detail-tool-block">
                <div className="detail-tools-label">Open web UI</div>
                <div className="dev-tools dev-tools--wide" role="group" aria-label="Open web UI">
                  <ToolIconBtn
                    label="LAN URL"
                    title={device.web_ui_local ?? "No LAN URL"}
                    disabled={!device.web_ui_local}
                    onClick={() => openExternal(device.web_ui_local)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="2" y="6" width="20" height="12" rx="2" />
                      <path d="M6 10h4M6 14h2" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="External URL"
                    title={device.web_ui_external ?? "No external URL"}
                    disabled={!device.web_ui_external}
                    onClick={() => openExternal(device.web_ui_external)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="HTTP"
                    title={httpUrlForIp(device.ip) ?? "No IP"}
                    disabled={!device.ip}
                    onClick={() => openExternal(httpUrlForIp(device.ip))}
                  >
                    <span className="dev-tool-text">http</span>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="HTTPS"
                    title={httpsUrlForIp(device.ip) ?? "No IP"}
                    disabled={!device.ip}
                    onClick={() => openExternal(httpsUrlForIp(device.ip))}
                  >
                    <span className="dev-tool-text">https</span>
                  </ToolIconBtn>
                </div>
              </div>

              <div className="detail-tool-block">
                <div className="detail-tools-label">Diagnostics</div>
                <div className="dev-tools dev-tools--wide" role="group" aria-label="Diagnostics">
                  <ToolIconBtn
                    label="Ping"
                    disabled={!device.ip || toolBusy}
                    onClick={() => void onPing()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M5 12.5a9 9 0 0 1 14 0" />
                      <path d="M8.5 15.5a4.5 4.5 0 0 1 7 0" />
                      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="Resolve DNS"
                    disabled={!device.ip || toolBusy}
                    onClick={() => void onResolve()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </ToolIconBtn>
                </div>
                {toolMsg && (
                  <p
                    className={`detail-tool-msg ${
                      toolOk === false ? "is-err" : toolOk ? "is-ok" : ""
                    }`}
                    role="status"
                  >
                    {toolBusy ? "Working…" : toolMsg}
                  </p>
                )}
              </div>
            </section>
          </GlassCard>

          {/* ── Right: edit form ── */}
          <GlassCard className="device-detail-main">
            <h2 className="device-detail-section-title device-detail-section-title--page">
              Edit
            </h2>
            <form onSubmit={onSave} className="device-edit-form">
              <label className="device-field">
                <span className="device-field-label">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Living room AP, NAS, Camera porch…"
                  className={fieldClassName}
                />
                <span className="device-field-hint">
                  Manual label — not overwritten by scan or DNS
                </span>
              </label>

              <div className="device-field">
                <span className="device-field-label">Type & icon</span>
                <p className="device-field-hint device-field-hint--above">
                  Icon and type stay linked: pick a chip or an icon — both update together.
                </p>
                <div className="type-chip-grid">
                  {TYPE_PRESETS.map((p) => {
                    const selected = type === p.type;
                    return (
                      <button
                        key={p.type}
                        type="button"
                        className={`type-chip ${selected ? "is-selected" : ""}`}
                        onClick={() => pickPreset(p)}
                      >
                        <DeviceIcon name={p.icon} size={14} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={type}
                  onChange={(e) => onTypeInput(e.target.value)}
                  placeholder="Custom type…"
                  className={`${fieldClassName} mt-2`}
                  aria-label="Custom device type"
                />

                <div className="device-icon-row">
                  <div className="device-icon-preview" aria-hidden>
                    <DeviceIcon name={icon} size={22} />
                  </div>
                  <div className="device-icon-row-text">
                    <span className="device-icon-row-label">
                      {icon ? `${iconLabel(icon)}${type ? ` · ${type}` : ""}` : "No icon / type"}
                    </span>
                    <button
                      type="button"
                      className="device-icon-toggle"
                      onClick={() => setShowAllIcons((v) => !v)}
                      aria-expanded={showAllIcons}
                    >
                      {showAllIcons ? "Hide icon picker" : "Choose icon…"}
                    </button>
                  </div>
                </div>

                {showAllIcons && (
                  <div className="device-icon-picker-wrap">
                    <IconPicker
                      value={icon}
                      onChange={onPickIcon}
                    />
                  </div>
                )}
              </div>

              <div className="device-field-grid">
                <label className="device-field">
                  <span className="device-field-label">Web UI (LAN)</span>
                  <input
                    type="url"
                    value={webUiLocal}
                    onChange={(e) => setWebUiLocal(e.target.value)}
                    placeholder="http://192.168.1.1"
                    className={fieldClassName}
                  />
                </label>
                <label className="device-field">
                  <span className="device-field-label">Web UI (external)</span>
                  <input
                    type="url"
                    value={webUiExternal}
                    onChange={(e) => setWebUiExternal(e.target.value)}
                    placeholder="https://router.example.com"
                    className={fieldClassName}
                  />
                </label>
              </div>

              <label className="device-field">
                <span className="device-field-label">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Location, credentials reminder, serial…"
                  className="glass-input w-full px-3 py-2 text-sm"
                />
              </label>

              <div className="device-edit-actions">
                <button type="submit" disabled={saving} className={btnPrimaryClassName}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void onDelete()}
                  className={btnDangerClassName}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
