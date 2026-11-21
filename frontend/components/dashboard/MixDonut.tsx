"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Minus, TrendingUp } from "lucide-react";

import { EmptyState, GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { MOTION_EASE } from "@/lib/motion";

type MixKey = "opportunity" | "threat" | "neutral";

const SEGMENTS: {
  key: MixKey;
  label: string;
  color: string;
  fill: string;
  Icon: typeof TrendingUp;
}[] = [
  {
    key: "opportunity",
    label: "Opportunities",
    color: "#16A34A",
    fill: "#16A34A",
    Icon: TrendingUp,
  },
  {
    key: "threat",
    label: "Threats",
    color: "#DC2626",
    fill: "url(#donut-threat-hatch)",
    Icon: AlertTriangle,
  },
  {
    key: "neutral",
    label: "Neutral",
    color: "#64748B",
    fill: "url(#donut-neutral-dots)",
    Icon: Minus,
  },
];

export function MixDonut({
  mix,
}: {
  mix: { opportunity: number; threat: number; neutral: number };
}) {
  const { reduced } = useMotionSafe();
  const [hovered, setHovered] = useState<MixKey | null>(null);
  const total = mix.opportunity + mix.threat + mix.neutral;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  let offsetAcc = 0;
  const arcs = SEGMENTS.map((seg, idx) => {
    const count = mix[seg.key];
    const pct = total > 0 ? count / total : 0;
    const len = pct * circumference;
    const dashOffset = -offsetAcc;
    offsetAcc += len;
    return { ...seg, count, pct: Math.round(pct * 100), len, dashOffset, idx };
  });

  return (
    <GlassCard spotlight className="flex h-full flex-col justify-between gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-[#1F2125]">Opportunities vs threats</h2>
        <p className="text-[11px] text-[#4B5058]">Classification breakdown in range</p>
      </div>

      {total === 0 ? (
        <EmptyState
          title="No classified signals yet"
          description="Signal classification mix appears once evidence is analysed."
        />
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <svg
              width="140"
              height="140"
              viewBox="0 0 140 140"
              aria-label={`Signal classification mix: ${mix.opportunity} opportunities, ${mix.threat} threats, ${mix.neutral} neutral`}
            >
              <defs>
                <pattern
                  id="donut-threat-hatch"
                  width="6"
                  height="6"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="#DC2626" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
                </pattern>
                <pattern
                  id="donut-neutral-dots"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="#64748B" />
                  <circle cx="3" cy="3" r="1.1" fill="rgba(255,255,255,0.55)" />
                </pattern>
              </defs>

              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="rgba(31,33,37,0.08)"
                strokeWidth="16"
              />

              <g transform="rotate(-90 70 70)">
                {arcs.map((arc) => {
                  if (arc.count === 0) return null;
                  const dimmed = hovered !== null && hovered !== arc.key;
                  return (
                    <motion.circle
                      key={arc.key}
                      cx="70"
                      cy="70"
                      r={radius}
                      fill="none"
                      stroke={arc.fill}
                      strokeWidth={hovered === arc.key ? 19 : 16}
                      strokeDasharray={`${arc.len} ${circumference}`}
                      strokeDashoffset={arc.dashOffset}
                      initial={reduced ? false : { strokeDasharray: `0 ${circumference}` }}
                      animate={{
                        strokeDasharray: `${arc.len} ${circumference}`,
                        opacity: dimmed ? 0.35 : 1,
                      }}
                      transition={{
                        duration: reduced ? 0.15 : 0.4,
                        delay: reduced ? 0 : arc.idx * 0.08,
                        ease: MOTION_EASE,
                      }}
                    />
                  );
                })}
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="tabular text-2xl font-semibold leading-none text-[#1F2125]">
                {total}
              </span>
              <span className="mt-0.5 font-mono text-[10.5px] text-[#4B5058]">signals</span>
            </div>
          </div>

          <ul className="w-full space-y-1.5 text-xs">
            {arcs.map((arc) => {
              const Icon = arc.Icon;
              return (
                <li key={arc.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setHovered(arc.key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(arc.key)}
                    onBlur={() => setHovered(null)}
                    className={`focus-ring flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors ${
                      hovered === arc.key ? "bg-white/90" : "hover:bg-white/70"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-[#1F2125]">
                      <Icon size={13} style={{ color: arc.color }} aria-hidden="true" />
                      <span>{arc.label}</span>
                    </span>
                    <span className="tabular font-mono text-[11px] text-[#4B5058]">
                      <strong className="text-[#1F2125]">{arc.count}</strong> ({arc.pct}%)
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
