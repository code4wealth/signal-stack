"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

import type { CrawlerOverview } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";

export function HealthGauge({
  health,
  isMock,
}: {
  health: CrawlerOverview["health"];
  isMock?: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const target = Math.max(0, Math.min(100, Math.round(health.healthyPct)));
  const [displayPct, setDisplayPct] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setDisplayPct(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 400);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayPct(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, target]);

  const radius = 64;
  const halfCirc = Math.PI * radius;
  const dashOffset = halfCirc - (displayPct / 100) * halfCirc;

  return (
    <GlassCard className="flex h-full flex-col justify-between gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1F2125]">Source health</h2>
        {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
      </div>

      <div className="flex flex-col items-center justify-center py-1">
        <div className="relative flex flex-col items-center">
          <svg
            width="164"
            height="94"
            viewBox="0 0 164 94"
            aria-label={`${target}% of approved sources healthy`}
          >
            <defs>
              <linearGradient id="crawler-health-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#A5B4FC" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
            </defs>
            <path
              d="M 18 82 A 64 64 0 0 1 146 82"
              fill="none"
              stroke="rgba(31, 33, 37, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 18 82 A 64 64 0 0 1 146 82"
              fill="none"
              stroke="url(#crawler-health-grad)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={halfCirc}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="-mt-10 text-center">
            <p className="tabular text-3xl font-semibold tracking-[-0.03em] text-[#1F2125]">
              {displayPct}%
            </p>
            <p className="text-[11px] text-[#4B5058]">of approved sources healthy</p>
          </div>
        </div>
      </div>

      <div className="space-y-1 border-t border-[#1F2125]/8 pt-3 text-center text-xs">
        <p className="text-[11px] text-[#9AA0AA]">
          Based on the last {health.windowCrawls} crawls per source.
        </p>
        <p className="font-mono text-[11px] font-medium text-[#4B5058]">
          <span className={health.failing > 0 ? "text-[#DC2626]" : "text-[#1F2125]"}>
            {health.failing} failing
          </span>{" "}
          ·{" "}
          <span className={health.stale > 0 ? "text-[#EA580C]" : "text-[#1F2125]"}>
            {health.stale} stale
          </span>
        </p>
      </div>
    </GlassCard>
  );
}
