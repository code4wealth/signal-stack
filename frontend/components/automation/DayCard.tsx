"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  SkipForward,
  XCircle,
} from "lucide-react";

import { StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import type { CalendarDay, CalendarDayRun } from "@/lib/types";
import { formatTimeInZone, JOB_META } from "./jobMeta";

function runBadge(state: CalendarDayRun["state"]) {
  switch (state) {
    case "success":
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Success" };
    case "failed":
      return { tone: "threat" as const, Icon: XCircle, label: "Failed" };
    case "skipped":
      return { tone: "warning" as const, Icon: SkipForward, label: "Skipped" };
    case "missed":
      return { tone: "threat" as const, Icon: AlertTriangle, label: "Missed" };
    case "scheduler_off":
      return { tone: "neutral" as const, Icon: PauseCircle, label: "Scheduler off" };
    case "running":
      return { tone: "info" as const, Icon: Clock, label: "Running" };
    default:
      return null;
  }
}

export function DayCard({
  day,
  isToday,
  timezone,
  showLocalTime,
  onSelect,
  onKeyNav,
}: {
  day: CalendarDay;
  isToday: boolean;
  timezone: string;
  showLocalTime: boolean;
  onSelect: () => void;
  onKeyNav: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { reduced } = useMotionSafe();
  const dt = new Date(`${day.date}T12:00:00Z`);
  const weekday = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  const dayNumber = dt.getUTCDate();

  const failedCount = day.runs.filter((r) => r.state === "failed" || r.state === "missed").length;
  const hasOverride = day.overrides.length > 0;
  const firstOverride = day.overrides[0];
  const visibleRuns = day.runs.slice(0, 3);
  const extraRuns = Math.max(0, day.runs.length - 3);
  const todayHasFuture =
    isToday && day.runs.some((r) => Date.parse(r.time) > Date.now());

  const cardBase = day.isOffDay
    ? "bg-[#EDF1FA]/75 border-white/70"
    : "glass-strong";

  const todayRing = isToday
    ? `ring-[1.5px] ring-[#4F46E5] bg-[#EEF2FF]/60 ${reduced ? "" : "automation-today-pulse"}`
    : "";

  return (
    <button
      type="button"
      role="gridcell"
      aria-label={`${day.date}, ${day.runs.length} run${day.runs.length === 1 ? "" : "s"}`}
      onClick={onSelect}
      onKeyDown={onKeyNav}
      className={`focus-ring card-interactive flex min-h-[196px] w-full min-w-[175px] snap-start flex-col justify-between rounded-2xl border p-3.5 text-left xl:min-w-0 ${cardBase} ${todayRing}`}
    >
      <div className="space-y-2.5">
        {/* Top date header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-[#9AA0AA]">
                {weekday}
              </span>
              {hasOverride ? (
                <span
                  className="h-2 w-2 rounded-full bg-[#EA580C]"
                  title="Schedule override on this day"
                />
              ) : null}
              {failedCount > 0 ? (
                <span
                  className="h-2 w-2 rounded-full bg-[#DC2626]"
                  title={`${failedCount} failed`}
                />
              ) : null}
            </div>
            <p className="tabular mt-0.5 text-[32px] font-semibold leading-none tracking-[-0.03em] text-[#1F2125]">
              {dayNumber}
            </p>
          </div>

          {isToday ? (
            <span className="rounded-full bg-[#4F46E5] px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
              Today
            </span>
          ) : null}
        </div>

        {/* Override or failed summary note */}
        {failedCount > 0 ? (
          <p className="flex items-center gap-1 text-[11px] font-medium text-[#B91C1C]">
            <XCircle size={11} className="shrink-0" aria-hidden="true" />
            <span>{failedCount} failed</span>
          </p>
        ) : firstOverride ? (
          <p className="flex items-center gap-1 truncate text-[11px] font-medium text-[#C2410C]">
            <PauseCircle size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">
              {firstOverride.reason ||
                (firstOverride.type === "pause"
                  ? "Paused"
                  : firstOverride.type === "skip"
                    ? "Skipped"
                    : firstOverride.type === "reschedule"
                      ? "Moved"
                      : firstOverride.type === "blackout"
                        ? "Blackout"
                        : "Run once")}
            </span>
          </p>
        ) : null}

        {/* Thin "now" marker on Today */}
        {todayHasFuture ? (
          <div className="flex items-center gap-1.5 py-0.5" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
            <span className="h-px flex-1 bg-[#4F46E5]/45" />
            <span className="font-mono text-[9px] uppercase text-[#4F46E5]">now</span>
          </div>
        ) : null}

        {/* Runs list */}
        {day.runs.length === 0 ? (
          <p className="pt-2 text-xs text-[#9AA0AA]">No runs</p>
        ) : (
          <ul className="space-y-1.5">
            {visibleRuns.map((run, idx) => {
              const meta = JOB_META[run.jobType];
              const Icon = meta.Icon;
              const badge = runBadge(run.state);
              const isPast = Date.parse(run.time) < Date.now();
              const timeStr = formatTimeInZone(run.time, timezone, showLocalTime);

              return (
                <li
                  key={`${run.scheduleId}-${run.time}-${idx}`}
                  className="flex items-center justify-between gap-1.5 rounded-xl bg-white/75 px-2 py-1.5 text-[11px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon size={12} className={`shrink-0 ${meta.tintText === "text-white" ? "text-[#4F46E5]" : meta.tintText}`} aria-hidden="true" />
                    <span className="truncate font-medium text-[#1F2125]">
                      {meta.shortLabel}
                    </span>
                  </span>

                  {isPast && badge ? (
                    <StatusPill tone={badge.tone} icon={<badge.Icon size={10} />}>
                      <span className="text-[10px]">{badge.label}</span>
                    </StatusPill>
                  ) : (
                    <span className="tabular shrink-0 font-mono text-[10.5px] text-[#4B5058]">
                      {timeStr}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {extraRuns > 0 ? (
        <p className="mt-2 font-mono text-[10.5px] font-medium text-[#4F46E5]">
          +{extraRuns} more
        </p>
      ) : null}
    </button>
  );
}
