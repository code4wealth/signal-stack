"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";

import {
  CategoryBadge,
  ClaimText,
  ClassificationPill,
  GlassCard,
  PriorityDots,
} from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { readingReveal } from "@/lib/motion";
import type { BriefSectionItem, BriefSourceItem } from "@/lib/types";

export function ExecutiveSummarySection({
  items,
  sources,
  onJumpToSource,
  onJumpToCategoryItem,
  onInspectSignal,
}: {
  items: BriefSectionItem[];
  sources: BriefSourceItem[];
  onJumpToSource: (n: number, originId?: string) => void;
  onJumpToCategoryItem: (category: string, signalId: string) => void;
  onInspectSignal: (signalId: number) => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <motion.section
      id="executive-summary"
      aria-labelledby="heading-executive-summary"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10%" }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1F2125]/10 pb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs font-semibold text-[#4F46E5]">01</span>
          <h2
            id="heading-executive-summary"
            className="font-serif text-[22px] font-medium tracking-[-0.015em] text-[#1F2125]"
          >
            Executive Summary
          </h2>
        </div>
        <span className="font-mono text-xs text-[#4B5058]">
          Top {items.length} of 5 priority slots
        </span>
      </div>

      {items.length === 0 ? (
        <GlassCard className="p-6 text-sm text-[#4B5058]">
          No priority executive developments met the verified citation threshold for this period.
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {items.slice(0, 5).map((item, idx) => {
            const originId = `claim-${item.id}`;
            return (
              <div key={item.id} id={originId}>
                <GlassCard spotlight className="relative overflow-hidden p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <span
                    aria-hidden="true"
                    className="select-none font-serif text-[44px] font-medium leading-none text-[#1F2125]/20 sm:w-14 sm:shrink-0"
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassificationPill classification={item.classification} />
                      <CategoryBadge category={item.category} />
                      <PriorityDots priority={item.priority} />
                    </div>

                    <h3 className="font-serif text-[19px] font-medium leading-snug text-[#1F2125]">
                      {item.headline}
                    </h3>

                    {/* Verified Fact */}
                    <div className="rounded-xl border border-[#059669]/20 bg-white/80 px-3.5 py-2.5">
                      <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-[#059669]/30 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-[#047857]">
                        <CheckCircle2 size={10} aria-hidden="true" />
                        Verified fact
                      </span>
                      <p className="mt-1 text-[14.5px] leading-[1.6] text-[#1F2125]">
                        <ClaimText
                          text={item.fact.text}
                          citations={item.fact.citations}
                          sources={sources}
                          onJumpToSource={(n) => onJumpToSource(n, originId)}
                        />
                      </p>
                    </div>

                    {/* AI Interpretation */}
                    <div className="rounded-xl border border-[#4F46E5]/15 bg-indigo-50/75 px-3.5 py-2.5">
                      <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4F46E5]">
                        <Sparkles size={11} aria-hidden="true" />
                        AI interpretation
                      </span>
                      <p className="mt-1 text-[14px] leading-[1.6] text-[#1F2125]">
                        <ClaimText
                          text={item.whyItMatters.text}
                          citations={item.whyItMatters.citations}
                          sources={sources}
                          onJumpToSource={(n) => onJumpToSource(n, originId)}
                        />
                      </p>
                    </div>

                    <div className="no-print flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onJumpToCategoryItem(item.category, item.signalId)}
                        className="focus-ring inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:underline"
                      >
                        Jump to detail <ArrowRight size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectSignal(Number(item.signalId))}
                        className="focus-ring rounded-lg border border-[#1F2125]/12 bg-white px-2.5 py-1 text-xs font-medium text-[#4B5058] hover:text-[#1F2125]"
                      >
                        Open signal drawer
                      </button>
                    </div>
                  </div>
                </div>
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && items.length < 5 ? (
        <p className="text-xs italic text-[#4B5058]">
          Note: {items.length} signal{items.length === 1 ? "" : "s"} met the evidence threshold for the Executive Summary this period (up to 5 shown).
        </p>
      ) : null}
    </motion.section>
  );
}
