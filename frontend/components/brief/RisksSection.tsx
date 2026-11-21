"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";

import { ClaimText, GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { accentLineReveal, readingReveal } from "@/lib/motion";
import type { BriefOpportunityItem, BriefSourceItem } from "@/lib/types";

const LEVEL_RANK = { high: 3, medium: 2, low: 1 } as const;

const RISK_BADGE = {
  high: "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#B91C1C]",
  medium: "border-[#EA580C]/30 bg-[#EA580C]/10 text-[#C2410C]",
  low: "border-[#64748B]/25 bg-[#64748B]/10 text-[#475569]",
};

export function RisksSection({
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
  const sorted = [...items].sort(
    (a, b) =>
      LEVEL_RANK[b.impactLevel] +
      LEVEL_RANK[b.likelihood] -
      (LEVEL_RANK[a.impactLevel] + LEVEL_RANK[a.likelihood]),
  );

  return (
    <motion.section
      id="risks"
      aria-labelledby="heading-risks"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="space-y-4"
    >
      <div className="overflow-hidden rounded-2xl border border-[#DC2626]/15 bg-[#DC2626]/[0.05]">
        <motion.div
          variants={accentLineReveal(reduced)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="h-[3px] w-full origin-left bg-[#DC2626]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DC2626]/12 text-[#B91C1C]"
              aria-hidden="true"
            >
              <AlertTriangle size={17} strokeWidth={1.85} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#4B5058]">
                  Section 08
                </span>
                {isMock ? (
                  <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
                    MOCK DATA
                  </span>
                ) : null}
              </div>
              <h2
                id="heading-risks"
                className="font-serif text-[22px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
              >
                Risks & Threats
              </h2>
            </div>
          </div>
          <span className="font-mono text-xs text-[#4B5058]">
            Priority-sorted · {sorted.length}
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <GlassCard className="p-5 text-sm text-[#4B5058]">
          No material risks or competitive threats were verified in this window.
        </GlassCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((risk) => {
            const originId = `risk-${risk.id}`;
            return (
              <div key={risk.id} id={originId}>
                <GlassCard spotlight className="flex h-full flex-col justify-between gap-3 p-5">
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase ${RISK_BADGE[risk.likelihood]}`}
                      >
                        <ShieldAlert size={11} aria-hidden="true" />
                        {risk.likelihood} likelihood
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase ${RISK_BADGE[risk.impactLevel]}`}
                      >
                        {risk.impactLevel} impact
                      </span>
                    </div>

                    <h3 className="font-serif text-[17.5px] font-medium leading-snug text-[#1F2125]">
                      {risk.headline}
                    </h3>

                    <div>
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
                        Why it is a risk
                      </p>
                      <div className="mt-1 text-[14px] leading-[1.6] text-[#4B5058]">
                        <ClaimText
                          text={risk.explanation.text}
                          citations={risk.explanation.citations}
                          sources={sources}
                          onJumpToSource={(n) => onJumpToSource(n, originId)}
                        />
                      </div>
                    </div>
                  </div>

                  {risk.linkedActionId ? (
                    <div className="no-print border-t border-[#1F2125]/8 pt-2.5">
                      <button
                        type="button"
                        onClick={onJumpToActions}
                        className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
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
