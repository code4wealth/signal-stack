"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { CrawlRun } from "@/lib/types";

export function ConfirmBar({
  companyId,
  lastRun,
  hasCompletedRun,
}: {
  companyId: number;
  lastRun: CrawlRun | null | undefined;
  hasCompletedRun: boolean;
}) {
  const newCount = lastRun?.counts.new ?? 0;
  const changedCount = lastRun?.counts.changed ?? 0;

  return (
    <div className="glass-strong sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3.5">
      <p className="text-xs text-[#4B5058]">
        <span className="tabular font-semibold text-[#1F2125]">{newCount}</span> new and{" "}
        <span className="tabular font-semibold text-[#1F2125]">{changedCount}</span> changed items
        collected in the last run.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/company/${companyId}/automation`}
          className="focus-ring inline-flex h-9 items-center rounded-xl border border-white/80 bg-white/80 px-3.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
        >
          Open Automation
        </Link>

        <div className="flex items-center gap-2.5">
          {!hasCompletedRun ? (
            <span className="text-[11px] font-medium text-[#9AA0AA]">Run a crawl first</span>
          ) : null}

          {hasCompletedRun ? (
            <Link
              href={`/company/${companyId}/signals`}
              className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
            >
              Analyse signals <ArrowRight size={13} aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white opacity-45"
            >
              Analyse signals <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
