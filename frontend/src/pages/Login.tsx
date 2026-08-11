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
      <div className="flex min-h-screen items-center justify-center gap-3 text-[var(--text-muted)]">
        <span className="spinner" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  if (alreadyAuthed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="login-card">
        <div className="mb-8 text-center">
          <div className="login-logo">q</div>
          <h1 className="text-xl font-semibold tracking-tight text-white">qube.li</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">NetInventory · sign in</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-muted)]">
            Username
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass-input h-[48px] text-[14px]"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium text-[var(--text-muted)]">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input h-[48px] text-[14px]"
              required
            />
          </label>

          {error && (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary mt-2 h-[48px] w-full text-[14px]">
            {submitting ? (
              <>
                <span className="spinner !border-[rgb(4_16_24/30%)] !border-t-[rgb(4_16_24/90%)]" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
