"use client";

import { AlertCircle, Link2, Sparkles } from "lucide-react";

import type { SignalAssumptionRef, SignalImpactLevel } from "@/lib/types";

const IMPACT_BADGE: Record<SignalImpactLevel, string> = {
  high: "border-[#DC2626]/25 bg-[#DC2626]/10 text-[#B91C1C]",
  medium: "border-[#EA580C]/25 bg-[#EA580C]/10 text-[#C2410C]",
  low: "border-[#64748B]/25 bg-[#64748B]/10 text-[#475569]",
};

export function InterpretationBlock({
  whyItMatters,
  potentialImpact,
  impactLevel,
  assumptionRefs,
  limitations,
}: {
  whyItMatters: string;
  potentialImpact: string;
  impactLevel: SignalImpactLevel;
  assumptionRefs: SignalAssumptionRef[];
  limitations?: string | null;
}) {
  return (
    <div
      data-reply-selectable="true"
      className="rounded-2xl border border-[#4F46E5]/15 bg-indigo-50/75 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4F46E5]">
          <Sparkles size={11} strokeWidth={2.2} aria-hidden="true" />
          AI interpretation
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium ${IMPACT_BADGE[impactLevel]}`}
        >
          {potentialImpact}
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-[#1F2125]">
        {whyItMatters || "No additional interpretation recorded."}
      </p>

      {assumptionRefs.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {assumptionRefs.map((ref) => (
            <span
              key={`${ref.type}-${ref.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-[#4F46E5]/20 bg-white/80 px-2.5 py-0.5 font-mono text-[10.5px] text-[#4B5058]"
            >
              <Link2 size={10} className="text-[#4F46E5]" aria-hidden="true" />
              {ref.label}
            </span>
          ))}
        </div>
      ) : null}

      {limitations ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#4B5058]">
          <AlertCircle size={12} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
          <span>Limitation: {limitations}</span>
        </p>
      ) : null}
    </div>
  );
}
