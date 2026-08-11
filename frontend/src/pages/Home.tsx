import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  EmptyState,
  ErrorBanner,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import type { Dashboard } from "../types";

export function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const dash = await apiFetch<Dashboard>("/api/dashboard");
        if (!cancelled) setData(dash);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `Failed to load dashboard (${err.status})`
              : "Failed to load dashboard",
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

  return (
    <div>
      <PageHeader title="Home" description="Network inventory overview" />

      {loading && <LoadingState label="Loading dashboard…" />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && data && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <GlassCard>
              <p className="text-sm text-white/55">Online devices</p>
              <p className="mt-2 text-3xl font-semibold text-emerald-200">
                {data.online_count}
                <span className="ml-2 text-lg font-normal text-white/45">
                  / {data.total_count}
                </span>
              </p>
              <p className="mt-1 text-xs text-white/45">currently online / total</p>
            </GlassCard>

            <GlassCard>
              <p className="text-sm text-white/55">Total inventory</p>
              <p className="mt-2 text-3xl font-semibold text-white/95">{data.total_count}</p>
              <Link
                to="/devices"
                className="mt-2 inline-block text-sm text-sky-300/90 hover:text-sky-200"
              >
                View devices →
              </Link>
            </GlassCard>

            <GlassCard className="sm:col-span-2 xl:col-span-1">
              <p className="text-sm text-white/55">Last scan</p>
              {data.last_scan ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={data.last_scan.status} />
                    <span className="text-sm text-white/70">{data.last_scan.subnet}</span>
                  </div>
                  <p className="text-sm text-white/80">
                    {formatDateTime(data.last_scan.started_at)}
                  </p>
                  <p className="text-xs text-white/50">
                    Found {data.last_scan.devices_found} · New {data.last_scan.new_devices}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-white/55">No scans yet</p>
              )}
              <Link
                to="/scans"
                className="mt-3 inline-block text-sm text-sky-300/90 hover:text-sky-200"
              >
                Open scans →
              </Link>
            </GlassCard>
          </div>

          <GlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-white/90">Recent activity</h2>
              <Link
                to="/notifications"
                className="text-sm text-sky-300/90 hover:text-sky-200"
              >
                All notifications →
              </Link>
            </div>

            {data.recent_notifications.length === 0 ? (
              <EmptyState
                title="No recent notifications"
                hint="New devices and status changes will show up here."
              />
            ) : (
              <ul className="divide-y divide-white/8">
                {data.recent_notifications.map((n) => (
                  <li
                    key={n.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-xs capitalize text-white/70">
                          {n.type.replace(/_/g, " ")}
                        </span>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title="Unread" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-white/85">{n.message}</p>
                    </div>
                    <time className="shrink-0 text-xs text-white/45">
                      {formatDateTime(n.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
