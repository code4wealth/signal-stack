"use client";

import type { SignalItem } from "@/lib/types";
import { ClassificationPill, EmptyState, GlassCard } from "@/components/ui-shared";

export function TopSignalsTable({
  signals,
  onSelectSignal,
  onViewAll,
}: {
  signals: SignalItem[];
  onSelectSignal: (signalId: number) => void;
  onViewAll: () => void;
}) {
  return (
    <GlassCard className="flex h-full flex-col justify-between gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">Top signals</h2>
          <p className="text-[11px] text-[#4B5058]">Highest priority ranked items</p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] hover:underline"
        >
          View all →
        </button>
      </div>

      {signals.length === 0 ? (
        <EmptyState
          title="No ranked signals yet"
          description="Analyse crawled items to rank opportunities and threats."
        />
      ) : (
        <div className="divide-y divide-[#1F2125]/8">
          {signals.slice(0, 5).map((sig, idx) => (
            <button
              key={sig.id}
              type="button"
              onClick={() => onSelectSignal(sig.id)}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/80"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="tabular mt-0.5 font-mono text-[11px] text-[#9AA0AA]">
                  0{idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-xs font-medium text-[#1F2125]">
                    {sig.headline}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#1F2125]/10">
                      <div
                        className="h-full rounded-full bg-[#4F46E5]"
                        style={{ width: `${Math.max(8, sig.priorityValue)}%` }}
                      />
                    </div>
                    <span className="tabular font-mono text-[10.5px] text-[#4B5058]">
                      {sig.priorityValue}
                    </span>
                  </div>
                </div>
              </div>

              <ClassificationPill classification={sig.classification} compact />
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
