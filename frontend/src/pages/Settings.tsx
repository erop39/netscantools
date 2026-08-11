import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiFetch } from "../api/client";
import {
  btnPrimaryClassName,
  ErrorBanner,
  fieldClassName,
  GlassCard,
  LoadingState,
  PageHeader,
} from "../components/ui";
import type { Settings as SettingsType } from "../types";

export function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [scanSubnet, setScanSubnet] = useState("");
  const [scanInterval, setScanInterval] = useState(30);
  const [scanPorts, setScanPorts] = useState("80,443");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await apiFetch<SettingsType>("/api/settings");
        if (cancelled) return;
        setScanSubnet(s.scan_subnet);
        setScanInterval(s.scan_interval_minutes);
        setScanPorts(s.scan_ports);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `Failed to load settings (${err.status})`
              : "Failed to load settings",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiFetch<SettingsType>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          scan_subnet: scanSubnet.trim(),
          scan_interval_minutes: Number(scanInterval),
          scan_ports: scanPorts.trim(),
        }),
      });
      setScanSubnet(updated.scan_subnet);
      setScanInterval(updated.scan_interval_minutes);
      setScanPorts(updated.scan_ports);
      setSuccess("Settings saved");
    } catch (err) {
      let message = "Save failed";
      if (err instanceof ApiError) {
        try {
          const parsed = JSON.parse(err.message) as {
            detail?: string | { msg?: string }[];
          };
          if (typeof parsed.detail === "string") {
            message = parsed.detail;
          } else if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
            message = parsed.detail.map((d) => d.msg).join("; ");
          } else {
            message = `Save failed (${err.status})`;
          }
        } catch {
          message = `Save failed (${err.status}): ${err.message}`;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Scan subnet, schedule interval, and web ports"
      />

      {loading && <LoadingState label="Loading settings…" />}
      {error && <ErrorBanner message={error} />}
      {success && (
        <div
          className="mb-4 rounded-md border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100"
          role="status"
        >
          {success}
        </div>
      )}

      {!loading && (
        <GlassCard className="max-w-xl">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm text-white/80">
              Scan subnet (CIDR)
              <input
                type="text"
                value={scanSubnet}
                onChange={(e) => setScanSubnet(e.target.value)}
                placeholder="192.168.1.0/24"
                required
                className={fieldClassName}
              />
              <span className="text-xs text-white/45">
                Example: 192.168.0.0/24 — used for ping sweep + ARP discovery
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-white/80">
              Scan interval (minutes)
              <input
                type="number"
                min={0}
                value={scanInterval}
                onChange={(e) => setScanInterval(Number(e.target.value))}
                required
                className={fieldClassName}
              />
              <span className="text-xs text-white/45">
                Set to 0 to disable automatic scheduled scans
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm text-white/80">
              Scan ports
              <input
                type="text"
                value={scanPorts}
                onChange={(e) => setScanPorts(e.target.value)}
                placeholder="80,443,8080"
                required
                className={fieldClassName}
              />
              <span className="text-xs text-white/45">
                Comma-separated ports checked for open web UIs
              </span>
            </label>

            <button type="submit" disabled={saving} className={`${btnPrimaryClassName} mt-2 w-fit`}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </form>
        </GlassCard>
      )}
    </div>
  );
}
