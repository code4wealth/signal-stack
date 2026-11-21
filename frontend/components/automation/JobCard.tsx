"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Mail,
  MoreVertical,
  PauseCircle,
  Pencil,
  Play,
  RotateCw,
  SkipForward,
  Trash2,
  XCircle,
} from "lucide-react";

import { GlassCard, StatusPill } from "@/components/ui-shared";
import { useLiveCountdown } from "@/hooks/useCountdown";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { FAST_TRANSITION, springSnappy } from "@/lib/motion";
import type { Schedule } from "@/lib/types";
import { DayTimeline } from "./DayTimeline";
import { WeekdayChips } from "./WeekdayChips";
import {
  formatDateTimeInZone,
  formatFullDateInZone,
  formatRelativeAge,
  JOB_META,
} from "./jobMeta";

function scheduleStatusBadge(status: Schedule["status"]) {
  switch (status) {
    case "running":
      return { tone: "info" as const, Icon: Clock, label: "Running" };
    case "failing":
      return { tone: "threat" as const, Icon: XCircle, label: "Failing" };
    case "paused":
      return { tone: "warning" as const, Icon: PauseCircle, label: "Paused" };
    default:
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Enabled" };
  }
}

export function JobCard({
  companyId,
  schedule,
  showLocalTime,
  isMock,
  onToggleEnabled,
  onRunNow,
  onEdit,
  onSkipNext,
  onPauseUntil,
  onViewHistory,
  onViewRun,
  onDeleteCustom,
  onCountdownExpire,
}: {
  companyId: number;
  schedule: Schedule;
  showLocalTime: boolean;
  isMock?: boolean;
  onToggleEnabled: (nextEnabled: boolean) => void;
  onRunNow: () => Promise<unknown>;
  onEdit: () => void;
  onSkipNext: () => void;
  onPauseUntil: () => void;
  onViewHistory: () => void;
  onViewRun: (runId: number) => void;
  onDeleteCustom?: () => void;
  onCountdownExpire?: () => void;
}) {
  const { reduced, isDocumentHidden } = useMotionSafe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [copiedCron, setCopiedCron] = useState(false);
  const [startingRun, setStartingRun] = useState(false);

  const meta = JOB_META[schedule.jobType];
  const Icon = meta.Icon;
  const badge = scheduleStatusBadge(schedule.status);
  const nextIso = schedule.enabled ? (schedule.nextRuns[0] ?? null) : null;
  const countdown = useLiveCountdown(nextIso, {
    tickMs: 1000,
    onExpire: onCountdownExpire,
  });

  const isRunning = schedule.status === "running" || startingRun;
  const showWeekdays = schedule.frequency === "weekly" || schedule.frequency === "monthly";

  const copyCron = async () => {
    await navigator.clipboard?.writeText(schedule.cron).catch(() => undefined);
    setCopiedCron(true);
    setTimeout(() => setCopiedCron(false), 1500);
  };

  const handleConfirmRun = async () => {
    setStartingRun(true);
    setConfirmRun(false);
    try {
      await onRunNow();
    } finally {
      setStartingRun(false);
    }
  };

  return (
    <motion.div
      animate={{ opacity: schedule.enabled ? 1 : 0.7 }}
      transition={FAST_TRANSITION}
      className="h-full"
    >
      <GlassCard
        spotlight
        interactive
        className={`relative flex h-full flex-col justify-between gap-4 overflow-hidden p-5 ${meta.borderTopClass}`}
      >
        {/* Running border sheen sweep once */}
        {isRunning && !reduced ? (
          <div
            aria-hidden="true"
            className="hero-shimmer-once pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#4F46E5]/60 to-transparent"
          />
        ) : null}

        <div className="space-y-4">
          {/* HEADER ROW */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tintBg} ${meta.tintText}`}
                aria-hidden="true"
              >
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-[#1F2125]">
                    {schedule.name}
                  </h3>
                  <StatusPill
                    tone={badge.tone}
                    icon={
                      isRunning && !reduced && !isDocumentHidden ? (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563EB]" />
                      ) : (
                        <badge.Icon size={11} />
                      )
                    }
                  >
                    {badge.label}
                  </StatusPill>
                  {isMock ? (
                    <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#C2410C]">
                      MOCK DATA
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[#4B5058]">{meta.description}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Enable switch (springSnappy) */}
              <button
                type="button"
                role="switch"
                aria-checked={schedule.enabled}
                aria-label={`Toggle ${schedule.name}`}
                onClick={() => onToggleEnabled(!schedule.enabled)}
                className={`focus-ring relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors ${
                  schedule.enabled ? "bg-[#1C1D21]" : "bg-[#9AA0AA]/40"
                }`}
              >
                <motion.span
                  layout
                  transition={reduced ? FAST_TRANSITION : springSnappy}
                  className={`h-5 w-5 rounded-full bg-white shadow-sm ${
                    schedule.enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Three-dot menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((p) => !p)}
                  aria-label={`More actions for ${schedule.name}`}
                  aria-expanded={menuOpen}
                  className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
                >
                  <MoreVertical size={15} />
                </button>

                {menuOpen ? (
                  <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-44 rounded-xl p-1.5 text-xs shadow-lg">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmRun(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#1F2125] hover:bg-white disabled:opacity-45"
                    >
                      <Play size={12} /> Run now
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#1F2125] hover:bg-white"
                    >
                      <Pencil size={12} /> Edit schedule
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onSkipNext();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#1F2125] hover:bg-white"
                    >
                      <SkipForward size={12} /> Skip next run
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onPauseUntil();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#1F2125] hover:bg-white"
                    >
                      <PauseCircle size={12} /> Pause until…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onViewHistory();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#1F2125] hover:bg-white"
                    >
                      <Clock size={12} /> View history
                    </button>
                    {schedule.isCustom && onDeleteCustom ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteCustom();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[#DC2626] hover:bg-[#DC2626]/10"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* HUMAN-READABLE SCHEDULE + CRON */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/80 bg-white/65 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-[#1F2125]">{schedule.humanReadable}</p>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[#4B5058]">
                <span>{schedule.cron}</span>
                <button
                  type="button"
                  onClick={() => void copyCron()}
                  aria-label="Copy cron expression"
                  className="focus-ring rounded p-0.5 text-[#9AA0AA] hover:text-[#1F2125]"
                >
                  {copiedCron ? <Check size={11} className="text-[#059669]" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
            <span className="rounded-full border border-[#1F2125]/10 bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#1F2125]">
              {schedule.runsPerPeriodLabel}
            </span>
          </div>

          {/* NEXT RUN BLOCK */}
          {schedule.enabled ? (
            <div className="space-y-2 rounded-xl border border-white/80 bg-white/65 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div
                  aria-live="off"
                  aria-label={`Next run ${formatFullDateInZone(nextIso, schedule.timezone, showLocalTime)}`}
                >
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={String(countdown.minuteBucket ?? countdown.label)}
                      initial={reduced ? false : { opacity: 0.4 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className="tabular text-lg font-semibold tracking-[-0.02em] text-[#1F2125]"
                    >
                      {countdown.label}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <span className="font-mono text-[11px] text-[#4B5058]">
                  {formatDateTimeInZone(nextIso, schedule.timezone, showLocalTime)}
                </span>
              </div>

              {schedule.nextRuns.length > 1 ? (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {schedule.nextRuns.slice(1, 4).map((iso) => (
                    <span
                      key={iso}
                      className="rounded-lg bg-white/80 px-2 py-0.5 font-mono text-[10px] text-[#4B5058]"
                    >
                      {formatDateTimeInZone(iso, schedule.timezone, showLocalTime)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-[#EA580C]/25 bg-[#EA580C]/8 px-3 py-2 text-xs text-[#C2410C]">
              Paused{schedule.pausedSince ? ` since ${formatDateTimeInZone(schedule.pausedSince, schedule.timezone, showLocalTime)}` : ""}
            </div>
          )}

          {/* WEEKDAY CHIPS + 24-HOUR TIMELINE */}
          <div className="space-y-2">
            {showWeekdays ? <WeekdayChips activeDays={schedule.daysOfWeek} /> : null}
            <DayTimeline
              jobType={schedule.jobType}
              frequency={schedule.frequency}
              nextRuns={schedule.nextRuns}
              timezone={schedule.timezone}
              showLocalTime={showLocalTime}
              humanReadable={schedule.humanReadable}
            />
          </div>

          {/* WEEKLY BRIEF / SOURCE AUDIT EXTRAS */}
          {schedule.jobType === "weekly_brief" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-white/85 bg-white/80 px-2.5 py-0.5 font-mono text-[10.5px] text-[#1F2125]">
                  In-app
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/85 bg-white/80 px-2.5 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
                  <Mail size={10} />
                  {schedule.delivery?.email ? "Email on" : "Email off"}
                </span>
              </div>
              <Link
                href={`/company/${companyId}/brief?preview`}
                className="focus-ring inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
              >
                Preview next brief <ExternalLink size={10} />
              </Link>
            </div>
          ) : null}

          {schedule.jobType === "source_audit" &&
          typeof schedule.lastAuditChangedSources === "number" ? (
            <p className="font-mono text-[11px] text-[#4B5058]">
              Last audit flagged{" "}
              <span className="font-semibold text-[#1F2125]">
                {schedule.lastAuditChangedSources}
              </span>{" "}
              source{schedule.lastAuditChangedSources === 1 ? "" : "s"}
            </p>
          ) : null}

          {/* LAST RESULT ROW */}
          <div className="space-y-2 border-t border-[#1F2125]/8 pt-3">
            {schedule.lastRun ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[#4B5058]">
                    Last run {formatRelativeAge(schedule.lastRun.startedAt || schedule.lastRun.scheduledFor)}
                    {schedule.lastRun.durationMs != null
                      ? ` · ${Math.max(1, Math.round(schedule.lastRun.durationMs / 1000))}s`
                      : ""}
                  </span>
                  <StatusPill
                    tone={
                      schedule.lastRun.status === "success"
                        ? "verified"
                        : schedule.lastRun.status === "failed"
                          ? "threat"
                          : schedule.lastRun.status === "running"
                            ? "info"
                            : "warning"
                    }
                  >
                    {schedule.lastRun.status}
                  </StatusPill>
                </div>
                <button
                  type="button"
                  onClick={() => onViewRun(schedule.lastRun!.id)}
                  className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] hover:underline"
                >
                  View run →
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#9AA0AA]">No runs recorded yet.</p>
            )}

            {schedule.lastError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/8 px-3 py-2 text-xs text-[#991B1B]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0 text-[#DC2626]" aria-hidden="true" />
                  <span className="truncate">{schedule.lastError}</span>
                </span>
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => void handleConfirmRun()}
                  className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-medium text-[#DC2626] hover:bg-white/90"
                >
                  <RotateCw size={11} /> Retry now
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* FOOTER BUTTONS */}
        <div className="border-t border-[#1F2125]/8 pt-3">
          {confirmRun ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#4F46E5]/25 bg-[#EEF2FF]/75 px-3 py-2 text-xs">
              <span className="font-medium text-[#1F2125]">Run {schedule.name} now?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmRun(false)}
                  className="focus-ring rounded-lg px-2.5 py-1 text-xs text-[#4B5058] hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmRun()}
                  className="focus-ring rounded-lg bg-[#1C1D21] px-2.5 py-1 text-xs font-medium text-white"
                >
                  Confirm run
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setConfirmRun(true)}
                className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={12} aria-hidden="true" />
                {isRunning ? "Running…" : "Run now"}
              </button>

              <button
                type="button"
                onClick={onEdit}
                className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white"
              >
                <Pencil size={12} aria-hidden="true" />
                Edit schedule
              </button>
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}
