"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Play,
  SkipForward,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { getCalendar } from "@/lib/api";
import { BASE_TRANSITION, sidePanelSlide } from "@/lib/motion";
import type { CalendarDayRun, OverrideDraft, Schedule } from "@/lib/types";
import { formatTimeInZone, JOB_META } from "./jobMeta";

export function DayDrawer({
  companyId,
  open,
  selectedDate,
  pickMode,
  schedules,
  timezone,
  showLocalTime,
  onClose,
  onSelectDate,
  onOpenRun,
  onRunNow,
  onCreateOverride,
  onDeleteOverride,
}: {
  companyId: number;
  open: boolean;
  selectedDate: string;
  pickMode: boolean;
  schedules: Schedule[];
  timezone: string;
  showLocalTime: boolean;
  onClose: () => void;
  onSelectDate: (isoDate: string) => void;
  onOpenRun: (runId: number) => void;
  onRunNow: (scheduleId: number) => Promise<unknown>;
  onCreateOverride: (draft: OverrideDraft) => Promise<unknown>;
  onDeleteOverride: (overrideId: number) => Promise<unknown>;
}) {
  const { reduced } = useMotionSafe();
  const [rescheduleTarget, setRescheduleTarget] = useState<CalendarDayRun | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  useEffect(() => {
    setRescheduleTarget(null);
  }, [selectedDate, open]);

  const dayQuery = useQuery({
    queryKey: ["automation-calendar", companyId, selectedDate, selectedDate],
    queryFn: () => getCalendar(companyId, selectedDate, selectedDate),
    enabled: open && Boolean(selectedDate) && Number.isFinite(companyId) && companyId > 0,
  });

  if (!open) return null;

  const day = dayQuery.data?.[0];
  const todayIso = new Date().toISOString().slice(0, 10);
  const isTodayOrPast = selectedDate <= todayIso;

  const handleSkip = async (run: CalendarDayRun) => {
    setBusyKey(`skip-${run.scheduleId}-${run.time}`);
    try {
      await onCreateOverride({
        scheduleId: run.scheduleId,
        type: "skip",
        startsAt: run.time,
        reason: `Skipped ${run.jobName} on ${selectedDate}`,
      });
      await dayQuery.refetch();
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDateTime) return;
    setBusyKey(`resched-${rescheduleTarget.scheduleId}`);
    try {
      await onCreateOverride({
        scheduleId: rescheduleTarget.scheduleId,
        type: "reschedule",
        startsAt: rescheduleTarget.time,
        newTime: new Date(rescheduleDateTime).toISOString(),
        reason: `Moved from ${selectedDate}`,
      });
      setRescheduleTarget(null);
      await dayQuery.refetch();
    } finally {
      setBusyKey(null);
    }
  };

  const schedName = (sid?: number | null) =>
    sid ? (schedules.find((s) => s.id === sid)?.name ?? `Schedule #${sid}`) : "All jobs";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.aside
          variants={sidePanelSlide(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label={`Schedule for ${selectedDate}`}
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[440px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#4F46E5]" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-[#1F2125]">
                  {pickMode ? "Pick a future date" : selectedDate}
                </h2>
              </div>
              <p className="text-xs text-[#4B5058]">
                Inspect runs, skip or move a single occurrence, or remove overrides.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close day drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
            {/* Date picker (always available, highlighted in pickMode) */}
            <div>
              <label htmlFor="day-drawer-date" className="mb-1 block font-medium text-[#1F2125]">
                Selected date
              </label>
              <input
                id="day-drawer-date"
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) onSelectDate(e.target.value);
                }}
                className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs text-[#1F2125]"
              />
            </div>

            {/* Runs on this day */}
            <section className="space-y-2.5">
              <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                Runs on {selectedDate}
              </h3>

              {!day || day.runs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#1F2125]/12 bg-white/45 px-3 py-4 text-center text-[#9AA0AA]">
                  No runs scheduled on this day.
                </p>
              ) : (
                <ul className="space-y-2">
                  {day.runs.map((run, idx) => {
                    const meta = JOB_META[run.jobType];
                    const Icon = meta.Icon;
                    const isPast = Date.parse(run.time) < Date.now();
                    const timeStr = formatTimeInZone(run.time, timezone, showLocalTime);

                    return (
                      <motion.li
                        key={`${run.scheduleId}-${run.time}-${idx}`}
                        initial={reduced ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : idx * 0.04 }}
                        className="space-y-2 rounded-2xl border border-white/85 bg-white/75 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-[#4F46E5]" />
                            <span className="font-semibold text-[#1F2125]">{run.jobName}</span>
                          </div>
                          <span className="font-mono text-[11px] text-[#4B5058]">{timeStr}</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <StatusPill
                            tone={
                              run.state === "success"
                                ? "verified"
                                : run.state === "failed" || run.state === "missed"
                                  ? "threat"
                                  : run.state === "skipped"
                                    ? "warning"
                                    : "neutral"
                            }
                            icon={
                              run.state === "success" ? (
                                <CheckCircle2 size={10} />
                              ) : run.state === "failed" ? (
                                <XCircle size={10} />
                              ) : (
                                <Clock size={10} />
                              )
                            }
                          >
                            {run.state === "scheduler_off" ? "Scheduler off" : run.state}
                          </StatusPill>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {run.runId ? (
                              <button
                                type="button"
                                onClick={() => onOpenRun(Number(run.runId))}
                                className="focus-ring rounded-lg px-2 py-1 font-mono text-[11px] font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
                              >
                                View run →
                              </button>
                            ) : null}

                            {!isPast && run.state === "scheduled" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyKey === `skip-${run.scheduleId}-${run.time}`}
                                  onClick={() => void handleSkip(run)}
                                  className="focus-ring inline-flex items-center gap-1 rounded-lg border border-white/85 bg-white px-2 py-1 text-[11px] font-medium text-[#1F2125]"
                                >
                                  <SkipForward size={11} /> Skip
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRescheduleTarget(run);
                                    setRescheduleDateTime(`${selectedDate}T09:00`);
                                  }}
                                  className="focus-ring inline-flex items-center gap-1 rounded-lg border border-white/85 bg-white px-2 py-1 text-[11px] font-medium text-[#1F2125]"
                                >
                                  <Clock size={11} /> Reschedule
                                </button>
                              </>
                            ) : null}

                            {isTodayOrPast && !run.runId ? (
                              <button
                                type="button"
                                onClick={() => void onRunNow(run.scheduleId)}
                                className="focus-ring inline-flex items-center gap-1 rounded-lg bg-[#1C1D21] px-2.5 py-1 text-[11px] font-medium text-white"
                              >
                                <Play size={10} /> Run now
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}

              {rescheduleTarget ? (
                <div className="space-y-2 rounded-2xl border border-[#4F46E5]/30 bg-[#EEF2FF]/70 p-3">
                  <p className="font-semibold text-[#1F2125]">
                    Reschedule {rescheduleTarget.jobName}
                  </p>
                  <input
                    type="datetime-local"
                    value={rescheduleDateTime}
                    onChange={(e) => setRescheduleDateTime(e.target.value)}
                    className="focus-ring h-8 w-full rounded-xl border border-white bg-white px-2.5 font-mono text-xs"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRescheduleTarget(null)}
                      className="rounded-lg px-2.5 py-1 text-xs text-[#4B5058]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConfirmReschedule()}
                      className="rounded-lg bg-[#1C1D21] px-3 py-1 text-xs font-medium text-white"
                    >
                      Apply move
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Overrides on this day */}
            <section className="space-y-2">
              <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                Overrides on this day
              </h3>
              {!day || day.overrides.length === 0 ? (
                <p className="text-[#9AA0AA]">No overrides on this day.</p>
              ) : (
                <ul className="space-y-2">
                  {day.overrides.map((ov) => (
                    <li
                      key={ov.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#EA580C]/25 bg-[#EA580C]/8 px-3 py-2"
                    >
                      <div>
                        <p className="font-medium capitalize text-[#9A3412]">
                          {ov.type.replace("_", " ")} · {schedName(ov.scheduleId)}
                        </p>
                        {ov.reason ? (
                          <p className="text-[11px] text-[#C2410C]">{ov.reason}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void onDeleteOverride(ov.id).then(() => dayQuery.refetch())
                        }
                        aria-label="Remove override"
                        className="focus-ring inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-[#DC2626]"
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-[#1F2125]/8 px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring h-9 rounded-xl border border-white/85 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
