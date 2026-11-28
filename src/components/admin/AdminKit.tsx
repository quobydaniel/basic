// Shared Pearl primitives for the /quoby admin console (spec PART 17).
// Every admin page composes these so tone, spacing and badges stay consistent.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="gold-rule mt-4" />
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function AdminPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`pearl-card overflow-hidden ${className}`}>{children}</section>;
}

export function AdminPanelHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3 md:px-5">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export type PearlTone = "gold" | "green" | "warn" | "danger" | "muted" | "ink";

const TONE: Record<PearlTone, string> = {
  gold: "bg-gild/15 text-gold border-gild/30",
  green: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-error/15 text-error border-error/30",
  muted: "bg-muted text-muted-foreground border-transparent",
  ink: "bg-foreground text-background border-transparent",
};

export function PearlBadge({
  tone = "muted",
  children,
}: {
  tone?: PearlTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

// Entity-status → Pearl tone (order/store/product/channel statuses).
export function statusTone(status: string): PearlTone {
  switch (status) {
    case "paid":
    case "delivered":
    case "active":
    case "approved":
      return "green";
    case "pending":
    case "draft":
    case "paused":
      return "warn";
    case "fulfilled":
    case "shipped":
      return "gold";
    case "cancelled":
    case "suspended":
    case "refunded":
      return "danger";
    default:
      return "muted";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <PearlBadge tone={statusTone(status)}>{status}</PearlBadge>;
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="pearl-card p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" /> {label}
      </div>
      <p className="mt-2 font-display text-2xl leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AdminEmpty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm font-medium">{text}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AdminError({ message }: { message: string }) {
  return <div className="pearl-card p-5 text-sm text-error">Failed to load: {message}</div>;
}

// Honest "no backend contract yet" state (spec PART 24) — never a fake success.
export function BlockedPanel({
  title,
  exists,
  needed,
  meanwhile,
}: {
  title: string;
  exists: string;
  needed: string;
  meanwhile?: ReactNode;
}) {
  return (
    <AdminPanel>
      <AdminPanelHead title={title} hint="Blocked — missing backend contract" />
      <div className="space-y-4 px-4 py-5 md:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">What exists today: </span>
            {exists}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gild" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">What the backend needs to add: </span>
            {needed}
          </p>
        </div>
        {meanwhile}
      </div>
    </AdminPanel>
  );
}
