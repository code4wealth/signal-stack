"use client";

import { ArrowUpRight, FileText } from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import type { CollectedItem } from "@/lib/types";
import { CategoryBadge, EmptyState, GlassCard } from "@/components/ui-shared";

export function LatestEvidence({
  items,
  onSelectItem,
}: {
  items: CollectedItem[];
  onSelectItem: (item: CollectedItem) => void;
}) {
  return (
    <GlassCard className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-[#4B5058]" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-[#1F2125]">Latest evidence</h2>
            <p className="text-[11px] text-[#4B5058]">
              Recent raw items collected by the crawler (never AI text)
            </p>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No collected evidence yet"
          description="Run the crawler to collect fresh source records."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item)}
              className="focus-ring flex flex-col justify-between gap-2 rounded-2xl border border-white/85 bg-white/75 p-3.5 text-left transition-colors hover:bg-white"
            >
              <div className="flex items-center justify-between gap-2">
                <CategoryBadge category={item.category} />
                <span className="font-mono text-[10.5px] text-[#9AA0AA]">
                  {item.domain ?? item.sourceName ?? "Source"} ·{" "}
                  {formatRelativeTime(item.publishedAt || item.fetchedAt)}
                </span>
              </div>
              <p className="line-clamp-1 text-xs font-semibold text-[#1F2125]">{item.title}</p>
              {item.excerpt ? (
                <p className="line-clamp-2 text-[11.5px] leading-relaxed text-[#4B5058]">
                  {item.excerpt}
                </p>
              ) : null}
              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-[#4F46E5]">
                Inspect evidence <ArrowUpRight size={11} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
