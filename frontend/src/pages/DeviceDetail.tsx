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
import { QrCode } from "../components/QrCode";
import { deviceLabel } from "../lib/deviceLabel";
import {
  DeviceIcon,
  TYPE_PRESETS,
  iconFromType,
  iconLabel,
  typeFromIcon,
  type DeviceIconKey,
} from "../lib/deviceIcons";
import {
  eventPort,
  eventTone,
  eventTypeLabel,
  hasRiskyOpenPort,
  RISKY_PORTS,
  scoreClass,
} from "../lib/hygiene";
import { httpUrlForIp, httpsUrlForIp, openExternal } from "../lib/links";
import type {
  Device,
  DeviceEvent,
  LatencySample,
  PingResult,
  ResolveResult,
} from "../types";

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
  const [events, setEvents] = useState<DeviceEvent[]>([]);
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
  const [location, setLocation] = useState("");
  const [isPerson, setIsPerson] = useState(false);
  const [type, setType] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [webUiLocal, setWebUiLocal] = useState("");
  const [webUiExternal, setWebUiExternal] = useState("");
  const [latencyHistory, setLatencyHistory] = useState<LatencySample[]>([]);

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
        const [d, ev, lat] = await Promise.all([
          apiFetch<Device>(`/api/devices/${id}`),
          apiFetch<DeviceEvent[]>(`/api/devices/${id}/events`).catch(() => [] as DeviceEvent[]),
          apiFetch<LatencySample[]>(`/api/devices/${id}/latency-history`).catch(
            () => [] as LatencySample[],
          ),
        ]);
        if (cancelled) return;
        setDevice(d);
        setEvents(ev);
        setLatencyHistory(lat);
        setName(d.name ?? "");
        setLocation(d.location ?? "");
        setIsPerson(Boolean(d.is_person));
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
          location: location.trim() || null,
          is_person: isPerson,
          type: type.trim() || null,
          icon: icon || null,
          notes: notes.trim() || null,
          web_ui_local: webUiLocal.trim() || null,
          web_ui_external: webUiExternal.trim() || null,
        }),
      });
      setDevice(updated);
      setName(updated.name ?? "");
      setLocation(updated.location ?? "");
      setIsPerson(Boolean(updated.is_person));
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
      setDevice((d) =>
        d
          ? {
              ...d,
              status: r.ok ? "online" : "offline",
              latency_ms: r.ok && r.rtt_ms != null ? r.rtt_ms : d.latency_ms,
            }
          : d,
      );
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

  async function onScanPorts() {
    if (!id || !device?.ip) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${id}/scan-ports`, {
        method: "POST",
      });
      setDevice(updated);
      setToolMsg(
        `Port scan done — ${updated.open_ports?.length ?? 0} open port${
          (updated.open_ports?.length ?? 0) === 1 ? "" : "s"
        }`,
      );
      setToolOk(true);
      try {
        const ev = await apiFetch<DeviceEvent[]>(`/api/devices/${id}/events`);
        setEvents(ev);
      } catch {
        /* timeline refresh is best-effort */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setToolMsg("Scan already running — try again shortly");
      } else {
        setToolMsg(
          err instanceof ApiError
            ? `Port scan failed (${err.status})`
            : "Port scan failed",
        );
      }
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  async function onWol() {
    if (!id) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const r = await apiFetch<{ ok: boolean; mac: string; message: string }>(
        `/api/devices/${id}/wol`,
        { method: "POST" },
      );
      setToolMsg(r.message);
      setToolOk(r.ok);
    } catch (err) {
      setToolMsg(
        err instanceof ApiError ? `WoL failed (${err.status})` : "WoL failed",
      );
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  async function onCheckTls() {
    if (!id) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${id}/check-tls`, {
        method: "POST",
      });
      setDevice(updated);
      const st = updated.tls_status ?? "unknown";
      setToolMsg(
        st === "ok"
          ? `TLS ok${updated.tls_expires_at ? ` · exp ${updated.tls_expires_at}` : ""}`
          : `TLS ${st}${updated.tls_error ? ` — ${updated.tls_error}` : ""}`,
      );
      setToolOk(st === "ok" || st === "self_signed");
    } catch (err) {
      setToolMsg(
        err instanceof ApiError ? `TLS check failed (${err.status})` : "TLS check failed",
      );
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  async function onScanShares() {
    if (!id || !device?.ip) return;
    setToolBusy(true);
    setToolMsg(null);
    setToolOk(null);
    try {
      const updated = await apiFetch<Device>(`/api/devices/${id}/scan-shares`, {
        method: "POST",
      });
      setDevice(updated);
      const n = updated.smb_shares?.length ?? 0;
      const st = updated.smb_scan_status ?? "unknown";
      if (st === "ok") {
        setToolMsg(
          `SMB shares — ${n} share${n === 1 ? "" : "s"} found`,
        );
        setToolOk(true);
      } else if (st === "denied") {
        setToolMsg("SMB enum denied (guest/null session blocked)");
        setToolOk(false);
      } else if (st === "timeout") {
        setToolMsg("SMB enum timed out");
        setToolOk(false);
      } else if (st === "unreachable") {
        setToolMsg("SMB path unreachable (no share service?)");
        setToolOk(false);
      } else if (st === "skipped") {
        setToolMsg("SMB enum requires Windows");
        setToolOk(false);
      } else {
        setToolMsg(`SMB enum status: ${st}`);
        setToolOk(false);
      }
      try {
        const ev = await apiFetch<DeviceEvent[]>(`/api/devices/${id}/events`);
        setEvents(ev);
      } catch {
        /* best-effort */
      }
    } catch (err) {
      setToolMsg(
        err instanceof ApiError
          ? `Share scan failed (${err.status})`
          : "Share scan failed",
      );
      setToolOk(false);
    } finally {
      setToolBusy(false);
    }
  }

  function eventDetailsText(ev: DeviceEvent): string | null {
    if (!ev.details || typeof ev.details !== "object") return null;
    const parts: string[] = [];
    const d = ev.details;
    // Port shown as pill next to type — skip duplicate in details
    if (typeof d.old_ip === "string" || typeof d.new_ip === "string") {
      parts.push(`${String(d.old_ip ?? "—")} → ${String(d.new_ip ?? "—")}`);
    }
    if (typeof d.ip === "string") parts.push(String(d.ip));
    if (typeof d.name === "string" && typeof d.port !== "number") {
      parts.push(String(d.name));
    }
    if (typeof d.share_type === "string") parts.push(String(d.share_type));
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
                <div className="device-detail-title">
                  {deviceLabel(device)}
                  {device.is_new && (
                    <span className="devices-new-tag" title="First seen within 24h">
                      new
                    </span>
                  )}
                </div>
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
                  {device.security_score != null && (
                    <>
                      <span className="device-detail-meta-sep">·</span>
                      <span
                        className={`hygiene-score ${scoreClass(device.security_score)}`}
                        title="Security score"
                      >
                        Score {device.security_score}
                      </span>
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
                <Fact label="Location">{device.location ?? "—"}</Fact>
                <Fact label="Latency">
                  {device.latency_ms != null ? `${Math.round(device.latency_ms)} ms` : "—"}
                </Fact>
                <Fact label="TLS">
                  {device.tls_status ? (
                    <span
                      className={
                        device.tls_status === "ok"
                          ? "score-good"
                          : device.tls_status === "expired"
                            ? "score-bad"
                            : device.tls_status === "self_signed"
                              ? "score-warn"
                              : "score-muted"
                      }
                      title={device.tls_error ?? device.tls_issuer ?? undefined}
                    >
                      {device.tls_status}
                      {device.tls_expires_at
                        ? ` · exp ${formatDateTime(device.tls_expires_at)}`
                        : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact label="Last seen">{formatDateTime(device.last_seen)}</Fact>
                <Fact label="First seen">{formatDateTime(device.first_seen)}</Fact>
                <Fact label="Ports scanned">{formatDateTime(device.ports_scanned_at)}</Fact>
                <Fact label="SMB scanned">{formatDateTime(device.smb_scanned_at)}</Fact>
                <Fact label="SMB status">
                  {device.smb_scan_status ?? "—"}
                </Fact>
              </dl>
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Security score</h2>
              <div className="detail-score-block">
                <div
                  className={`detail-score-value ${scoreClass(device.security_score)}`}
                  aria-label={
                    device.security_score != null
                      ? `Security score ${device.security_score}`
                      : "No security score"
                  }
                >
                  {device.security_score != null ? device.security_score : "—"}
                </div>
                {hasRiskyOpenPort(device.open_ports) && (
                  <p className="detail-score-risk" role="status">
                    Risky open port detected
                  </p>
                )}
                {device.score_breakdown && device.score_breakdown.length > 0 ? (
                  <ul className="detail-score-breakdown">
                    {device.score_breakdown.map((item) => (
                      <li key={item.code} className="detail-score-breakdown-item">
                        <span className="detail-score-breakdown-label">{item.label}</span>
                        <span
                          className={
                            item.delta < 0
                              ? "detail-score-delta is-neg"
                              : item.delta > 0
                                ? "detail-score-delta is-pos"
                                : "detail-score-delta"
                          }
                        >
                          {item.delta > 0 ? `+${item.delta}` : item.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="device-field-hint">
                    {device.security_score != null
                      ? "No penalty breakdown (score is clean)."
                      : "Score appears after a scan or port probe."}
                  </p>
                )}
              </div>
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Open ports</h2>
              {device.open_ports && device.open_ports.length > 0 ? (
                <div className="detail-ports-wrap">
                  <table className="detail-ports-table">
                    <thead>
                      <tr>
                        <th>Port</th>
                        <th>Service</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...device.open_ports]
                        .sort((a, b) => a.port - b.port)
                        .map((p) => {
                          const risky = RISKY_PORTS.has(p.port);
                          return (
                            <tr
                              key={`${p.port}-${p.source ?? ""}`}
                              className={risky ? "is-risk is-open" : "is-open"}
                            >
                              <td>
                                <span
                                  className={
                                    risky ? "port-pill is-risk" : "port-pill"
                                  }
                                >
                                  {p.port}
                                </span>
                                {risky && (
                                  <span className="hygiene-chip hygiene-chip--risk ml-1.5">
                                    risk
                                  </span>
                                )}
                              </td>
                              <td>{p.service ?? "—"}</td>
                              <td className="detail-ports-source">{p.source ?? "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="device-field-hint">No open ports recorded yet. Run Scan ports or a network scan.</p>
              )}
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">SMB shares</h2>
              {device.smb_shares && device.smb_shares.length > 0 ? (
                <div className="detail-shares-wrap">
                  <table className="detail-shares-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...device.smb_shares]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((s) => {
                          const admin = /^(c|d|e|admin|print)\$$/i.test(s.name);
                          const rowClass = [
                            s.share_type === "print" ? "is-print" : "",
                            admin ? "is-admin" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const unc =
                            device.ip != null
                              ? `\\\\${device.ip}\\${s.name}`
                              : null;
                          return (
                            <tr
                              key={s.name}
                              className={rowClass || undefined}
                            >
                              <td>
                                <span className="share-name">{s.name}</span>
                                {(s.hidden || s.name.endsWith("$")) && (
                                  <span className="share-hidden-tag">hidden</span>
                                )}
                                {unc && (
                                  <div className="share-path" title={unc}>
                                    {unc}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`share-type-pill is-${s.share_type}`}
                                >
                                  {s.share_type}
                                </span>
                              </td>
                              <td>{s.comment?.trim() ? s.comment : "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="device-field-hint">
                  {device.smb_scan_status === "denied"
                    ? "Enum denied — host blocks guest listing. Status still useful."
                    : device.smb_scan_status === "unreachable"
                      ? "Path unreachable — SMB may be closed or firewalled."
                      : "No shares recorded yet. Run Scan shares (Windows net view)."}
                </p>
              )}
              {device.smb_scanned_at && (
                <p className="detail-shares-meta">
                  Last enum {formatDateTime(device.smb_scanned_at)}
                  {device.smb_scan_status
                    ? ` · ${device.smb_scan_status}`
                    : ""}
                </p>
              )}
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Timeline</h2>
              {events.length === 0 ? (
                <p className="device-field-hint">No events yet.</p>
              ) : (
                <ul className="detail-timeline">
                  {events.map((ev) => {
                    const extra = eventDetailsText(ev);
                    const port = eventPort(ev.details);
                    const riskyPort = port != null && RISKY_PORTS.has(port);
                    return (
                      <li key={ev.id} className="detail-timeline-item">
                        <div className="detail-timeline-head">
                          <span
                            className={`event-type ${eventTone(ev.type)}`}
                          >
                            {eventTypeLabel(ev.type)}
                          </span>
                          {port != null && (
                            <span
                              className={
                                riskyPort ? "port-pill is-risk" : "port-pill"
                              }
                              title={riskyPort ? "Risky open port" : "Port"}
                            >
                              {port}
                            </span>
                          )}
                        </div>
                        <span className="detail-timeline-time">
                          {formatDateTime(ev.created_at)}
                        </span>
                        {extra && (
                          <span className="detail-timeline-details">{extra}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">Latency history</h2>
              {latencyHistory.length === 0 ? (
                <p className="device-field-hint">
                  No samples yet. Run a Full scan or Ping to record RTT.
                </p>
              ) : (
                <div className="latency-history">
                  <div className="latency-spark" aria-hidden>
                    {(() => {
                      const vals = latencyHistory.map((s) => s.rtt_ms);
                      const max = Math.max(...vals, 1);
                      return vals.map((v, i) => (
                        <span
                          key={latencyHistory[i].id}
                          className="latency-bar"
                          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                          title={`${Math.round(v)} ms`}
                        />
                      ));
                    })()}
                  </div>
                  <p className="detail-shares-meta">
                    {latencyHistory.length} sample
                    {latencyHistory.length === 1 ? "" : "s"} · last{" "}
                    {Math.round(latencyHistory[latencyHistory.length - 1].rtt_ms)}{" "}
                    ms
                  </p>
                </div>
              )}
            </section>

            <section className="device-detail-section">
              <h2 className="device-detail-section-title">QR · web UI</h2>
              {(() => {
                const url =
                  device.web_ui_local ||
                  device.web_ui_external ||
                  httpUrlForIp(device.ip);
                if (!url) {
                  return (
                    <p className="device-field-hint">
                      Set a web UI URL or IP to generate a QR code.
                    </p>
                  );
                }
                return (
                  <div className="detail-qr-block">
                    <QrCode value={url} size={148} />
                    <p className="mt-2 break-all font-mono text-[11px] text-white/55">
                      {url}
                    </p>
                    <p className="device-field-hint mt-1">
                      Scan with phone to open the panel on LAN/VPN.
                    </p>
                  </div>
                );
              })()}
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
                  <ToolIconBtn
                    label="Scan ports"
                    title="Full port scan (settings scan_ports)"
                    disabled={!device.ip || toolBusy}
                    onClick={() => void onScanPorts()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 7h16M4 12h10M4 17h13" />
                      <circle cx="18" cy="12" r="2" />
                      <circle cx="20" cy="17" r="2" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="Scan shares"
                    title="Enumerate SMB shares (net view, Windows)"
                    disabled={!device.ip || toolBusy}
                    onClick={() => void onScanShares()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M4 6h16v4H4zM4 14h16v4H4z" />
                      <path d="M8 8h.01M8 16h.01" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="Wake on LAN"
                    title="Send WoL magic packet"
                    disabled={toolBusy}
                    onClick={() => void onWol()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
                    </svg>
                  </ToolIconBtn>
                  <ToolIconBtn
                    label="Check TLS"
                    title="Probe HTTPS certificate"
                    disabled={toolBusy}
                    onClick={() => void onCheckTls()}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
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

              <label className="device-field">
                <span className="device-field-label">Location</span>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Living room, Garage, Rack…"
                  className={fieldClassName}
                  list="device-location-hints"
                />
                <datalist id="device-location-hints">
                  <option value="Living room" />
                  <option value="Bedroom" />
                  <option value="Kitchen" />
                  <option value="Office" />
                  <option value="Garage" />
                  <option value="Basement" />
                  <option value="Rack" />
                </datalist>
                <span className="device-field-hint">
                  Room / place — filterable on Devices list
                </span>
              </label>

              <label className="device-field device-field--check">
                <span className="device-field-label">Presence</span>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    checked={isPerson}
                    onChange={(e) => setIsPerson(e.target.checked)}
                    className="h-4 w-4 rounded border-white/25 bg-white/5 text-sky-500"
                  />
                  This is a person (phone / wearable) — show in “Who’s home”
                </label>
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
