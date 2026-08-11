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
      <div className="flex min-h-screen items-center justify-center text-white/70">
        Loading…
      </div>
    );
  }

  if (alreadyAuthed) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[34px] border-[3px] border-white/12 bg-black/12 p-8 backdrop-blur-[30px]">
        <div className="mb-8 text-center">
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
              className="h-[50px] rounded-md border border-white/12 bg-white/5 px-4 text-white/95 outline-none focus:border-white/30"
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
              className="h-[50px] rounded-md border border-white/12 bg-white/5 px-4 text-white/95 outline-none focus:border-white/30"
              required
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 h-[50px] rounded-md bg-white/10 text-[15px] font-medium text-white/95 transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
