"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import type { CrawlRange, CrawlerOverview } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

function AnimatedNumber({ value }: { value: number }) {
  const reduced = Boolean(useReducedMotion());
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 400);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);

  return <span className="tabular text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">{display}</span>;
}

function TrendLine({
  delta,
  range,
  invertGood = false,
}: {
  delta: number | null;
  range: CrawlRange;
  invertGood?: boolean;
}) {
  if (delta === null) {
    return <p className="text-[11px] text-[#9AA0AA]">No previous data</p>;
  }
  const abs = Math.abs(delta).toFixed(1).replace(/\.0$/, "");
  const up = delta > 0;
  const down = delta < 0;
  const isGood = invertGood ? down : up;
  const toneClass =
    delta === 0 ? "text-[#64748B]" : isGood ? "text-[#059669]" : "text-[#DC2626]";

  return (
    <p className={`inline-flex items-center gap-1 text-[11px] font-medium ${toneClass}`}>
      {up ? (
        <ArrowUp size={11} aria-hidden="true" />
      ) : down ? (
        <ArrowDown size={11} aria-hidden="true" />
      ) : (
        <Minus size={11} aria-hidden="true" />
      )}
      <span>
        {abs}% {invertGood ? (down ? "fewer" : "more") : up ? "more" : "fewer"} vs previous {range}
      </span>
    </p>
  );
}

export function TotalsColumn({
  totals,
  range,
}: {
  totals: CrawlerOverview["totals"];
  range: CrawlRange;
}) {
  return (
    <GlassCard className="flex h-full flex-col justify-between divide-y divide-[#1F2125]/8 p-5">
      <div className="pb-3.5">
        <p className="text-xs font-medium text-[#4B5058]">New items</p>
        <div className="mt-1">
          <AnimatedNumber value={totals.new} />
        </div>
        <div className="mt-1">
          <TrendLine delta={totals.deltaPct.new} range={range} />
        </div>
      </div>

      <div className="py-3.5">
        <p className="text-xs font-medium text-[#4B5058]">Changed items</p>
        <div className="mt-1">
          <AnimatedNumber value={totals.changed} />
        </div>
        <div className="mt-1">
          <TrendLine delta={totals.deltaPct.changed} range={range} />
        </div>
      </div>

      <div className="pt-3.5">
        <p className="text-xs font-medium text-[#4B5058]">Failed fetches</p>
        <div className="mt-1">
          <AnimatedNumber value={totals.failed} />
        </div>
        <div className="mt-1">
          <TrendLine delta={totals.deltaPct.failed} range={range} invertGood />
        </div>
      </div>
    </GlassCard>
  );
}
