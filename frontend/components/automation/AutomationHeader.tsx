"use client";

import { Globe, Plus } from "lucide-react";

import { useLiveCountdown } from "@/hooks/useCountdown";
import type { Schedule } from "@/lib/types";

export function AutomationHeader({
  schedules,
  primaryTimezone,
  showLocalTime,
  canCreateSchedule,
  isMock,
  onToggleLocalTime,
  onOpenTimezoneSettings,
  onOpenOverrideDialog,
  onNewSchedule,
}: {
  schedules: Schedule[];
  primaryTimezone: string;
  showLocalTime: boolean;
  canCreateSchedule: boolean;
  isMock?: boolean;
  onToggleLocalTime: () => void;
  onOpenTimezoneSettings: () => void;
  onOpenOverrideDialog: () => void;
  onNewSchedule: () => void;
}) {
  const enabledSchedules = schedules.filter((s) => s.enabled);

  // Find earliest upcoming run across all enabled schedules
  let earliestNext: { iso: string; name: string } | null = null;
  for (const s of enabledSchedules) {
    const first = s.nextRuns[0];
    if (!first) continue;
    if (!earliestNext || Date.parse(first) < Date.parse(earliestNext.iso)) {
      earliestNext = { iso: first, name: s.name };
    }
  }

  const nextCountdown = useLiveCountdown(earliestNext?.iso ?? null, { tickMs: 30_000 });

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-[#1F2125]">
            Automation
          </h1>
          {isMock ? (
            <span className="rounded-full border border-[#EA580C]/30 bg-[#EA580C]/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#C2410C]">
              MOCK DATA
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[#4B5058]">
          <span className="tabular font-medium text-[#1F2125]">{enabledSchedules.length}</span> of{" "}
          <span className="tabular font-medium text-[#1F2125]">{schedules.length}</span> jobs active
          {earliestNext ? (
            <>
              {" "}
              · next run{" "}
              <span className="font-mono text-xs font-medium text-[#4F46E5]">
                {nextCountdown.label}
              </span>{" "}
              ({earliestNext.name})
            </>
          ) : (
            " · no upcoming runs scheduled"
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Show in my local time switch */}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/80 bg-white/65 px-3 py-1.5 text-xs font-medium text-[#4B5058] shadow-sm backdrop-blur-md">
          <input
            type="checkbox"
            checked={showLocalTime}
            onChange={onToggleLocalTime}
            className="h-3.5 w-3.5 rounded accent-[#4F46E5]"
          />
          <span>Show in my local time</span>
        </label>

        {/* Timezone chip */}
        <button
          type="button"
          onClick={onOpenTimezoneSettings}
          title="Edit schedule timezone"
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3 font-mono text-xs text-[#1F2125] shadow-sm transition-colors hover:bg-white"
        >
          <Globe size={13} className="text-[#4F46E5]" aria-hidden="true" />
          <span>{showLocalTime ? "Local time" : primaryTimezone}</span>
        </button>

        {/* Secondary glass Add override */}
        <button
          type="button"
          onClick={onOpenOverrideDialog}
          className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] shadow-sm backdrop-blur-md hover:bg-white"
        >
          <Plus size={14} aria-hidden="true" />
          Add override
        </button>

        {/* Primary dark New schedule */}
        {canCreateSchedule ? (
          <button
            type="button"
            onClick={onNewSchedule}
            className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-sm hover:bg-[#2a2c32]"
          >
            <Plus size={14} aria-hidden="true" />
            New schedule
          </button>
        ) : null}
      </div>
    </header>
  );
}
