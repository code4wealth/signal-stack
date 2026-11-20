"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/5 bg-card/80 p-5 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p> : null}
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
    "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles: Record<string, string> = {
    primary: "bg-primary text-white hover:bg-blue-500",
    ghost: "border border-white/10 bg-transparent text-slate-200 hover:border-accent/50 hover:text-accent",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
    success: "bg-success/90 text-[#04231f] hover:bg-success",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "info" }) {
  const tones: Record<string, string> = {
    neutral: "border-white/10 text-slate-300",
    ok: "border-success/40 text-success",
    warn: "border-warning/40 text-warning",
    bad: "border-danger/40 text-danger",
    info: "border-accent/40 text-accent",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-secondary/60 px-4 py-3 text-sm text-slate-300">
      <span className="h-3 w-3 animate-ping rounded-full bg-accent" aria-hidden />
      {label}
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-slate-200">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" aria-hidden />
        <span>{label}</span>
      </div>
      <span className="font-mono text-xs text-accent">{elapsed}s elapsed</span>
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {onRetry ? (
          <button onClick={onRetry} className="rounded border border-danger/40 px-2 py-1 text-xs hover:bg-danger/20">
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 bg-secondary/40 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-secondary/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent/60";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
