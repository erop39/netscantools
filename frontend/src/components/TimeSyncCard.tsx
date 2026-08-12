import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import {
  clockSkewMs,
  formatDateTime,
  formatSkew,
  formatTime,
  formatTimeZoneLabel,
  formatUtcOffset,
  getSystemTimeZone,
  getUserTimeZone,
  isSystemTimeZone,
  setUserTimeZone,
} from "../lib/time";
import { btnSecondaryClassName, fieldClassName } from "./ui";

type ServerTime = {
  server_time_utc: string;
  server_timezone: string;
  unix_ms: string;
};

/** Settings card: PC timezone + server UTC clock sync status. */
export function TimeSyncCard() {
  const [now, setNow] = useState(() => new Date());
  const [tz, setTz] = useState(() => getUserTimeZone());
  const [useSystem, setUseSystem] = useState(() => isSystemTimeZone());
  const [serverUtc, setServerUtc] = useState<string | null>(null);
  const [skew, setSkew] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshServer = useCallback(async () => {
    try {
      const t = await apiFetch<ServerTime>("/api/time");
      setServerUtc(t.server_time_utc);
      const ms = Number(t.unix_ms);
      if (Number.isFinite(ms)) {
        setSkew(formatSkew(clockSkewMs(ms)));
      }
      setError(null);
    } catch {
      setError("Could not reach server clock");
    }
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    void refreshServer();
    const t = window.setInterval(() => void refreshServer(), 30000);
    return () => window.clearInterval(t);
  }, [refreshServer]);

  useEffect(() => {
    const onChange = () => {
      setTz(getUserTimeZone());
      setUseSystem(isSystemTimeZone());
    };
    window.addEventListener("netpad-timezone-change", onChange);
    return () => window.removeEventListener("netpad-timezone-change", onChange);
  }, []);

  function applySystem() {
    setUserTimeZone("system");
    setUseSystem(true);
    setTz(getSystemTimeZone());
  }

  function applyZone(zone: string) {
    setUserTimeZone(zone);
    setUseSystem(false);
    setTz(zone);
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold text-white/95">Time & timezone</h2>
      <p className="mb-4 text-xs text-white/55">
        All timestamps are stored in UTC and shown in your PC timezone (
        <span className="text-white/75">{formatTimeZoneLabel(now)}</span>
        ).
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">
            Your PC
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums text-white/95">
            {formatTime(now.toISOString())}
          </p>
          <p className="mt-1 text-xs text-white/55">
            {tz} · {formatUtcOffset(now)}
          </p>
          <p className="mt-0.5 text-xs text-white/40">{formatDateTime(now.toISOString())}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">
            Server (UTC)
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums text-white/95">
            {serverUtc ? formatTime(serverUtc) : "—"}
          </p>
          <p className="mt-1 text-xs text-white/55">
            {serverUtc ? formatDateTime(serverUtc) : "…"}
          </p>
          <p className="mt-0.5 text-xs text-sky-200/70">
            {error ?? skew ?? "checking…"}
          </p>
        </div>
      </div>

      <label className="mb-2 flex flex-col gap-1.5 text-sm text-white/85">
        Display timezone
        <select
          className={fieldClassName}
          value={useSystem ? "system" : tz}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "system") applySystem();
            else applyZone(v);
          }}
          aria-label="Display timezone"
        >
          <option value="system">System ({getSystemTimeZone()})</option>
          <option value="UTC">UTC</option>
          <option value="Europe/Moscow">Europe/Moscow</option>
          <option value="Europe/Kyiv">Europe/Kyiv</option>
          <option value="Europe/Berlin">Europe/Berlin</option>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="Asia/Almaty">Asia/Almaty</option>
          <option value="Asia/Yekaterinburg">Asia/Yekaterinburg</option>
          <option value="Asia/Novosibirsk">Asia/Novosibirsk</option>
          <option value="Asia/Vladivostok">Asia/Vladivostok</option>
        </select>
      </label>
      <p className="mb-3 text-xs text-white/40">
        Default follows the OS clock. Override only if you want a fixed zone in the UI.
      </p>
      <button
        type="button"
        className={btnSecondaryClassName}
        onClick={() => void refreshServer()}
      >
        Refresh server time
      </button>
    </div>
  );
}
