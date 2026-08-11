import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { ErrorBanner, LoadingState, PageHeader } from "../components/ui";
import type { NetworkPlan } from "../types";

export function Planner() {
  const [plan, setPlan] = useState<NetworkPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPlan(await apiFetch<NetworkPlan>("/api/planner"));
      } catch {
        setError("Failed to load plan");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Planner"
        description="Desired LAN layout — IPs, order, ports"
      />
      {loading && <LoadingState />}
      {error && <ErrorBanner message={error} />}
      {plan && (
        <p className="text-white/60 text-sm">
          {plan.name} · {plan.cidr ?? "no cidr"} · {plan.slots.length} slots
        </p>
      )}
    </div>
  );
}
