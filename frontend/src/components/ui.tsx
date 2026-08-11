import type { ReactNode } from "react";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "online") return "is-online";
  if (s === "offline") return "is-offline";
  if (s === "running") return "is-running";
  if (s === "completed" || s === "done" || s === "success") return "is-success";
  if (s === "failed" || s === "error") return "is-failed";
  return "is-unknown";
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-[var(--text-muted)]">
      <span className="spinner" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-error" role="alert">
      <span aria-hidden>⚠</span>
      <span>{message}</span>
    </div>
  );
}

export function InfoBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-info" role="status">
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="banner banner-success" role="status">
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-white/90">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{hint}</p>}
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

export function StatCard({
  label,
  value,
  hint,
  footer,
  success,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  footer?: ReactNode;
  success?: boolean;
}) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <div className={`stat-value ${success ? "is-success" : ""}`}>{value}</div>
      {hint && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>}
      {footer && <div className="mt-3 relative z-[1]">{footer}</div>}
    </div>
  );
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
    <div className="page-header flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 self-center">{actions}</div>
      )}
    </div>
  );
}

/** @deprecated use btn-secondary / class strings below */
export const fieldClassName = "glass-input";

export const btnPrimaryClassName = "btn-primary";
export const btnSecondaryClassName = "btn-secondary";
export const btnDangerClassName = "btn-danger";
export const btnGhostClassName = "btn-ghost";
