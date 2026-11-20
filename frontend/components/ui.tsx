"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section
      className={`surface-card rounded-[14px] p-5 sm:p-6 ${
        interactive ? "card-interactive" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-[62ch] text-[15px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "success";
  title?: string;
};

export function Button({ children, onClick, type = "button", disabled, variant = "primary", title }: ButtonProps) {
  const base =
    "btn-motion inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[10px] px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-45";
  const styles: Record<string, string> = {
    primary: "bg-accent text-[#07101d] hover:bg-[#76c6fd]",
    ghost: "border border-[rgba(233,237,243,0.14)] bg-surface/60 text-ink hover:border-accent/45 hover:text-accent",
    danger: "border border-danger/35 bg-danger/5 text-danger hover:bg-danger/15",
    success: "bg-success text-[#04231f] hover:bg-[#4ae0cc]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "info" }) {
  const tones: Record<string, string> = {
    neutral: "border-[rgba(233,237,243,0.12)] bg-secondary/80 text-ink/80",
    ok: "border-success/30 bg-success/10 text-success",
    warn: "border-warning/35 bg-warning/10 text-warning",
    bad: "border-danger/35 bg-danger/10 text-danger",
    info: "border-accent/35 bg-accent/10 text-accent",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[rgba(233,237,243,0.08)] bg-surface px-4 py-3 text-sm text-muted">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function BusyProgress({ label }: { label: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [label]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-accent/35 bg-accent/10 px-4 py-3 text-sm text-ink">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
        <span>{label}</span>
      </div>
      <span className="tabular font-mono text-xs font-medium text-accent">{elapsed}s elapsed</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[10px] border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {onRetry ? (
          <button
            onClick={onRetry}
            className="rounded-md border border-danger/35 px-2.5 py-1 text-xs font-medium hover:bg-danger/20"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[rgba(233,237,243,0.14)] bg-surface/50 px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {hint ? <p className="mx-auto mt-1.5 max-w-[52ch] text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="surface-card rounded-[12px] px-4 py-3.5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[13px] font-medium text-ink/90">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[8px] border border-[rgba(233,237,243,0.13)] bg-secondary px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
