import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import type { User } from "../types";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyAuthed, setAlreadyAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiFetch<User>("/api/auth/me");
        if (!cancelled) setAlreadyAuthed(true);
      } catch {
        // not logged in
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<User>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid username or password");
      } else {
        setError("Login failed. Is the backend running?");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/70">Loading…</div>
    );
  }

  if (alreadyAuthed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-panel w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 shadow-inner ring-1 ring-white/15">
            <span className="text-lg font-bold text-white/95">q</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white/95">qube.li</h1>
          <p className="mt-1 text-sm text-white/60">NetInventory</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-white/80">
            Username
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input h-[50px] px-4"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-white/80">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input h-[50px] px-4"
              required
            />
          </label>

          {error && (
            <p
              className="rounded-[10px] border border-red-400/30 bg-red-500/20 px-3 py-2 text-sm text-red-100"
              role="alert"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-glass mt-2 h-[50px] text-[15px] font-medium">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
