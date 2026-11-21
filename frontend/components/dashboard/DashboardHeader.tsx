"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
} from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { formatRelativeTime, formatShortDate } from "@/lib/company-adapter";
import type { DashboardRange } from "@/lib/types";
import { StatusPill } from "@/components/ui-shared";

const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
];

function timeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return "Good morning";
  if (hr < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({
  companyId,
  companyName,
  firstName,
  lastVisitAt,
  lastUpdatedAt,
  range,
  hasBrief,
  latestBriefId,
  activeCrawlRunning,
  isStartingCrawl,
  isFetching,
  isMock,
  advisorOpen,
  onRangeChange,
  onRefresh,
  onRunCrawl,
  onToggleAdvisor,
}: {
  companyId: number;
  companyName: string;
  firstName?: string | null;
  lastVisitAt?: string | null;
  lastUpdatedAt?: string | null;
  range: DashboardRange;
  hasBrief: boolean;
  latestBriefId?: string | null;
  activeCrawlRunning: boolean;
  isStartingCrawl: boolean;
  isFetching: boolean;
  isMock?: boolean;
  advisorOpen: boolean;
  onRangeChange: (next: DashboardRange) => void;
  onRefresh: () => void;
  onRunCrawl: () => void;
  onToggleAdvisor: () => void;
}) {
  const { reduced } = useMotionSafe();
  const [spinCount, setSpinCount] = useState(0);

  const greeting = firstName ? `${timeGreeting()}, ${firstName}` : timeGreeting();
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label.toLowerCase() ?? "this period";
  const sinceText = lastVisitAt
    ? `your last visit (${formatShortDate(lastVisitAt)})`
    : `the start of ${rangeLabel}`;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[#1F2125]">
            {greeting}
          </h1>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#4B5058]">
          <span>
            Here is what changed for <strong className="font-medium text-[#1F2125]">{companyName}</strong> since {sinceText}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#9AA0AA]">
            <span>· Updated {lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : "just now"}</span>
            <button
              type="button"
              aria-label="Refresh dashboard data"
              onClick={() => {
                setSpinCount((c) => c + 1);
                onRefresh();
              }}
              className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded-md text-[#4B5058] hover:bg-white/80 hover:text-[#1F2125]"
            >
              <RefreshCw
                size={11}
                className={isFetching && !reduced ? "animate-spin" : ""}
                style={
                  reduced
                    ? undefined
                    : {
                        transform: `rotate(${spinCount * 360}deg)`,
                        transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }
                }
                aria-hidden="true"
              />
            </button>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex items-center">
          <Calendar
            size={13}
            className="pointer-events-none absolute left-3 text-[#4B5058]"
            aria-hidden="true"
          />
          <select
            aria-label="Dashboard date range"
            value={range}
            onChange={(e) => onRangeChange(e.target.value as DashboardRange)}
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
          disabled={activeCrawlRunning || isStartingCrawl}
          onClick={onRunCrawl}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/85 bg-white/80 px-3.5 text-xs font-medium text-[#1F2125] shadow-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {activeCrawlRunning ? (
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#4F46E5]" aria-hidden="true" />
          ) : (
            <Play size={13} className="text-[#4F46E5]" aria-hidden="true" />
          )}
          <span>{activeCrawlRunning ? "Crawl running…" : "Run crawl now"}</span>
        </button>

        {hasBrief ? (
          <Link
            href={
              latestBriefId
                ? `/company/${companyId}/briefs?report=${latestBriefId}`
                : `/company/${companyId}/briefs`
            }
            className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline shadow-[0_6px_16px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32]"
          >
            <FileText size={13} aria-hidden="true" />
            <span>Open Monday Brief</span>
          </Link>
        ) : (
          <Link
            href={`/company/${companyId}/briefs`}
            title="No Monday Brief generated yet — open Briefs to generate your first brief"
            className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-[#1F2125]/15 bg-[#1C1D21]/85 px-4 text-xs font-medium text-white no-underline hover:bg-[#1C1D21]"
          >
            <FileText size={13} aria-hidden="true" />
            <span>Generate Monday Brief</span>
          </Link>
        )}

        <button
          type="button"
          onClick={onToggleAdvisor}
          aria-expanded={advisorOpen}
          aria-label={advisorOpen ? "Collapse AI Advisor panel" : "Open AI Advisor panel"}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white"
        >
          {advisorOpen ? (
            <PanelRightClose size={14} aria-hidden="true" />
          ) : (
            <PanelRightOpen size={14} aria-hidden="true" />
          )}
          <span className="hidden sm:inline">AI Advisor</span>
        </button>
      </div>
    </header>
  );
}
