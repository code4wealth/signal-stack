"use client";

import type { ReactNode } from "react";
import { ArrowRight, Clock, Gauge } from "lucide-react";

import type { SignalRecommendedAction } from "@/lib/types";

export function ActionBox({
  action,
  rightSlot,
}: {
  action: SignalRecommendedAction;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#1F2125]/12 bg-white/90 px-4 py-3 shadow-[0_2px_10px_rgba(31,33,37,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#1C1D21]">
          <ArrowRight size={12} strokeWidth={2.2} className="text-[#4F46E5]" aria-hidden="true" />
          Recommended action
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {action.effort ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-[#F4F6FB] px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
              <Gauge size={10} aria-hidden="true" />
              {action.effort} effort
            </span>
          ) : null}
          {action.timeframe ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-[#F4F6FB] px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
              <Clock size={10} aria-hidden="true" />
              {action.timeframe}
            </span>
          ) : null}
          {rightSlot}
        </div>
      </div>
      <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#1F2125]">
        {action.text}
      </p>
    </div>
  );
}
