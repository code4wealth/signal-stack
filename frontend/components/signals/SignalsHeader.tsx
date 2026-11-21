"use client";

import { Calendar, Loader2, Sparkles, Wand2 } from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import type { SignalRange } from "@/lib/types";
import { StatusPill } from "@/components/ui-shared";

const RANGE_OPTIONS: { value: SignalRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function SignalsHeader({
  range,
  onRangeChange,
  unanalysedItems,
  isAnalysing,
  isStartingAnalysis,
  lastAnalysedAt,
  isMock,
  onAnalyse,
  onOpenAskAi,
}: {
  range: SignalRange;
  onRangeChange: (next: SignalRange) => void;
  unanalysedItems: number;
  isAnalysing: boolean;
  isStartingAnalysis: boolean;
  lastAnalysedAt?: string | null;
  isMock?: boolean;
  onAnalyse: () => void;
  onOpenAskAi: () => void;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-[#1F2125]">
            Signals
          </h1>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
          {isAnalysing ? (
            <StatusPill tone="info">Analysing evidence…</StatusPill>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[#4B5058]">
          Verified source observations separated from AI interpretation and recommended actions
          {lastAnalysedAt ? (
            <span className="ml-2 font-mono text-[#9AA0AA]">
              · Last analysed {formatRelativeTime(lastAnalysedAt)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative inline-flex items-center">
          <Calendar
            size={14}
            className="pointer-events-none absolute left-3 text-[#4B5058]"
            aria-hidden="true"
          />
          <select
            aria-label="Signal date range"
            value={range}
            onChange={(e) => onRangeChange(e.target.value as SignalRange)}
            className="focus-ring h-10 appearance-none rounded-xl border border-white/85 bg-white/80 pl-8 pr-7 text-xs font-medium text-[#1F2125] shadow-sm transition-colors hover:bg-white"
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={isAnalysing || isStartingAnalysis}
          onClick={onAnalyse}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/85 bg-white/80 px-3.5 text-xs font-medium text-[#1F2125] shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
        >
          {isAnalysing || isStartingAnalysis ? (
            <Loader2 size={14} className="animate-spin text-[#4F46E5]" aria-hidden="true" />
          ) : (
            <Wand2 size={14} className="text-[#4F46E5]" aria-hidden="true" />
          )}
          <span>Analyse new evidence</span>
          {unanalysedItems > 0 ? (
            <span className="tabular rounded-full bg-[#4F46E5]/12 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#4F46E5]">
              {unanalysedItems} items waiting
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onOpenAskAi}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_6px_16px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32]"
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Ask AI</span>
        </button>
      </div>
    </header>
  );
}
