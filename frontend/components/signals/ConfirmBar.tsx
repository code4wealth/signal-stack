"use client";

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

export function ConfirmBar({
  companyId,
  inBriefCount,
  unreviewedCount,
}: {
  companyId: number;
  inBriefCount: number;
  unreviewedCount: number;
}) {
  return (
    <div className="sticky bottom-3 z-20 mx-auto max-w-6xl px-1">
      <div className="glass-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/90 px-4 py-3 shadow-[0_12px_32px_rgba(31,33,37,0.08)] sm:px-5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5]">
            <FileText size={15} aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-[#1F2125]">
              {inBriefCount > 0
                ? `${inBriefCount} signal${inBriefCount === 1 ? "" : "s"} queued for Monday Brief`
                : "Select signals to shape your Monday Brief"}
            </p>
            <p className="text-[11px] text-[#4B5058]">
              {unreviewedCount} unreviewed signal{unreviewedCount === 1 ? "" : "s"} remaining in feed
            </p>
          </div>
        </div>

        <Link
          href={`/company/${companyId}/brief`}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
        >
          <span>Generate Monday Brief</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
