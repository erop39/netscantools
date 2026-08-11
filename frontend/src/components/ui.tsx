import type { ReactNode } from "react";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const colors =
    s === "online"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
      : s === "offline"
        ? "bg-red-500/20 text-red-200 border-red-400/30"
        : s === "running"
          ? "bg-sky-500/20 text-sky-200 border-sky-400/30"
          : s === "completed" || s === "done" || s === "success"
            ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
            : s === "failed" || s === "error"
              ? "bg-red-500/20 text-red-200 border-red-400/30"
              : "bg-white/10 text-white/70 border-white/15";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${colors}`}
    >
      {status}
    </span>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-white/60">
      <span
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-[12px] border border-red-400/30 bg-red-500/20 px-4 py-3 text-sm text-red-50 shadow-[inset_0_1px_0_rgb(255_255_255/8%)] backdrop-blur-md"
      role="alert"
    >
      {message}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="glass-card border-dashed px-6 py-12 text-center">
      <p className="text-white/80">{title}</p>
      {hint && <p className="mt-1 text-sm text-white/50">{hint}</p>}
    </div>
  );
}

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass-card p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white/95 drop-shadow-sm">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-white/60">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export const fieldClassName =
  "glass-input h-[44px] w-full px-3 text-sm";

export const btnPrimaryClassName =
  "btn-glass inline-flex h-[44px] items-center justify-center px-4 text-sm font-medium";

export const btnSecondaryClassName =
  "btn-glass inline-flex h-[36px] items-center justify-center px-3 text-xs font-medium";

export const btnDangerClassName =
  "inline-flex h-[44px] items-center justify-center rounded-[10px] border border-red-400/35 bg-red-500/20 px-4 text-sm font-medium text-red-50 shadow-[0_2px_8px_rgb(0_0_0/18%),inset_0_1px_0_rgb(255_255_255/10%)] transition-colors hover:bg-red-500/30 disabled:opacity-50";
