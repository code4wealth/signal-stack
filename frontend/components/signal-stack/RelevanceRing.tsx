"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

import type { SourceScoreReason } from "@/lib/types";

export function RelevanceRing({
  score,
  reasons,
}: {
  score: number;
  reasons?: SourceScoreReason[];
}) {
  const reduced = Boolean(useReducedMotion());
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const [displayScore, setDisplayScore] = useState<number>(reduced ? clamped : 0);

  useEffect(() => {
    if (reduced) {
      setDisplayScore(clamped);
      return;
    }
    let frame = 0;
    const duration = 400;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(clamped * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clamped, reduced]);

  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayScore / 100) * circumference;

  const tooltip =
    reasons && reasons.length > 0
      ? reasons.map((r) => `${r.label} (${r.weight})`).join(" · ")
      : `Relevance score ${clamped}/100`;

  return (
    <div className="flex flex-col items-center gap-0.5" title={tooltip}>
      <div className="relative flex h-10 w-10 items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="rgba(31, 33, 37, 0.08)"
            strokeWidth="3.5"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="#4F46E5"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="tabular absolute font-mono text-[11px] font-semibold text-[#1F2125]">
          {displayScore}
        </span>
      </div>
      <span className="font-mono text-[10px] text-[#9AA0AA]">Relevance</span>
    </div>
  );
}
