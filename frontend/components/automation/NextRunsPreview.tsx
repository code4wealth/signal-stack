"use client";

import { AlertCircle, Clock } from "lucide-react";

import { SkeletonBlock } from "@/components/ui-shared";
import type { JobType, ScheduleFrequency, SchedulePreviewResponse } from "@/lib/types";
import { DayTimeline } from "./DayTimeline";
import { formatDateTimeInZone } from "./jobMeta";

export function NextRunsPreview({
  jobType,
  frequency,
  timezone,
  showLocalTime,
  preview,
  isLoading,
  error,
}: {
  jobType: JobType;
  frequency: ScheduleFrequency;
  timezone: string;
  showLocalTime: boolean;
  preview: SchedulePreviewResponse | null;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/85 bg-white/65 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1F2125]">
          <Clock size={13} className="text-[#4F46E5]" aria-hidden="true" />
          <span>Next 5 runs</span>
        </div>
        {preview?.runsPerPeriodLabel ? (
          <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#1F2125]">
            {preview.runsPerPeriodLabel}
          </span>
        ) : null}
      </div>

      {isLoading && !preview ? (
        <SkeletonBlock className="h-20" />
      ) : error ? (
        <p className="flex items-center gap-1.5 text-xs text-[#DC2626]">
          <AlertCircle size={13} className="shrink-0" />
          <span>Could not preview next runs. Check cron expression and timezone.</span>
        </p>
      ) : preview && !preview.valid ? (
        <p className="flex items-center gap-1.5 text-xs text-[#DC2626]">
          <AlertCircle size={13} className="shrink-0" />
          <span>{preview.error || "Invalid schedule."}</span>
        </p>
      ) : preview && preview.nextRuns.length > 0 ? (
        <>
          <ul className="space-y-1">
            {preview.nextRuns.slice(0, 5).map((iso, i) => (
              <li
                key={`${iso}-${i}`}
                className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1 font-mono text-[11px] text-[#1F2125]"
              >
                <span className="text-[#9AA0AA]">#{i + 1}</span>
                <span>{formatDateTimeInZone(iso, timezone, showLocalTime)}</span>
              </li>
            ))}
          </ul>

          <DayTimeline
            jobType={jobType}
            frequency={frequency}
            nextRuns={preview.nextRuns}
            timezone={timezone}
            showLocalTime={showLocalTime}
            humanReadable={preview.humanReadable || ""}
          />
        </>
      ) : (
        <p className="text-xs text-[#9AA0AA]">Adjust fields above to preview upcoming runs.</p>
      )}
    </div>
  );
}
