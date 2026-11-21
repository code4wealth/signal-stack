"use client";

import { motion } from "framer-motion";
import { ArrowRight, Calendar, TrendingUp } from "lucide-react";

import { ClaimText, GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { accentLineReveal, readingReveal } from "@/lib/motion";
import type { BriefOpportunityItem, BriefSourceItem } from "@/lib/types";
import { formatBriefDate } from "./briefMeta";

const IMPACT_STYLE = {
  high: "border-[#16A34A]/35 bg-[#16A34A]/10 text-[#15803D]",
  medium: "border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0F766E]",
  low: "border-[#64748B]/25 bg-[#64748B]/10 text-[#475569]",
};

export function OpportunitiesSection({
  items,
  sources,
  isMock,
  onJumpToSource,
  onJumpToActions,
}: {
  items: BriefOpportunityItem[];
  sources: BriefSourceItem[];
  isMock?: boolean;
  onJumpToSource: (n: number, originId?: string) => void;
  onJumpToActions: () => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <motion.section
      id="opportunities"
      aria-labelledby="heading-opportunities"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-[#16A34A]/15 bg-[#16A34A]/[0.05]">
        <motion.div
          variants={accentLineReveal(reduced)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="h-[3px] w-full origin-left bg-[#16A34A]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#16A34A]/12 text-[#15803D]"
              aria-hidden="true"
            >
              <TrendingUp size={17} strokeWidth={1.85} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#4B5058]">
                  Section 06
                </span>
                {isMock ? (
                  <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
                    MOCK DATA
                  </span>
                ) : null}
              </div>
              <h2
                id="heading-opportunities"
                className="font-serif text-[22px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
              >
                Opportunities
              </h2>
            </div>
          </div>
          <span className="font-mono text-xs text-[#4B5058]">
            {items.length} identified
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <GlassCard className="p-5 text-sm text-[#4B5058]">
          No new verified opportunities met the threshold for this week&apos;s brief.
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((opp) => {
            const originId = `opp-${opp.id}`;
            return (
              <div key={opp.id} id={originId}>
                <GlassCard
                  spotlight
                  className="flex h-full flex-col justify-between gap-3 p-5"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase ${IMPACT_STYLE[opp.impactLevel]}`}
                      >
                        <TrendingUp size={11} aria-hidden="true" />
                        {opp.impactLevel} impact
                      </span>
                      {opp.actNowBy ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/12 bg-white/80 px-2.5 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
                          <Calendar size={10} aria-hidden="true" />
                          Act by {formatBriefDate(opp.actNowBy)}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="font-serif text-[17.5px] font-medium leading-snug text-[#1F2125]">
                      {opp.headline}
                    </h3>

                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
                        Why it is an opportunity
                      </p>
                      <p className="mt-1 text-[14px] leading-[1.6] text-[#4B5058]">
                        <ClaimText
                          text={opp.explanation.text}
                          citations={opp.explanation.citations}
                          sources={sources}
                          onJumpToSource={(n) => onJumpToSource(n, originId)}
                        />
                      </p>
                    </div>
                  </div>

                  {opp.linkedActionId ? (
                    <div className="no-print border-t border-[#1F2125]/8 pt-2.5">
                      <button
                        type="button"
                        onClick={onJumpToActions}
                        className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] hover:underline"
                      >
                        Linked action <ArrowRight size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}
