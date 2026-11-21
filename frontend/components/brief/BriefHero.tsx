"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileEdit,
  History,
  Printer,
  ShieldCheck,
} from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { formatRelativeTime } from "@/lib/company-adapter";
import type { Brief, BriefStatus } from "@/lib/types";
import { formatBriefDate } from "./briefMeta";

const STATUS_BADGE: Record<
  BriefStatus,
  { label: string; Icon: typeof FileEdit; cls: string }
> = {
  draft: {
    label: "Draft",
    Icon: FileEdit,
    cls: "border-amber-300/45 bg-amber-400/20 text-amber-100",
  },
  ready: {
    label: "Ready",
    Icon: CheckCircle2,
    cls: "border-emerald-300/45 bg-emerald-400/20 text-emerald-100",
  },
};

function ComparisonChip({ label, delta }: { label: string; delta: number }) {
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[11px] text-white/90">
      <Icon size={12} aria-hidden="true" />
      <span>
        {label} {sign}
        {delta} vs last brief
      </span>
    </span>
  );
}

export function BriefHero({
  brief,
  onCopyMarkdown,
  onDownloadMarkdown,
  onDownloadPdf,
  onPrint,
  onOpenHistory,
  onOpenRunDrawer,
  pdfLoading,
}: {
  brief: Brief;
  onCopyMarkdown: () => void;
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
  onPrint: () => void;
  onOpenHistory: () => void;
  onOpenRunDrawer?: (runId: number) => void;
  pdfLoading?: boolean;
}) {
  const { reduced } = useMotionSafe();
  const [copiedMd, setCopiedMd] = useState(false);

  const statusMeta = STATUS_BADGE[brief.status];
  const StatusIcon = statusMeta.Icon;

  const handleCopy = () => {
    onCopyMarkdown();
    setCopiedMd(true);
    window.setTimeout(() => setCopiedMd(false), 1800);
  };

  return (
    <div className="space-y-3">
      {/* Print-only running page header */}
      <div className="brief-print-only border-b border-[#1F2125]/20 pb-2 text-xs text-[#4B5058]">
        <strong>{brief.companyName}</strong> · Monday Morning Brief · Week of{" "}
        {formatBriefDate(brief.weekStart)}
      </div>

      {/* Archived version banner */}
      {brief.isArchived ? (
        <div
          role="status"
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#EA580C]/30 bg-[#EA580C]/10 px-4 py-2.5 text-xs text-[#9A3412]"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Archive size={14} aria-hidden="true" />
            Viewing archived brief (v{brief.version} · {formatBriefDate(brief.weekStart)}). Read-only mode.
          </span>
          <Link
            href={`/company/${brief.companyId}/brief`}
            className="focus-ring rounded-lg border border-[#EA580C]/35 bg-white px-2.5 py-1 font-medium text-[#9A3412] no-underline hover:bg-[#FFF7ED]"
          >
            Jump to latest →
          </Link>
        </div>
      ) : null}

      {/* Scheduler-generated banner */}
      {brief.trigger === "scheduled" && brief.automationRunId ? (
        <div
          role="status"
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#4F46E5]/20 bg-indigo-50/75 px-4 py-2.5 text-xs text-[#312E81]"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CalendarClock size={14} className="text-[#4F46E5]" aria-hidden="true" />
            Generated automatically by Weekly Monday Brief on{" "}
            {formatBriefDate(brief.generatedAt)}.
          </span>
          {onOpenRunDrawer ? (
            <button
              type="button"
              onClick={() => onOpenRunDrawer(Number(brief.automationRunId))}
              className="focus-ring rounded-lg border border-[#4F46E5]/25 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-[#4F46E5] hover:bg-indigo-50"
            >
              View automation run #{brief.automationRunId}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Citation check removed-claims notice */}
      {brief.removedUnsupportedClaims && brief.removedUnsupportedClaims > 0 ? (
        <div
          role="status"
          className="no-print flex items-center gap-2 rounded-2xl border border-[#059669]/25 bg-[#059669]/8 px-4 py-2 text-xs text-[#065F46]"
        >
          <ShieldCheck size={14} className="shrink-0 text-[#059669]" aria-hidden="true" />
          <span>
            <strong>Citation check:</strong> {brief.removedUnsupportedClaims} unsupported{" "}
            {brief.removedUnsupportedClaims === 1 ? "claim was" : "claims were"} removed during verification.
          </span>
        </div>
      ) : null}

      {/* Editorial Hero Card */}
      <div
        className="relative overflow-hidden rounded-[24px] border border-white/25 p-6 text-white shadow-[0_20px_50px_rgba(30,33,48,0.18)] sm:p-8"
        style={{
          background:
            "linear-gradient(135deg, #1E2130 0%, #2C3052 55%, #1E2438 100%)",
        }}
      >
        {/* Slow one-time editorial shimmer */}
        {!reduced ? (
          <div
            aria-hidden="true"
            className="brief-hero-shimmer no-print pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          />
        ) : null}

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-200">
              MONDAY MORNING BRIEF
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium ${statusMeta.cls}`}
            >
              <StatusIcon size={11} aria-hidden="true" />
              {statusMeta.label}
            </span>
            {brief.isMock ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-400/25 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-amber-100">
                <AlertTriangle size={11} aria-hidden="true" />
                MOCK DATA
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenHistory}
            className="no-print focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            <History size={13} aria-hidden="true" />
            History
          </button>
        </div>

        <h1 className="relative z-10 mt-3 font-serif text-[32px] font-medium leading-[1.15] tracking-[-0.02em] text-white sm:text-[38px]">
          Week of {formatBriefDate(brief.weekStart)}
        </h1>
        <p className="relative z-10 mt-1 font-serif text-[19px] font-normal text-white/85">
          {brief.companyName}
        </p>

        {/* Mono metadata row */}
        <p className="relative z-10 mt-3 font-mono text-[12px] text-white/80">
          {brief.stats.signals} signals · {brief.stats.sources} sources ·{" "}
          {brief.stats.newEvidence} new pieces of evidence · generated{" "}
          {formatRelativeTime(brief.generatedAt)} · v{brief.version}
        </p>

        {brief.headline ? (
          <p className="relative z-10 mt-3 max-w-[68ch] text-[15px] leading-relaxed text-white/95">
            {brief.headline}
          </p>
        ) : null}

        {/* Hero Buttons (2x2 wrap on mobile) */}
        <div className="no-print relative z-10 mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={pdfLoading}
            onClick={onDownloadPdf}
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-semibold text-[#1C1D21] transition-colors hover:bg-white/90 disabled:opacity-60"
          >
            <Download size={13} aria-hidden="true" />
            {pdfLoading ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={onDownloadMarkdown}
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/12 px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            <Download size={13} aria-hidden="true" />
            Export .md
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/12 px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
          >
            {copiedMd ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            {copiedMd ? "Copied" : "Copy summary"}
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-transparent px-3 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Printer size={13} aria-hidden="true" />
            Print
          </button>
        </div>

        {/* Week-over-week comparison strip */}
        {brief.comparison ? (
          <div className="relative z-10 mt-5 flex flex-wrap items-center gap-2 border-t border-white/15 pt-4">
            <ComparisonChip label="Opportunities" delta={brief.comparison.opportunities} />
            <ComparisonChip label="Threats" delta={brief.comparison.threats} />
            <ComparisonChip label="New evidence" delta={brief.comparison.newEvidence} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
