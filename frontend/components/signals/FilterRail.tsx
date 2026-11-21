"use client";

import { CheckSquare, Loader2 } from "lucide-react";

import type { SourceCategory } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

const CAT_LABELS: { key: SourceCategory; label: string; dot: string }[] = [
  { key: "customers", label: "Customers", dot: "bg-[#0D9488]" },
  { key: "competitors", label: "Competitors", dot: "bg-[#EA580C]" },
  { key: "market", label: "Market", dot: "bg-[#2563EB]" },
  { key: "internal", label: "Internal", dot: "bg-[#7C3AED]" },
];

export function FilterRail({
  total,
  visibleIds,
  countsByClassification,
  countsByCategory,
  isBulkUpdating,
  onBulkAddToBrief,
}: {
  total: number;
  visibleIds: number[];
  countsByClassification: { opportunity: number; threat: number; neutral: number };
  countsByCategory: Record<SourceCategory, number>;
  isBulkUpdating: boolean;
  onBulkAddToBrief: () => void;
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 xl:block" aria-label="Filter summary">
      <div className="sticky top-[68px] space-y-4">
        <GlassCard className="space-y-4 p-4">
          <div className="flex items-center justify-between border-b border-[#1F2125]/8 pb-3">
            <div>
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                Matching feed
              </p>
              <p className="tabular mt-0.5 text-2xl font-semibold text-[#1F2125]">{total}</p>
            </div>
            <span className="font-mono text-[11px] text-[#4B5058]">
              {visibleIds.length} loaded
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
              By classification
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[#15803D]">Opportunities</span>
              <span className="tabular font-mono font-semibold text-[#1F2125]">
                {countsByClassification.opportunity}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#B91C1C]">Threats</span>
              <span className="tabular font-mono font-semibold text-[#1F2125]">
                {countsByClassification.threat}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#475569]">Neutral</span>
              <span className="tabular font-mono font-semibold text-[#1F2125]">
                {countsByClassification.neutral}
              </span>
            </div>
          </div>

          <div className="space-y-2 border-t border-[#1F2125]/8 pt-3 text-xs">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
              By category
            </p>
            {CAT_LABELS.map((c) => (
              <div key={c.key} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[#4B5058]">
                  <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden="true" />
                  {c.label}
                </span>
                <span className="tabular font-mono font-semibold text-[#1F2125]">
                  {countsByCategory[c.key] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={visibleIds.length === 0 || isBulkUpdating}
            onClick={onBulkAddToBrief}
            className="btn-motion focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBulkUpdating ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckSquare size={14} aria-hidden="true" />
            )}
            <span>Select visible → Add to Monday Brief</span>
          </button>
        </GlassCard>
      </div>
    </aside>
  );
}
