import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
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
    hint: "Atmospheric night landscape",
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
  const [quickPorts, setQuickPorts] = useState("22,80,443,445,3389,8080,8443");
  const [uiBackground, setUiBackground] = useState<UiBackground>("default");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>("/bg.jpg");
  const [hasCustom, setHasCustom] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
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
        setQuickPorts(s.quick_ports);
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
      setQuickPorts(s.quick_ports);
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
          quick_ports: quickPorts.trim(),
          ui_background: uiBackground,
        }),
      });
      setScanSubnet(updated.scan_subnet);
      setScanInterval(updated.scan_interval_minutes);
      setScanPorts(updated.scan_ports);
      setQuickPorts(updated.quick_ports);
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
    <div className="settings-stack">
      <PageHeader
        title="Settings"
        description="Account and appearance"
      />

      {loading && <LoadingState label="Loading settings…" />}
      {error && <ErrorBanner message={error} />}
      {success && (
        <div className="banner banner-success" role="status">
          {success}
        </div>
      )}

      {!loading && (
        <>
          <GlassCard className="!p-6">
            <h2 className="mb-1 text-sm font-semibold text-white/95">Account</h2>
            <p className="mb-4 text-xs text-white/55">Change your login password</p>
            <form onSubmit={onChangePassword} className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5 text-sm text-white/85">
                Current password
                <div className="password-field-wrap">
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className={fieldClassName}
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-white/85">
                New password
                <div className="password-field-wrap">
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className={fieldClassName}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPwd((v) => !v)}
                    title={showPwd ? "Hide passwords" : "Show passwords"}
                    aria-label={showPwd ? "Hide passwords" : "Show passwords"}
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-white/85">
                Confirm new password
                <div className="password-field-wrap">
                  <input
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className={fieldClassName}
                  />
                </div>
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
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className={`${btnPrimaryClassName} min-w-[160px]`}
                >
                  {pwdSaving ? "Updating…" : "Change password"}
                </button>
              </div>
            </form>
          </GlassCard>

          <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <GlassCard className="!p-6">
            <h2 className="mb-1 text-sm font-semibold text-white/95">Port scanning</h2>
            <p className="mb-4 text-xs text-white/50">
              Quick ports run after each network scan; full ports are used for manual deep scans.
            </p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm text-white/85">
                Quick ports
                <input
                  type="text"
                  value={quickPorts}
                  onChange={(e) => setQuickPorts(e.target.value)}
                  placeholder="22,80,443,445,3389,8080,8443"
                  spellCheck={false}
                  className={`${fieldClassName} font-mono`}
                  aria-label="Quick ports"
                />
                <span className="text-xs text-white/40">After each scan (light probe)</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-white/85">
                Full ports
                <input
                  type="text"
                  value={scanPorts}
                  onChange={(e) => setScanPorts(e.target.value)}
                  placeholder="80,443,8080"
                  spellCheck={false}
                  className={`${fieldClassName} font-mono`}
                  aria-label="Full ports"
                />
                <span className="text-xs text-white/40">Manual deep scan only</span>
              </label>
            </div>
          </GlassCard>

          <GlassCard className="!p-6">
            <h2 className="mb-1 text-sm font-semibold text-white/95">Appearance</h2>
            <p className="mb-4 text-xs text-white/50">
              Background behind the glass UI. Preview applies immediately; click Save to persist.
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

          <div className="pb-2">
            <button type="submit" disabled={saving} className={`${btnPrimaryClassName} min-w-[140px]`}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
          </form>
        </>
      )}
    </div>
  );
}
