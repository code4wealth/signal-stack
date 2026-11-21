"use client";

import type { SourceCategory } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

const CATEGORY_META: Record<SourceCategory, { label: string; color: string }> = {
  customers: { label: "Customers", color: "#0D9488" },
  competitors: { label: "Competitors", color: "#EA580C" },
  market: { label: "Market", color: "#2563EB" },
  internal: { label: "Internal", color: "#7C3AED" },
};

export function CategoryAllocation({
  byCategory,
  avgConfidence,
  sourcesUsed,
  awaitingReview,
  onSelectCategory,
}: {
  byCategory: { category: SourceCategory; count: number }[];
  avgConfidence: string;
  sourcesUsed: number;
  awaitingReview: number;
  onSelectCategory: (cat: SourceCategory) => void;
}) {
  const total = byCategory.reduce((acc, row) => acc + row.count, 0);

  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">Signals by category</h2>
          <p className="text-[11px] text-[#4B5058]">
            Distribution across monitored intelligence streams
          </p>
        </div>
        <span className="tabular font-mono text-xs text-[#4B5058]">{total} total</span>
      </div>

      {/* Horizontal segmented bar */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-[#1F2125]/8"
        role="img"
        aria-label="Signals by category distribution"
      >
        {total === 0 ? (
          <div className="h-full w-full bg-[#1F2125]/8" />
        ) : (
          byCategory.map((row) => {
            if (row.count <= 0) return null;
            const pct = (row.count / total) * 100;
            return (
              <button
                key={row.category}
                type="button"
                title={`${CATEGORY_META[row.category].label}: ${row.count}`}
                onClick={() => onSelectCategory(row.category)}
                style={{
                  width: `${pct}%`,
                  backgroundColor: CATEGORY_META[row.category].color,
                }}
                className="h-full transition-opacity hover:opacity-85"
              />
            );
          })
        )}
      </div>

      {/* Legend + 3 mini stats */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {byCategory.map((row) => {
            const meta = CATEGORY_META[row.category];
            return (
              <button
                key={row.category}
                type="button"
                onClick={() => onSelectCategory(row.category)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-xs text-[#4B5058] hover:bg-white/80 hover:text-[#1F2125]"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span>{meta.label}</span>
                <span className="tabular font-mono font-semibold text-[#1F2125]">
                  {row.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-[#1F2125]/8 pt-3 sm:border-t-0 sm:pt-0">
          <div>
            <p className="font-mono text-[10px] uppercase text-[#9AA0AA]">Avg confidence</p>
            <p className="text-xs font-semibold text-[#1F2125]">{avgConfidence}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-[#9AA0AA]">Sources used</p>
            <p className="tabular text-xs font-semibold text-[#1F2125]">{sourcesUsed}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-[#9AA0AA]">Awaiting review</p>
            <p className="tabular text-xs font-semibold text-[#1F2125]">{awaitingReview}</p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
