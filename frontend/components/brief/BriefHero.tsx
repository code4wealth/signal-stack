"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  Copy,
  History,
  Mail,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { CountUp } from "@/components/motion/CountUp";
import type { Brief } from "@/lib/types";
import { formatBriefDate } from "./briefMeta";

function DeltaBadge({ delta, label }: { delta: number; label: string }) {
  if (delta === 0) return null;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="mt-1 inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10.5px] font-medium text-white/90">
      {sign}
      {delta} {label} vs last wk
    </span>
  );
}

export function BriefHero({
  brief,
  onCopyMarkdown,
  onPrintPdf,
  onOpenEmail,
  onOpenHistory,
  onRegenerate,
  isRegenerating,
  onOpenRunDrawer,
}: {
  brief: Brief;
  onCopyMarkdown: () => void;
  onPrintPdf: () => void;
  onOpenEmail: () => void;
  onOpenHistory: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onOpenRunDrawer?: (runId: number) => void;
}) {
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  const handleCopy = () => {
    onCopyMarkdown();
    setCopiedMd(true);
    window.setTimeout(() => setCopiedMd(false), 1800);
  };

  return (
    <div className="space-y-3">
      {/* Archived version banner */}
      {brief.isArchived ? (
        <div
          role="status"
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#EA580C]/30 bg-[#EA580C]/10 px-4 py-2.5 text-xs text-[#9A3412]"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <Archive size={14} aria-hidden="true" />
            Viewing archived brief (v{brief.version} · {formatBriefDate(brief.weekStart)}). Actions remain read-only or switch to the latest edition.
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
            Generated automatically by your weekly schedule on{" "}
            {formatBriefDate(brief.generatedAt)}.
          </span>
          {onOpenRunDrawer ? (
            <button
              type="button"
              onClick={() => onOpenRunDrawer(Number(brief.automationRunId))}
              className="focus-ring rounded-lg border border-[#4F46E5]/25 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-[#4F46E5] hover:bg-indigo-50"
            >
              Inspect run #{brief.automationRunId}
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
            <strong>Citation check:</strong> {brief.removedUnsupportedClaims} proposed{" "}
            {brief.removedUnsupportedClaims === 1 ? "claim/action was" : "claims/actions were"} removed automatically because no verified database citation backed {brief.removedUnsupportedClaims === 1 ? "it" : "them"}.
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-white/95">
              {brief.companyName}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] text-white/90">
              {formatBriefDate(brief.weekStart)} – {formatBriefDate(brief.weekEnd)}
            </span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-white/90">
              v{brief.version} · {brief.status}
            </span>
            {brief.isMock ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-400/20 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-amber-100">
                <AlertTriangle size={11} aria-hidden="true" />
                MOCK DATA
              </span>
            ) : null}
          </div>

          <div className="no-print flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              {copiedMd ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copiedMd ? "Copied" : "Markdown"}
            </button>
            <button
              type="button"
              onClick={onPrintPdf}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <Printer size={13} aria-hidden="true" />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onOpenEmail}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <Mail size={13} aria-hidden="true" />
              Email
            </button>
            <button
              type="button"
              onClick={onOpenHistory}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <History size={13} aria-hidden="true" />
              History
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={isRegenerating}
                onClick={() => setConfirmRegen((v) => !v)}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/25 bg-white text-xs font-semibold text-[#1C1D21] px-3 transition-colors hover:bg-white/90 disabled:opacity-60"
              >
                <RefreshCw size={13} className={isRegenerating ? "animate-spin" : ""} aria-hidden="true" />
                Regenerate
              </button>
              {confirmRegen ? (
                <div
                  role="dialog"
                  aria-label="Confirm regenerate brief"
                  className="glass-strong absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl p-3.5 text-[#1F2125] shadow-xl"
                >
                  <p className="text-xs font-semibold">Generate a new brief version?</p>
                  <p className="mt-1 text-[11.5px] text-[#4B5058]">
                    Your current version stays archived in History.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmRegen(false)}
                      className="focus-ring rounded-lg border border-[#1F2125]/15 bg-white px-2.5 py-1 text-xs font-medium text-[#4B5058]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmRegen(false);
                        onRegenerate();
                      }}
                      className="focus-ring rounded-lg bg-[#1C1D21] px-2.5 py-1 text-xs font-medium text-white"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <h1 className="mt-4 font-serif text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-white sm:text-[36px]">
          Monday Morning Brief
        </h1>
        {brief.headline ? (
          <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-white/85">
            {brief.headline}
          </p>
        ) : null}

        {/* 4 Stat Tiles */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-white/75">
              Signals
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-white">
              <CountUp value={brief.stats.signals} />
            </p>
            {brief.comparison ? (
              <DeltaBadge delta={brief.comparison.newEvidence} label="ev" />
            ) : null}
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-white/75">
              Sources
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-white">
              <CountUp value={brief.stats.sources} />
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-white/75">
              Cited Evidence
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-white">
              <CountUp value={brief.stats.newEvidence} />
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-3">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-white/75">
              Verified
            </p>
            <p className="tabular mt-1 text-2xl font-semibold text-white">
              <CountUp value={brief.stats.verifiedPct} suffix="%" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
