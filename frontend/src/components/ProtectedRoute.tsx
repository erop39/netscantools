import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { User } from "../types";
import { useBackground } from "../theme/BackgroundProvider";

export function ProtectedRoute() {
  const [state, setState] = useState<"loading" | "ok" | "unauth">("loading");
  const { refreshFromApi } = useBackground();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiFetch<User>("/api/auth/me");
        if (!cancelled) {
          setState("ok");
          void refreshFromApi();
        }
      } catch {
        if (!cancelled) setState("unauth");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromApi]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/70">Loading…</div>
    );
  }
  if (state === "unauth") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
