"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { MOTION_EASE, timelineMarkerGrow } from "@/lib/motion";
import type { JobType, ScheduleFrequency } from "@/lib/types";
import { formatTimeInZone, getDisplayTimezone, JOB_META } from "./jobMeta";

const TICKS = [
  { hour: 6, label: "6am" },
  { hour: 9, label: "9am" },
  { hour: 12, label: "12pm" },
  { hour: 15, label: "3pm" },
  { hour: 18, label: "6pm" },
  { hour: 21, label: "9pm" },
];

function getMinutesInZone(iso: string, tz: string): number {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(dt);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h % 24) * 60 + m;
  } catch {
    return dt.getUTCHours() * 60 + dt.getUTCMinutes();
  }
}

export function DayTimeline({
  jobType,
  frequency,
  nextRuns,
  timezone,
  showLocalTime,
  humanReadable,
}: {
  jobType: JobType;
  frequency: ScheduleFrequency;
  nextRuns: string[];
  timezone: string;
  showLocalTime: boolean;
  humanReadable: string;
}) {
  const { reduced, isDocumentHidden } = useMotionSafe();
  const displayTz = getDisplayTimezone(timezone, showLocalTime);
  const meta = JOB_META[jobType];

  const [nowMinutes, setNowMinutes] = useState<number>(() =>
    getMinutesInZone(new Date().toISOString(), displayTz),
  );

  useEffect(() => {
    const update = () => {
      if (isDocumentHidden) return;
      setNowMinutes(getMinutesInZone(new Date().toISOString(), displayTz));
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [displayTz, isDocumentHidden]);

  const nowPct = Math.max(0, Math.min(100, (nowMinutes / 1440) * 100));
  const nowLabel = formatTimeInZone(new Date().toISOString(), timezone, showLocalTime);

  // Deduplicate unique time-of-day positions from nextRuns
  const markerMinutes = Array.from(
    new Set(nextRuns.slice(0, 4).map((iso) => getMinutesInZone(iso, displayTz))),
  );
  const runTimeStrings = Array.from(
    new Set(nextRuns.slice(0, 4).map((iso) => formatTimeInZone(iso, timezone, showLocalTime))),
  );

  const isHourly = frequency === "hourly";

  return (
    <div className="space-y-1.5 overflow-x-auto pb-1">
      <div className="min-w-[280px] space-y-1">
        {/* Track */}
        <div
          className="relative h-7 rounded-xl border border-[#1F2125]/8 bg-white/60"
          aria-hidden="true"
        >
          {/* Vertical tick marks */}
          {TICKS.map((t) => (
            <span
              key={t.hour}
              style={{ left: `${(t.hour / 24) * 100}%` }}
              className="absolute bottom-0 top-0 w-px bg-[#1F2125]/8"
            />
          ))}

          {/* Scheduled markers */}
          {isHourly ? (
            <motion.div
              variants={timelineMarkerGrow(0, reduced)}
              initial="hidden"
              animate="visible"
              style={{ transformOrigin: "left" }}
              className="pattern-dots absolute inset-y-1.5 left-1 right-1 rounded-lg border border-[#4F46E5]/30"
            />
          ) : (
            markerMinutes.map((mins, idx) => {
              const leftPct = Math.max(2, Math.min(93, (mins / 1440) * 100));
              return (
                <motion.div
                  key={`${mins}-${idx}`}
                  variants={timelineMarkerGrow(idx * 0.05, reduced)}
                  initial="hidden"
                  animate="visible"
                  style={{ left: `${leftPct}%`, width: "6.5%", transformOrigin: "left" }}
                  className={`absolute inset-y-1.5 min-w-[14px] rounded-md border border-[#4F46E5]/35 ${meta.patternClass}`}
                />
              );
            })
          )}

          {/* Real-time "now" hairline */}
          <motion.div
            animate={{ left: `${nowPct}%` }}
            transition={{ duration: reduced ? 0 : 0.4, ease: MOTION_EASE }}
            className="absolute -top-0.5 bottom-0 z-10 w-[1.5px] bg-[#1C1D21]/65"
          >
            <span className="absolute -left-1 -top-0.5 h-2 w-2 rounded-full bg-[#1C1D21]" />
          </motion.div>
        </div>

        {/* Tick labels */}
        <div className="relative h-4 font-mono text-[10.5px] text-[#9AA0AA]">
          {TICKS.map((t) => (
            <span
              key={t.hour}
              style={{ left: `${(t.hour / 24) * 100}%` }}
              className="absolute -translate-x-1/2 whitespace-nowrap"
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Text alternative + pattern legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#4B5058]">
        <span>
          {isHourly ? "Hourly" : `${meta.label} (${meta.patternLabel.toLowerCase()})`} · Now{" "}
          <span className="font-mono">{nowLabel}</span>
        </span>
        <span className="font-mono text-[10.5px] text-[#4F46E5]">
          {isHourly ? "Hourly" : runTimeStrings.join(", ") || "—"}
        </span>
      </div>

      <ul className="sr-only">
        <li>{humanReadable}</li>
        {nextRuns.slice(0, 4).map((iso) => (
          <li key={iso}>{iso}</li>
        ))}
      </ul>
    </div>
  );
}
