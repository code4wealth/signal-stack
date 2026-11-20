"use client";

import { Sparkles } from "lucide-react";

import { GlassCard } from "@/components/ui-shared";

export function AuditBanner({
  count,
  onReview,
}: {
  count: number;
  onReview: () => void;
}) {
  if (count <= 0) return null;

  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-[#4F46E5]/25 bg-[#EEF2FF]/75 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/15 text-[#4F46E5]">
          <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold text-[#1F2125]">
            Monthly source audit: {count} proposed change{count === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[#4B5058]">
            Review suggested additions, keeps, and removals before updating your Signal Stack.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onReview}
        className="btn-motion focus-ring inline-flex h-9 items-center rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32]"
      >
        Review changes
      </button>
    </GlassCard>
  );
}
