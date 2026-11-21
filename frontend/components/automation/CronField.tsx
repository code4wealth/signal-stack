"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { SchedulePreviewResponse } from "@/lib/types";

export function CronField({
  value,
  preview,
  isLoading,
  onChange,
}: {
  value: string;
  preview: SchedulePreviewResponse | null;
  isLoading: boolean;
  onChange: (nextCron: string) => void;
}) {
  const errMsg = preview && !preview.valid ? preview.error : null;
  const errId = "cron-field-error";

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="schedule-cron-input"
        className="block text-xs font-medium text-[#1F2125]"
      >
        Cron expression (5 fields: min hour day month weekday)
      </label>

      <input
        id="schedule-cron-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0 7 * * 1"
        aria-invalid={Boolean(errMsg)}
        aria-describedby={errId}
        className={`focus-ring h-9 w-full rounded-xl border bg-white/85 px-3 font-mono text-xs text-[#1F2125] outline-none ${
          errMsg ? "border-[#DC2626]/55" : "border-white/90"
        }`}
      />

      <div id={errId} aria-live="polite" className="min-h-[18px] text-[11px]">
        {isLoading ? (
          <span className="text-[#9AA0AA]">Validating cron…</span>
        ) : errMsg ? (
          <p className="flex items-center gap-1 text-[#DC2626]">
            <AlertCircle size={12} className="shrink-0" />
            <span>{errMsg}</span>
          </p>
        ) : preview?.humanReadable ? (
          <p className="flex items-center gap-1 text-[#059669]">
            <CheckCircle2 size={12} className="shrink-0" />
            <span>{preview.humanReadable}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
