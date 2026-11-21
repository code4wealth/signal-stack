"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

import { GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { FAST_TRANSITION, waveStagger } from "@/lib/motion";
import type { DashboardHeatmapCell } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const BUCKETS = [
  "00–03",
  "03–06",
  "06–09",
  "09–12",
  "12–15",
  "15–18",
  "18–21",
  "21–24",
] as const;

const INDIGO_SCALE = [
  "#EEF2FF", // 0: indigo-50
  "#E0E7FF", // 1: indigo-100
  "#C7D2FE", // 2: indigo-200
  "#818CF8", // 3: indigo-400
  "#4F46E5", // 4: indigo-600
] as const;

function colorLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

export function PublishHeatmap({
  cells,
  max,
  insight,
}: {
  cells: DashboardHeatmapCell[];
  max: number;
  insight?: string | null;
}) {
  const { reduced } = useMotionSafe();
  const [hovered, setHovered] = useState<{ day: number; bucket: number; count: number } | null>(
    null,
  );
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const cellMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cells) {
      map.set(`${c.day}-${c.bucket}`, c.count);
    }
    return map;
  }, [cells]);

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    day: number,
    bucket: number,
  ) => {
    let nextDay = day;
    let nextBucket = bucket;
    if (e.key === "ArrowRight") nextDay = (day + 1) % 7;
    else if (e.key === "ArrowLeft") nextDay = (day + 6) % 7;
    else if (e.key === "ArrowDown") nextBucket = (bucket + 1) % 8;
    else if (e.key === "ArrowUp") nextBucket = (bucket + 7) % 8;
    else return;

    e.preventDefault();
    cellRefs.current.get(`${nextDay}-${nextBucket}`)?.focus();
  };

  return (
    <GlassCard spotlight className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">When your sources publish</h2>
          <p className="text-[11px] text-[#4B5058]">
            Items by weekday and time of day (UTC)
          </p>
        </div>

        {/* Gradient legend */}
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#4B5058]">
          <span>0</span>
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {INDIGO_SCALE.map((bg, idx) => (
              <span
                key={idx}
                className="inline-block h-3 w-3 rounded-[3px] border border-[#4F46E5]/10"
                style={{ backgroundColor: bg }}
              />
            ))}
          </span>
          <span className="tabular">{max}</span>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-1">
        <div
          role="grid"
          aria-label="Publishing activity heatmap by weekday and 3-hour window"
          className="min-w-[300px] space-y-1.5"
        >
          {/* Column headers */}
          <div role="row" className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-1.5">
            <span role="columnheader" className="sr-only">
              Time window
            </span>
            {DAYS.map((d, dIdx) => (
              <span
                key={d}
                role="columnheader"
                className={`text-center font-mono text-[10.5px] transition-colors ${
                  hovered?.day === dIdx ? "font-semibold text-[#4F46E5]" : "text-[#9AA0AA]"
                }`}
              >
                {d}
              </span>
            ))}
          </div>

          {/* 8 3-hour rows */}
          {BUCKETS.map((label, bucketIdx) => (
            <div
              key={label}
              role="row"
              className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] items-center gap-1.5"
            >
              <span
                role="rowheader"
                className={`sticky left-0 bg-white/75 pr-1 font-mono text-[10px] backdrop-blur-sm transition-colors ${
                  hovered?.bucket === bucketIdx
                    ? "font-semibold text-[#4F46E5]"
                    : "text-[#9AA0AA]"
                }`}
              >
                {label}
              </span>

              {DAYS.map((dayName, dayIdx) => {
                const count = cellMap.get(`${dayIdx}-${bucketIdx}`) ?? 0;
                const lvl = colorLevel(count, max);
                const bg = INDIGO_SCALE[lvl];
                const isDarkCell = lvl >= 3;
                const isHovered =
                  hovered?.day === dayIdx && hovered?.bucket === bucketIdx;

                return (
                  <motion.button
                    key={`${dayIdx}-${bucketIdx}`}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${dayIdx}-${bucketIdx}`, el);
                    }}
                    type="button"
                    role="gridcell"
                    aria-label={`${count} items · ${dayName} ${label} UTC`}
                    initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                    animate={{
                      opacity: 1,
                      scale: isHovered && !reduced ? 1.06 : 1,
                      backgroundColor: bg,
                    }}
                    transition={
                      reduced
                        ? FAST_TRANSITION
                        : {
                            duration: 0.25,
                            delay: waveStagger(bucketIdx, dayIdx),
                          }
                    }
                    onMouseEnter={() => setHovered({ day: dayIdx, bucket: bucketIdx, count })}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered({ day: dayIdx, bucket: bucketIdx, count })}
                    onBlur={() => setHovered(null)}
                    onKeyDown={(e) => handleCellKeyDown(e, dayIdx, bucketIdx)}
                    className={`focus-ring flex h-6 w-full items-center justify-center rounded-md border border-[#4F46E5]/10 font-mono text-[10px] font-semibold transition-transform ${
                      isDarkCell ? "text-white" : "text-[#1F2125]"
                    }`}
                  >
                    {isHovered ? count : ""}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Hover readout or API insight */}
      <div className="flex min-h-[20px] items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-2.5 text-[11px]">
        {hovered ? (
          <span className="font-mono font-medium text-[#4F46E5]">
            {hovered.count} item{hovered.count === 1 ? "" : "s"} · {DAYS[hovered.day]}{" "}
            {BUCKETS[hovered.bucket]} UTC
          </span>
        ) : insight ? (
          <span className="inline-flex items-center gap-1.5 text-[#4B5058]">
            <Clock size={12} className="shrink-0 text-[#4F46E5]" aria-hidden="true" />
            <span>{insight}</span>
          </span>
        ) : (
          <span className="text-[#9AA0AA]">Hover or focus a cell to inspect counts</span>
        )}
      </div>

      {/* Visually hidden accessible table fallback */}
      <table className="sr-only">
        <caption>Items published by weekday and 3-hour window</caption>
        <thead>
          <tr>
            <th>Window</th>
            {DAYS.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BUCKETS.map((b, bIdx) => (
            <tr key={b}>
              <th>{b}</th>
              {DAYS.map((d, dIdx) => (
                <td key={d}>{cellMap.get(`${dIdx}-${bIdx}`) ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
