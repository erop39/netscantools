import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import {
  EmptyState,
  ErrorBanner,
  GlassCard,
  LoadingState,
  PageHeader,
  StatCard,
} from "../components/ui";
import type { ChecklistItem, HygieneSummary } from "../types";

export function Hygiene() {
  const [summary, setSummary] = useState<HygieneSummary | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [hygiene, items] = await Promise.all([
          apiFetch<HygieneSummary>("/api/hygiene"),
          apiFetch<ChecklistItem[]>("/api/hygiene/checklist"),
        ]);
        if (!cancelled) {
          setSummary(hygiene);
          setChecklist(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `Failed to load hygiene (${err.status})`
              : "Failed to load hygiene",
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
      <PageHeader title="Hygiene" description="Network health and security checklist" />

      {loading && <LoadingState label="Loading hygiene…" />}
      {error && <ErrorBanner message={error} />}

      {!loading && !error && summary && (
        <div className="flex flex-col gap-4">
          {summary.network_score != null ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Network score"
                value={Math.round(summary.network_score)}
                hint="mean security score of scored online devices"
              />
              <StatCard label="Online" value={summary.counts.online} />
              <StatCard label="Risky devices" value={summary.counts.risky_devices} />
            </div>
          ) : (
            <EmptyState
              title="No network score yet"
              hint="Run a scan so devices get security scores."
            />
          )}

          <GlassCard>
            <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-white/95">
              Checklist
            </h2>
            {checklist.length === 0 ? (
              <EmptyState title="No checklist items" hint="Checklist will appear after first load." />
            ) : (
              <ul className="divide-y divide-white/8">
                {checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        item.checked
                          ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                          : "border-white/20 bg-white/5 text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span
                      className={`text-sm ${item.checked ? "text-white/50 line-through" : "text-white/85"}`}
                    >
                      {item.label}
                    </span>
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
