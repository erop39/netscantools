import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, apiFetch } from "../api/client";
import {
  btnPrimaryClassName,
  btnSecondaryClassName,
  EmptyState,
  ErrorBanner,
  formatDateTime,
  GlassCard,
  LoadingState,
  PageHeader,
} from "../components/ui";
import type { Notification } from "../types";

export function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<Notification[]>("/api/notifications");
      setItems(list);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Failed to load notifications (${err.status})`
          : "Failed to load notifications",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unreadCount = items.filter((n) => !n.read).length;

  async function markRead(id: number) {
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiFetch<Notification>(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not mark as read (${err.status})`
          : "Could not mark as read",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await apiFetch<void>("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not mark all as read (${err.status})`
          : "Could not mark all as read",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread`
            : "Device discovery and change alerts"
        }
        actions={
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            className={btnPrimaryClassName}
          >
            {markingAll ? "Marking…" : "Mark all read"}
          </button>
        }
      />

      {loading && <LoadingState label="Loading notifications…" />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No notifications"
          hint="Alerts appear when devices are discovered, go offline, or change IP."
        />
      )}

      {!loading && items.length > 0 && (
        <GlassCard className="!p-0 overflow-hidden">
          <ul className="divide-y divide-white/8">
            {items.map((n) => (
              <li
                key={n.id}
                className={[
                  "flex flex-wrap items-start justify-between gap-3 px-5 py-4",
                  n.read ? "bg-transparent" : "bg-sky-500/[0.06]",
                ].join(" ")}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white/10 px-2 py-0.5 text-xs capitalize text-white/70">
                      {n.type.replace(/_/g, " ")}
                    </span>
                    {!n.read && (
                      <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                        Unread
                      </span>
                    )}
                    {n.device_id != null && (
                      <Link
                        to={`/devices/${n.device_id}`}
                        className="text-xs text-sky-300/90 hover:text-sky-200"
                      >
                        Device #{n.device_id}
                      </Link>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-white/90">{n.message}</p>
                  <time className="mt-1 block text-xs text-white/45">
                    {formatDateTime(n.created_at)}
                  </time>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    disabled={busyId === n.id}
                    onClick={() => markRead(n.id)}
                    className={btnSecondaryClassName}
                  >
                    {busyId === n.id ? "…" : "Mark read"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
