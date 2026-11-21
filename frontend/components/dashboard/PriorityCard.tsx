"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { BASE_TRANSITION } from "@/lib/motion";
import type { CollectedItem, SignalItem } from "@/lib/types";
import {
  CategoryBadge,
  ClassificationPill,
  EvidenceChip,
  PriorityDots,
} from "@/components/ui-shared";

export function PriorityCard({
  rank,
  signal,
  evidenceItem,
  onOpenSignal,
  onOpenEvidence,
}: {
  rank: 1 | 2 | 3;
  signal: SignalItem;
  evidenceItem?: CollectedItem | null;
  onOpenSignal: (signalId: number) => void;
  onOpenEvidence?: (item: CollectedItem) => void;
}) {
  const { reduced } = useMotionSafe();
  const domain = evidenceItem?.domain ?? signal.sourceDomains[0] ?? "Source";

  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : (rank - 1) * 0.08 }}
      whileHover={reduced ? undefined : { y: -2 }}
      className="group flex flex-col justify-between gap-3 rounded-2xl border border-white/90 bg-white/80 p-4 shadow-[0_8px_24px_rgba(31,33,37,0.05)] transition-shadow hover:shadow-[0_14px_32px_rgba(31,33,37,0.08)]"
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={signal.category} />
            <ClassificationPill classification={signal.classification} compact />
          </div>
          <motion.span
            initial={reduced ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 0.2, x: 0 }}
            transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.08 + (rank - 1) * 0.06 }}
            className="tabular select-none text-[40px] font-semibold leading-none tracking-[-0.04em] text-[#1F2125]"
            aria-hidden="true"
          >
            {rank}
          </motion.span>
        </div>

        <PriorityDots priority={signal.priority} compact />

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#1F2125]">
          {signal.headline}
        </h3>

        {/* Fact vs Interpretation badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {signal.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/25 bg-[#059669]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#047857]">
              <CheckCircle2 size={10} aria-hidden="true" />
              Verified
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-[#4F46E5]/20 bg-indigo-50/90 px-2 py-0.5 font-mono text-[10px] font-medium text-[#4F46E5]">
            <Sparkles size={10} aria-hidden="true" />
            AI interpretation
          </span>
        </div>

        {/* Mini ActionBox whose border brightens on hover */}
        <div className="rounded-xl border border-indigo-300/70 bg-white/95 px-3 py-2.5 transition-colors duration-150 group-hover:border-indigo-500">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#4F46E5]">
            Do this week:
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs font-medium leading-relaxed text-[#1F2125]">
            {signal.recommendedAction.text}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-2.5">
        {evidenceItem ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <EvidenceChip
              compact
              evidence={{
                id: String(evidenceItem.id),
                url: evidenceItem.url,
                title: evidenceItem.title,
                type: "webpage",
                usedFor: signal.category,
                fetchedAt: evidenceItem.fetchedAt,
                verified: signal.verified,
              }}
            />
            {onOpenEvidence ? (
              <button
                type="button"
                onClick={() => onOpenEvidence(evidenceItem)}
                className="focus-ring shrink-0 font-mono text-[10px] text-[#4B5058] hover:text-[#1F2125] hover:underline"
              >
                Inspect
              </button>
            ) : null}
          </div>
        ) : (
          <span className="font-mono text-[10.5px] text-[#9AA0AA]">{domain}</span>
        )}

        <button
          type="button"
          onClick={() => onOpenSignal(signal.id)}
          className="focus-ring inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#4F46E5] hover:underline"
        >
          <span>Open signal</span>
          <ArrowRight
            size={12}
            className={reduced ? "" : "transition-transform duration-150 group-hover:translate-x-[3px]"}
            aria-hidden="true"
          />
        </button>
      </div>
    </motion.article>
  );
}
