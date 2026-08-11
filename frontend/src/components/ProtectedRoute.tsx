import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import type { User } from "../types";

export function ProtectedRoute() {
  const [state, setState] = useState<"loading" | "ok" | "unauth">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiFetch<User>("/api/auth/me");
        if (!cancelled) setState("ok");
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            setState("unauth");
          } else {
            // network / backend down — treat as unauthenticated for shell
            setState("unauth");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-white/70">
        Checking session…
      </div>
    );
  }

  if (state === "unauth") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
