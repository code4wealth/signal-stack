"use client";

import { ArrowRight, CheckCircle2, Pencil } from "lucide-react";

import type { LearnedItem } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

export function CompletionSummary({
  learned,
  isCompleting,
  onBuildSignalStack,
  onReviewAnswers,
  onEditTurn,
}: {
  learned: LearnedItem[];
  isCompleting: boolean;
  onBuildSignalStack: () => void;
  onReviewAnswers: () => void;
  onEditTurn: (turnIndex: number) => void;
}) {
  const grouped = new Map<string, LearnedItem[]>();
  for (const item of learned) {
    const bucket = grouped.get(item.topic) ?? [];
    bucket.push(item);
    grouped.set(item.topic, bucket);
  }

  return (
    <div className="space-y-4 pl-11">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#1F2125]">
        <CheckCircle2 size={17} className="text-[#059669]" aria-hidden="true" />
        <span>That&apos;s all 10. Here is what I understood.</span>
      </div>

      <GlassCard className="space-y-4">
        {Array.from(grouped.entries()).map(([topic, items]) => (
          <div key={topic} className="space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
              {topic}
            </p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-white/65 px-3 py-2 text-xs text-[#1F2125]"
                >
                  <span>
                    <span className="mr-1.5 font-mono text-[10px] text-[#4F46E5]">
                      Q{item.sourceTurnIndex + 1}
                    </span>
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditTurn(item.sourceTurnIndex)}
                    aria-label={`Edit question ${item.sourceTurnIndex + 1}`}
                    className="focus-ring shrink-0 rounded p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
                  >
                    <Pencil size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#1F2125]/8 pt-4">
          <button
            type="button"
            onClick={onBuildSignalStack}
            disabled={isCompleting}
            className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_8px_18px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32] disabled:opacity-50"
          >
            {isCompleting ? "Saving interview…" : "Build my Signal Stack"}
            <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onReviewAnswers}
            className="focus-ring inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/75 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            Review answers
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
