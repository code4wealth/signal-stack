"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarOff, X } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { previewOverride } from "@/lib/api";
import { commandDialogMotion } from "@/lib/motion";
import type { OverrideDraft, OverrideType, Schedule } from "@/lib/types";

const OVERRIDE_TYPES: { key: OverrideType; label: string }[] = [
  { key: "pause", label: "Pause job(s) until a date" },
  { key: "skip", label: "Skip a single run" },
  { key: "reschedule", label: "Reschedule one run" },
  { key: "run_once", label: "Run once at a specific time" },
  { key: "blackout", label: "Add blackout date range" },
];

export function OverrideDialog({
  companyId,
  open,
  defaultScheduleId,
  defaultType,
  schedules,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  companyId: number;
  open: boolean;
  defaultScheduleId?: number | null;
  defaultType?: OverrideType;
  schedules: Schedule[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (draft: OverrideDraft) => Promise<unknown>;
}) {
  const { reduced } = useMotionSafe();
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [type, setType] = useState<OverrideType>(defaultType ?? "skip");
  const [scheduleId, setScheduleId] = useState<number | "all">(
    defaultScheduleId ?? schedules[0]?.id ?? "all",
  );
  const [startDate, setStartDate] = useState(tomorrow);
  const [startTime, setStartTime] = useState("07:00");
  const [endDate, setEndDate] = useState(tomorrow);
  const [newTime, setNewTime] = useState(`${tomorrow}T09:00`);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(defaultType ?? "skip");
    setScheduleId(defaultScheduleId ?? schedules[0]?.id ?? "all");
    setReason("");
  }, [defaultScheduleId, defaultType, open, schedules]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const draft = useMemo<OverrideDraft>(() => {
    const startsIso = new Date(`${startDate}T${startTime}:00Z`).toISOString();
    const endsIso =
      type === "pause" || type === "blackout"
        ? new Date(`${endDate}T23:59:59Z`).toISOString()
        : null;
    const newIso =
      type === "reschedule" && newTime ? new Date(newTime).toISOString() : null;

    return {
      scheduleId: type === "blackout" || scheduleId === "all" ? null : Number(scheduleId),
      type,
      startsAt: startsIso,
      endsAt: endsIso,
      newTime: newIso,
      reason: reason.trim() || undefined,
    };
  }, [endDate, newTime, reason, scheduleId, startDate, startTime, type]);

  const previewQuery = useQuery({
    queryKey: ["override-preview", companyId, JSON.stringify(draft)],
    queryFn: () => previewOverride(companyId, draft),
    enabled: open && Number.isFinite(companyId) && companyId > 0,
    staleTime: 5_000,
    retry: 0,
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(draft);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-[#1F2125]/30 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.div
          variants={commandDialogMotion(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Add schedule override"
          className="glass-strong relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/85 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[#1F2125]/8 px-5 py-4">
            <div className="flex items-center gap-2">
              <CalendarOff size={16} className="text-[#4F46E5]" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-[#1F2125]">Add schedule override</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close override dialog"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5 text-xs">
            <div>
              <label htmlFor="ov-type" className="mb-1 block font-medium text-[#1F2125]">
                Override type
              </label>
              <select
                id="ov-type"
                value={type}
                onChange={(e) => setType(e.target.value as OverrideType)}
                className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              >
                {OVERRIDE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {type !== "blackout" ? (
              <div>
                <label htmlFor="ov-job" className="mb-1 block font-medium text-[#1F2125]">
                  Target job
                </label>
                <select
                  id="ov-job"
                  value={String(scheduleId)}
                  onChange={(e) =>
                    setScheduleId(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                  className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
                >
                  {type === "pause" ? <option value="all">All active jobs</option> : null}
                  {schedules.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ov-start-date" className="mb-1 block font-medium text-[#1F2125]">
                  {type === "pause" || type === "blackout" ? "Start date" : "Date"}
                </label>
                <input
                  id="ov-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs"
                />
              </div>

              {type === "pause" || type === "blackout" ? (
                <div>
                  <label htmlFor="ov-end-date" className="mb-1 block font-medium text-[#1F2125]">
                    End date
                  </label>
                  <input
                    id="ov-end-date"
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs"
                  />
                </div>
              ) : type === "run_once" ? (
                <div>
                  <label htmlFor="ov-start-time" className="mb-1 block font-medium text-[#1F2125]">
                    Time (UTC)
                  </label>
                  <input
                    id="ov-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs"
                  />
                </div>
              ) : type === "reschedule" ? (
                <div>
                  <label htmlFor="ov-new-time" className="mb-1 block font-medium text-[#1F2125]">
                    Move to
                  </label>
                  <input
                    id="ov-new-time"
                    type="datetime-local"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="ov-reason" className="mb-1 block font-medium text-[#1F2125]">
                Reason (optional)
              </label>
              <input
                id="ov-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Company offsite or pricing launch freeze"
                className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs"
              />
            </div>

            {/* Live override preview & conflicts */}
            {previewQuery.data ? (
              <div className="space-y-2 rounded-2xl border border-white/85 bg-white/70 p-3">
                <p className="font-medium text-[#1F2125]">{previewQuery.data.summary}</p>
                {previewQuery.data.affectedRuns.length > 0 ? (
                  <ul className="space-y-1 font-mono text-[10.5px] text-[#4B5058]">
                    {previewQuery.data.affectedRuns.slice(0, 4).map((r, i) => (
                      <li key={`${r.scheduleId}-${r.scheduledFor}-${i}`}>
                        · {r.jobName} ({r.scheduledFor.slice(0, 16).replace("T", " ")})
                      </li>
                    ))}
                  </ul>
                ) : null}
                {previewQuery.data.conflicts.map((c) => (
                  <p
                    key={c}
                    className="flex items-start gap-1.5 rounded-xl border border-[#EA580C]/30 bg-[#EA580C]/10 px-2.5 py-1.5 text-[11px] text-[#9A3412]"
                  >
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{c}</span>
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-[#1F2125]/8 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring h-9 rounded-xl border border-white/85 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-motion focus-ring h-9 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white disabled:opacity-45"
              >
                {isSubmitting ? "Applying…" : "Apply override"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
