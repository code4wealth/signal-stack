"use client";

import Link from "next/link";
import { Download, Loader2, Play } from "lucide-react";

import { exportLogsCsvUrl } from "@/lib/api";
import { formatRelativeTime } from "@/lib/company-adapter";
import type { CrawlRange, CrawlerOverview } from "@/lib/types";
import { StatusPill } from "@/components/ui-shared";

const RANGES: CrawlRange[] = ["7d", "30d", "90d"];

export function CrawlerHeader({
  companyId,
  overview,
  range,
  onRangeChange,
  onRunNow,
  isStarting,
}: {
  companyId: number;
  overview: CrawlerOverview;
  range: CrawlRange;
  onRangeChange: (next: CrawlRange) => void;
  onRunNow: () => void;
  isStarting: boolean;
}) {
  const approvedCount = overview.coverage
    .filter((c) => c.category !== "internal")
    .reduce((acc, c) => acc + c.approved, 0);

  const isRunning = Boolean(overview.activeRun) || isStarting;
  const lastRunTime = overview.lastRun?.startedAt
    ? formatRelativeTime(overview.lastRun.startedAt)
    : "not yet";

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
            Crawler
          </h1>
          {overview.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>
        <p className="text-xs text-[#4B5058]">
          <span className="tabular font-medium text-[#1F2125]">{approvedCount}</span> sources
          monitored · last run <span className="font-mono">{lastRunTime}</span> ·{" "}
          {overview.nextRunAt ? (
            <>
              next run <span className="font-mono">{formatRelativeTime(overview.nextRunAt)}</span>
            </>
          ) : (
            <>
              No schedule set{" "}
              <Link
                href={`/company/${companyId}/automation`}
                className="font-medium text-[#4F46E5] no-underline hover:underline"
              >
                Configure in Automation →
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Range selector */}
        <div
          role="group"
          aria-label="Date range"
          className="glass inline-flex h-9 items-center rounded-xl p-0.5"
        >
          {RANGES.map((r) => {
            const active = range === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                aria-pressed={active}
                className={`focus-ring rounded-lg px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#1C1D21] text-white"
                    : "text-[#4B5058] hover:text-[#1F2125]"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        <a
          href={exportLogsCsvUrl(companyId, range)}
          download
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] no-underline shadow-[0_2px_8px_rgba(31,33,37,0.04)] hover:bg-white"
        >
          <Download size={13} strokeWidth={1.75} aria-hidden="true" />
          Export log (CSV)
        </a>

        <button
          type="button"
          disabled={isRunning}
          onClick={onRunNow}
          className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:cursor-not-allowed disabled:opacity-65"
        >
          {isRunning ? (
            <>
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Run in progress
            </>
          ) : (
            <>
              <Play size={13} strokeWidth={2} aria-hidden="true" />
              Run crawl now
            </>
          )}
        </button>
      </div>
    </header>
  );
}
