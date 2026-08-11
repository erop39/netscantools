import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  btnPrimaryClassName,
  btnSecondaryClassName,
  ErrorBanner,
  fieldClassName,
  GlassCard,
  LoadingState,
  PageHeader,
} from "../components/ui";
import { useBackground } from "../theme/BackgroundProvider";
import type { Settings as SettingsType, UiBackground } from "../types";

const PRESETS: {
  id: UiBackground;
  label: string;
  hint: string;
  previewStyle: CSSProperties;
}[] = [
  {
    id: "default",
    label: "Night landscape",
    hint: "Atmospheric photo (qube.li style)",
    previewStyle: {
      backgroundImage:
        "linear-gradient(180deg, rgb(2 10 24 / 30%), rgb(2 12 28 / 40%)), url(/bg.jpg)",
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
  },
  {
    id: "gradient",
    label: "Soft gradient",
    hint: "Abstract blue glow, no photo",
    previewStyle: {
      backgroundImage:
        "radial-gradient(ellipse 90% 60% at 80% 10%, rgb(120 180 255 / 45%), transparent 55%), linear-gradient(165deg, #021020, #073e77)",
    },
  },
  {
    id: "solid",
    label: "Solid blue",
    hint: "Minimal flat deep blue",
    previewStyle: {
      backgroundImage: "linear-gradient(160deg, #041a33, #073e77 60%, #0a4a8a)",
    },
  },
  {
    id: "custom",
    label: "Custom image",
    hint: "Your uploaded background",
    previewStyle: {
      backgroundImage: "linear-gradient(135deg, #1a2744, #0d1b33)",
    },
  },
];

export function Settings() {
  const { setAppearance } = useBackground();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [scanSubnet, setScanSubnet] = useState("");
  const [scanInterval, setScanInterval] = useState(30);
  const [scanPorts, setScanPorts] = useState("80,443");
  const [uiBackground, setUiBackground] = useState<UiBackground>("default");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>("/bg.jpg");
  const [hasCustom, setHasCustom] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

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
        setUiBackground(s.ui_background);
        setBackgroundUrl(s.ui_background_url);
        setHasCustom(s.has_custom_background);
        setAppearance(s.ui_background, s.ui_background_url);
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
  }, [setAppearance]);

  function applyLocal(next: UiBackground, url: string | null) {
    setUiBackground(next);
    setBackgroundUrl(url);
    setAppearance(next, url);
  }

  function selectPreset(id: UiBackground) {
    if (id === "custom" && !hasCustom) {
      setError("Upload a custom image first, or pick another background");
      fileRef.current?.click();
      return;
    }
    setError(null);
    const url =
      id === "default"
        ? "/bg.jpg"
        : id === "custom"
          ? backgroundUrl && backgroundUrl.includes("background-image")
            ? backgroundUrl
            : "/api/settings/background-image"
          : null;
    applyLocal(id, url);
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/background-image", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try {
          const j = JSON.parse(text) as { detail?: string };
          if (j.detail) detail = j.detail;
        } catch {
          /* raw */
        }
        throw new ApiError(res.status, detail);
      }
      const s = (await res.json()) as SettingsType;
      setHasCustom(s.has_custom_background);
      setScanSubnet(s.scan_subnet);
      setScanInterval(s.scan_interval_minutes);
      setScanPorts(s.scan_ports);
      applyLocal(s.ui_background, s.ui_background_url);
      setSuccess("Custom background uploaded");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onRemoveCustom() {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const s = await apiFetch<SettingsType>("/api/settings/background-image", {
        method: "DELETE",
      });
      setHasCustom(s.has_custom_background);
      applyLocal(s.ui_background, s.ui_background_url);
      setSuccess("Custom background removed");
    } catch (err) {
      setError(err instanceof ApiError ? `Remove failed (${err.status})` : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  function parseApiDetail(err: unknown, fallback: string): string {
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
          ui_background: uiBackground,
        }),
      });
      setScanSubnet(updated.scan_subnet);
      setScanInterval(updated.scan_interval_minutes);
      setScanPorts(updated.scan_ports);
      applyLocal(updated.ui_background, updated.ui_background_url);
      setSuccess("Settings saved");
    } catch (err) {
      setError(parseApiDetail(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);
    if (newPassword !== confirmPassword) {
      setPwdError("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("New password must be at least 6 characters");
      return;
    }
    setPwdSaving(true);
    try {
      await apiFetch<{ status: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdSuccess("Password changed successfully");
    } catch (err) {
      setPwdError(parseApiDetail(err, "Password change failed"));
    } finally {
      setPwdSaving(false);
    }
  }

  const customPreviewStyle: CSSProperties = hasCustom
    ? {
        backgroundImage: `linear-gradient(180deg, rgb(2 10 24 / 25%), rgb(2 12 28 / 35%)), url(${
          backgroundUrl && backgroundUrl.includes("background-image")
            ? backgroundUrl
            : "/api/settings/background-image"
        })`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : PRESETS.find((p) => p.id === "custom")!.previewStyle;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Appearance and advanced defaults"
      />

      {loading && <LoadingState label="Loading settings…" />}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      {success && (
        <div
          className="mb-4 rounded-[12px] border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100"
          role="status"
        >
          {success}
        </div>
      )}

      {!loading && (
        <div className="flex max-w-2xl flex-col gap-6">
          <GlassCard>
            <h2 className="mb-1 text-sm font-semibold text-white/95">Account</h2>
            <p className="mb-4 text-xs text-white/50">Change your login password</p>
            <form onSubmit={onChangePassword} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className={fieldClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className={fieldClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-white/80">
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className={fieldClassName}
                />
              </label>
              {pwdError && (
                <div className="banner banner-error" role="alert">
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="banner banner-success" role="status">
                  {pwdSuccess}
                </div>
              )}
              <button
                type="submit"
                disabled={pwdSaving}
                className={`${btnPrimaryClassName} mt-1 w-fit`}
              >
                {pwdSaving ? "Updating…" : "Change password"}
              </button>
            </form>
          </GlassCard>

          <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <GlassCard>
            <h2 className="mb-1 text-sm font-medium text-white/90">Appearance</h2>
            <p className="mb-4 text-xs text-white/50">
              Background behind the glass UI. Changes apply immediately; click Save to persist with
              scan settings.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`bg-option ${uiBackground === p.id ? "is-selected" : ""}`}
                  onClick={() => selectPreset(p.id)}
                  title={p.hint}
                >
                  <div
                    className="bg-option-preview"
                    style={p.id === "custom" ? customPreviewStyle : p.previewStyle}
                  />
                  <div className="bg-option-label">
                    <div className="font-medium">{p.label}</div>
                    <div className="mt-0.5 text-[10px] text-white/45">{p.hint}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={uploading}
                className={btnSecondaryClassName}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload image…"}
              </button>
              {hasCustom && (
                <button
                  type="button"
                  disabled={uploading}
                  className={btnSecondaryClassName}
                  onClick={() => void onRemoveCustom()}
                >
                  Remove custom
                </button>
              )}
              <span className="text-xs text-white/40">JPEG / PNG / WebP / GIF, max 8 MB</span>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium text-white/90">Network scan defaults</h2>
                <p className="mt-1 text-xs text-white/50">
                  Primary controls live on the{" "}
                  <Link to="/scans" className="text-sky-300/90 hover:text-sky-200">
                    Scans
                  </Link>{" "}
                  page — subnet, start scan, and history.
                </p>
              </div>
              <Link to="/scans" className={btnSecondaryClassName}>
                Open Scans →
              </Link>
            </div>
            <div className="flex flex-col gap-4">
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
                <span className="text-xs text-white/45">0 disables auto-scan</span>
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
              </label>
            </div>
          </GlassCard>

          <button type="submit" disabled={saving} className={`${btnPrimaryClassName} w-fit`}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          </form>
        </div>
      )}
    </div>
  );
}
