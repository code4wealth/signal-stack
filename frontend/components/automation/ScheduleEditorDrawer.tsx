"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { useSchedulePreview } from "@/hooks/useSchedulePreview";
import { sidePanelSlide } from "@/lib/motion";
import type {
  JobType,
  Schedule,
  ScheduleDraft,
  ScheduleFrequency,
} from "@/lib/types";
import { CronField } from "./CronField";
import { NextRunsPreview } from "./NextRunsPreview";
import { WeekdayChips } from "./WeekdayChips";
import { JOB_META } from "./jobMeta";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const FREQUENCIES: { key: ScheduleFrequency; label: string }[] = [
  { key: "hourly", label: "Hourly" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom" },
];

function initialDraftFromSchedule(sched: Schedule | null): ScheduleDraft {
  if (!sched) {
    return {
      jobType: "crawl",
      name: "Custom source crawl",
      enabled: true,
      frequency: "daily",
      cron: "0 8 * * *",
      timezone: "UTC",
      daysOfWeek: [0, 1, 2, 3, 4],
      timeOfDay: "08:00",
      intervalHours: 6,
      dayOfMonth: 1,
      dependsOn: null,
      misfire: { policy: "run_late", graceSeconds: 1800 },
      retries: { max: 1, delaySeconds: 120 },
      noOverlap: true,
      delivery: { email: false, recipients: [] },
      options: {},
    };
  }
  return {
    jobType: sched.jobType,
    name: sched.name,
    enabled: sched.enabled,
    frequency: sched.frequency,
    cron: sched.cron,
    timezone: sched.timezone,
    daysOfWeek: sched.daysOfWeek ?? [0],
    timeOfDay: sched.timeOfDay ?? "07:00",
    intervalHours: sched.intervalHours ?? 6,
    dayOfMonth: sched.dayOfMonth ?? 1,
    dependsOn: sched.dependsOn ?? null,
    misfire: sched.misfire,
    retries: sched.retries,
    noOverlap: sched.noOverlap,
    delivery: sched.delivery ?? { email: false, recipients: [] },
    options: sched.options ?? {},
  };
}

export function ScheduleEditorDrawer({
  companyId,
  open,
  schedule,
  allSchedules,
  emailConfigured,
  showLocalTime,
  isSaving,
  onClose,
  onSave,
  onDelete,
}: {
  companyId: number;
  open: boolean;
  schedule: Schedule | null;
  allSchedules: Schedule[];
  emailConfigured: boolean;
  showLocalTime: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (scheduleId: number | null, draft: ScheduleDraft) => Promise<void>;
  onDelete: (scheduleId: number) => Promise<void>;
}) {
  const { reduced } = useMotionSafe();
  const isEditing = Boolean(schedule);

  const [draft, setDraft] = useState<ScheduleDraft>(() => initialDraftFromSchedule(schedule));
  const [initialJson, setInitialJson] = useState<string>("");
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDisableBrief, setConfirmDisableBrief] = useState(false);
  const [confirmUnsaved, setConfirmUnsaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init = initialDraftFromSchedule(schedule);
    setDraft(init);
    setInitialJson(JSON.stringify(init));
    setRecipientInput("");
    setRecipientError(null);
    setConfirmDelete(false);
    setConfirmDisableBrief(false);
    setConfirmUnsaved(false);
  }, [open, schedule]);

  const isDirty = open && initialJson !== "" && JSON.stringify(draft) !== initialJson;

  const { preview, isLoading: previewLoading, error: previewError } = useSchedulePreview(
    companyId,
    open ? draft : null,
    open,
  );

  const attemptClose = () => {
    if (isDirty) {
      setConfirmUnsaved(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") attemptClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty]);

  // Dependency timing warning
  const depWarning = useMemo(() => {
    if (!draft.dependsOn || !draft.timeOfDay) return null;
    const dep = allSchedules.find(
      (s) => s.jobType === draft.dependsOn || s.schedulerJobId === draft.dependsOn,
    );
    if (!dep || !dep.timeOfDay) return null;
    if (draft.timeOfDay <= dep.timeOfDay) {
      return `${draft.timeOfDay} is before ${dep.name}'s scheduled time (${dep.timeOfDay}).`;
    }
    return null;
  }, [allSchedules, draft.dependsOn, draft.timeOfDay]);

  if (!open) return null;

  const optionsSchema = schedule?.optionsSchema ?? [];
  const nameInvalid = draft.name.trim().length < 2;
  const cronInvalid = preview ? !preview.valid : false;

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setRecipientError("Enter a valid email address.");
      return;
    }
    setRecipientError(null);
    const cur = draft.delivery?.recipients ?? [];
    if (!cur.includes(email)) {
      setDraft({
        ...draft,
        delivery: { email: draft.delivery?.email ?? true, recipients: [...cur, email] },
      });
    }
    setRecipientInput("");
  };

  const handleSave = async () => {
    if (nameInvalid || cronInvalid) return;
    if (schedule?.jobType === "weekly_brief" && schedule.enabled && !draft.enabled && !confirmDisableBrief) {
      setConfirmDisableBrief(true);
      return;
    }
    await onSave(schedule?.id ?? null, {
      ...draft,
      cron: preview?.cron || draft.cron,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={attemptClose}
          aria-hidden="true"
        />

        <motion.aside
          variants={sidePanelSlide(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label={isEditing ? `Edit ${schedule?.name}` : "New schedule"}
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[480px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1F2125]/8 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#1F2125]">
                {isEditing ? `Edit ${schedule?.name}` : "New schedule"}
              </h2>
              <p className="text-xs text-[#4B5058]">
                Evaluated directly by APScheduler CronTrigger
              </p>
            </div>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Close schedule editor"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            {/* 1. Job type & Name */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="sched-job-type" className="mb-1 block font-medium text-[#1F2125]">
                  Job type
                </label>
                <select
                  id="sched-job-type"
                  disabled={isEditing}
                  value={draft.jobType}
                  onChange={(e) => setDraft({ ...draft, jobType: e.target.value as JobType })}
                  className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125] disabled:opacity-60"
                >
                  {(Object.keys(JOB_META) as JobType[]).map((jt) => (
                    <option key={jt} value={jt}>
                      {JOB_META[jt].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sched-name" className="mb-1 block font-medium text-[#1F2125]">
                  Name
                </label>
                <input
                  id="sched-name"
                  type="text"
                  value={draft.name}
                  aria-invalid={nameInvalid}
                  aria-describedby="sched-name-err"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
                />
                {nameInvalid ? (
                  <p id="sched-name-err" className="mt-1 text-[11px] text-[#DC2626]">
                    Name must be at least 2 characters.
                  </p>
                ) : null}
              </div>
            </div>

            {/* 2. Frequency segmented control */}
            <div className="space-y-2.5">
              <span className="block font-medium text-[#1F2125]">Frequency</span>
              <div className="grid grid-cols-5 gap-1 rounded-xl border border-white/80 bg-white/60 p-1">
                {FREQUENCIES.map((f) => {
                  const active = draft.frequency === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setDraft({ ...draft, frequency: f.key })}
                      className={`focus-ring rounded-lg py-1.5 text-[11.5px] font-medium transition-colors ${
                        active ? "bg-[#1C1D21] text-white" : "text-[#4B5058] hover:text-[#1F2125]"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {draft.frequency === "hourly" ? (
                <div>
                  <label htmlFor="sched-interval" className="mb-1 block text-[#4B5058]">
                    Run every
                  </label>
                  <select
                    id="sched-interval"
                    value={draft.intervalHours ?? 6}
                    onChange={(e) => setDraft({ ...draft, intervalHours: Number(e.target.value) })}
                    className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
                  >
                    {[1, 2, 3, 4, 6, 12].map((h) => (
                      <option key={h} value={h}>
                        Every {h} hour{h === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : draft.frequency === "daily" ? (
                <div>
                  <label htmlFor="sched-daily-time" className="mb-1 block text-[#4B5058]">
                    Time of day
                  </label>
                  <input
                    id="sched-daily-time"
                    type="time"
                    value={draft.timeOfDay ?? "07:00"}
                    onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
                    className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs text-[#1F2125]"
                  />
                </div>
              ) : draft.frequency === "weekly" ? (
                <div className="space-y-2.5">
                  <div>
                    <span className="mb-1 block text-[#4B5058]">Days of week</span>
                    <WeekdayChips
                      interactive
                      activeDays={draft.daysOfWeek}
                      onToggle={(dayIdx) => {
                        const cur = new Set(draft.daysOfWeek ?? []);
                        if (cur.has(dayIdx)) {
                          if (cur.size > 1) cur.delete(dayIdx);
                        } else {
                          cur.add(dayIdx);
                        }
                        setDraft({ ...draft, daysOfWeek: Array.from(cur).sort() });
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="sched-weekly-time" className="mb-1 block text-[#4B5058]">
                      Time of day
                    </label>
                    <input
                      id="sched-weekly-time"
                      type="time"
                      value={draft.timeOfDay ?? "07:00"}
                      onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
                      className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs text-[#1F2125]"
                    />
                  </div>
                </div>
              ) : draft.frequency === "monthly" ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="sched-dom" className="mb-1 block text-[#4B5058]">
                      Day of month
                    </label>
                    <select
                      id="sched-dom"
                      value={String(draft.dayOfMonth ?? 1)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dayOfMonth: e.target.value === "last" ? "last" : Number(e.target.value),
                        })
                      }
                      className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
                    >
                      {Array.from({ length: 28 }).map((_, i) => (
                        <option key={i + 1} value={String(i + 1)}>
                          Day {i + 1}
                        </option>
                      ))}
                      <option value="last">Last day</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="sched-monthly-time" className="mb-1 block text-[#4B5058]">
                      Time of day
                    </label>
                    <input
                      id="sched-monthly-time"
                      type="time"
                      value={draft.timeOfDay ?? "06:30"}
                      onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
                      className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs text-[#1F2125]"
                    />
                  </div>
                </div>
              ) : (
                <CronField
                  value={draft.cron ?? ""}
                  preview={preview}
                  isLoading={previewLoading}
                  onChange={(nextCron) => setDraft({ ...draft, cron: nextCron })}
                />
              )}
            </div>

            {/* 3. Timezone */}
            <div>
              <label htmlFor="sched-tz" className="mb-1 block font-medium text-[#1F2125]">
                Timezone
              </label>
              <select
                id="sched-tz"
                value={draft.timezone}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 font-mono text-xs text-[#1F2125]"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Live Preview */}
            <NextRunsPreview
              jobType={draft.jobType}
              frequency={draft.frequency}
              timezone={draft.timezone}
              showLocalTime={showLocalTime}
              preview={preview}
              isLoading={previewLoading}
              error={previewError}
            />

            {/* 5. Run policy */}
            <div className="space-y-3 rounded-2xl border border-white/85 bg-white/60 p-3.5">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                Run policy
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="sched-misfire" className="mb-1 block text-[#4B5058]">
                    Misfire handling
                  </label>
                  <select
                    id="sched-misfire"
                    value={draft.misfire.policy}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        misfire: { ...draft.misfire, policy: e.target.value as "run_late" | "skip" },
                      })
                    }
                    className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
                  >
                    <option value="run_late">Run late within grace</option>
                    <option value="skip">Skip if missed</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sched-grace" className="mb-1 block text-[#4B5058]">
                    Grace (minutes)
                  </label>
                  <input
                    id="sched-grace"
                    type="number"
                    min={1}
                    max={1440}
                    value={Math.round(draft.misfire.graceSeconds / 60)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        misfire: {
                          ...draft.misfire,
                          graceSeconds: Math.max(60, Number(e.target.value || 30) * 60),
                        },
                      })
                    }
                    className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 font-mono text-xs text-[#1F2125]"
                  />
                </div>

                <div>
                  <label htmlFor="sched-retries" className="mb-1 block text-[#4B5058]">
                    Retries (0–3)
                  </label>
                  <input
                    id="sched-retries"
                    type="number"
                    min={0}
                    max={3}
                    value={draft.retries.max}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        retries: { ...draft.retries, max: Math.min(3, Math.max(0, Number(e.target.value || 0))) },
                      })
                    }
                    className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 font-mono text-xs text-[#1F2125]"
                  />
                </div>

                <div>
                  <label htmlFor="sched-retry-delay" className="mb-1 block text-[#4B5058]">
                    Retry delay (sec)
                  </label>
                  <input
                    id="sched-retry-delay"
                    type="number"
                    min={10}
                    max={3600}
                    value={draft.retries.delaySeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        retries: {
                          ...draft.retries,
                          delaySeconds: Math.max(10, Number(e.target.value || 60)),
                        },
                      })
                    }
                    className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 font-mono text-xs text-[#1F2125]"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-[#1F2125]">
                <input
                  type="checkbox"
                  checked={draft.noOverlap}
                  onChange={(e) => setDraft({ ...draft, noOverlap: e.target.checked })}
                  className="accent-[#4F46E5]"
                />
                <span>Only run if previous run finished (no overlap)</span>
              </label>
            </div>

            {/* 6. Dependencies */}
            <div className="space-y-1.5">
              <label htmlFor="sched-depends" className="block font-medium text-[#1F2125]">
                Run after dependency
              </label>
              <select
                id="sched-depends"
                value={draft.dependsOn ?? ""}
                onChange={(e) => setDraft({ ...draft, dependsOn: e.target.value || null })}
                className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              >
                <option value="">None (independent)</option>
                {allSchedules
                  .filter((s) => s.id !== schedule?.id)
                  .map((s) => (
                    <option key={s.id} value={s.jobType}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {depWarning ? (
                <p className="flex items-center gap-1.5 text-[11px] text-[#C2410C]">
                  <AlertTriangle size={12} className="shrink-0" />
                  <span>{depWarning}</span>
                </p>
              ) : null}
            </div>

            {/* 7. Delivery (weekly_brief only) */}
            {draft.jobType === "weekly_brief" ? (
              <div className="space-y-2 rounded-2xl border border-white/85 bg-white/60 p-3.5">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                  Brief delivery
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[#1F2125]">In-app notification</span>
                  <span className="rounded-full bg-[#059669]/12 px-2 py-0.5 font-mono text-[10px] font-medium text-[#059669]">
                    Always on
                  </span>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-[#1F2125]">Email delivery</span>
                  <input
                    type="checkbox"
                    disabled={!emailConfigured}
                    checked={Boolean(draft.delivery?.email)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery: {
                          email: e.target.checked,
                          recipients: draft.delivery?.recipients ?? [],
                        },
                      })
                    }
                    className="accent-[#4F46E5] disabled:opacity-45"
                  />
                </label>
                {!emailConfigured ? (
                  <p className="text-[11px] text-[#9AA0AA]">
                    Email delivery disabled: configure SMTP_HOST or RESEND_API_KEY on the backend.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-1.5">
                      <input
                        type="email"
                        value={recipientInput}
                        onChange={(e) => setRecipientInput(e.target.value)}
                        placeholder="founder@company.com"
                        className="focus-ring h-8 flex-1 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addRecipient}
                        className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl bg-[#1C1D21] px-2.5 text-[11px] font-medium text-white"
                      >
                        <Plus size={11} /> Add
                      </button>
                    </div>
                    {recipientError ? (
                      <p className="text-[11px] text-[#DC2626]">{recipientError}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {(draft.delivery?.recipients ?? []).map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1 rounded-full border border-white/85 bg-white px-2 py-0.5 font-mono text-[10.5px]"
                        >
                          {email}
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                delivery: {
                                  email: Boolean(draft.delivery?.email),
                                  recipients: (draft.delivery?.recipients ?? []).filter((x) => x !== email),
                                },
                              })
                            }
                            aria-label={`Remove ${email}`}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* 8. Job-specific options from API optionsSchema */}
            {optionsSchema.length > 0 ? (
              <div className="space-y-2.5 rounded-2xl border border-white/85 bg-white/60 p-3.5">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                  Job options
                </p>
                {optionsSchema.map((field) => {
                  const val = draft.options?.[field.key] ?? field.default;
                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="block font-medium text-[#1F2125]">{field.label}</label>
                      {field.type === "number" ? (
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={Number(val ?? 0)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              options: { ...draft.options, [field.key]: Number(e.target.value) },
                            })
                          }
                          className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 font-mono text-xs"
                        />
                      ) : field.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              options: { ...draft.options, [field.key]: e.target.checked },
                            })
                          }
                          className="accent-[#4F46E5]"
                        />
                      ) : (
                        <select
                          value={String(val ?? "")}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              options: { ...draft.options, [field.key]: e.target.value },
                            })
                          }
                          className="focus-ring h-8 w-full rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs"
                        >
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                      {field.help ? (
                        <p className="text-[11px] text-[#4B5058]">{field.help}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Inline confirmations */}
            {confirmDisableBrief ? (
              <div className="rounded-xl border border-[#EA580C]/35 bg-[#EA580C]/10 p-3 text-xs text-[#9A3412]">
                <p className="font-semibold">Disable Weekly Monday Brief?</p>
                <p className="mt-0.5">
                  No weekly executive briefs will be generated automatically until you re-enable it.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDisableBrief(false)}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-[#1F2125]"
                  >
                    Keep enabled
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    className="rounded-lg bg-[#1C1D21] px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Confirm disable
                  </button>
                </div>
              </div>
            ) : null}

            {confirmUnsaved ? (
              <div className="rounded-xl border border-[#EA580C]/35 bg-[#EA580C]/10 p-3 text-xs text-[#9A3412]">
                <p className="font-semibold">Discard unsaved changes?</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmUnsaved(false)}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-[#1F2125]"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 px-5 py-3.5">
            <div>
              {schedule?.isCustom ? (
                confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg px-2 py-1 text-xs text-[#4B5058]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(schedule.id).then(onClose)}
                      className="rounded-lg bg-[#DC2626] px-2.5 py-1 text-xs font-medium text-white"
                    >
                      Confirm delete
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="focus-ring inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#DC2626] hover:bg-[#DC2626]/10"
                  >
                    <Trash2 size={13} /> Delete schedule
                  </button>
                )
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={attemptClose}
                className="focus-ring h-9 rounded-xl border border-white/85 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving || nameInvalid || cronInvalid}
                onClick={() => void handleSave()}
                className="btn-motion focus-ring h-9 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white disabled:opacity-45"
              >
                {isSaving ? "Saving…" : "Save schedule"}
              </button>
            </div>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
