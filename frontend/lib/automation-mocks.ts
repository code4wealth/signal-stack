import type {
  AutomationOverview,
  AutomationRun,
  AutomationRunDetailResponse,
  AutomationRunsFilters,
  AutomationRunsResponse,
  CalendarDay,
  Override,
  OverrideDraft,
  OverridePreviewResponse,
  Schedule,
  ScheduleDraft,
  SchedulePreviewResponse,
} from "@/lib/types";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const NOW = new Date();

const MOCK_SCHEDULES: Schedule[] = [
  {
    id: 1,
    companyId: 1,
    jobType: "crawl",
    name: "Source crawl",
    enabled: true,
    frequency: "daily",
    cron: "30 5 * * *",
    timezone: "UTC",
    humanReadable: "Every day at 05:30",
    runsPerPeriodLabel: "1 run / day",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "05:30",
    nextRuns: [1, 2, 3, 4].map((d) => {
      const dt = addDays(NOW, d);
      dt.setUTCHours(5, 30, 0, 0);
      return dt.toISOString();
    }),
    misfire: { policy: "run_late", graceSeconds: 1800 },
    retries: { max: 1, delaySeconds: 120 },
    noOverlap: true,
    options: { maxPagesPerRun: 50 },
    optionsSchema: [
      {
        key: "maxPagesPerRun",
        label: "Max pages per run",
        type: "number",
        min: 1,
        max: 200,
        default: 50,
      },
    ],
    status: "enabled",
    lastRun: {
      id: 401,
      scheduleId: 1,
      jobType: "crawl",
      jobName: "Source crawl",
      trigger: "scheduled",
      scheduledFor: addDays(NOW, -1).toISOString(),
      startedAt: addDays(NOW, -1).toISOString(),
      finishedAt: addDays(NOW, -1).toISOString(),
      durationMs: 12400,
      status: "success",
      output: { type: "crawl_run", id: "401", counts: { new: 5, changed: 2, failed: 0 } },
      schedulerJobId: "c1_crawl",
    },
    schedulerJobId: "c1_crawl",
    isCustom: false,
  },
  {
    id: 2,
    companyId: 1,
    jobType: "analysis",
    name: "Signal analysis",
    enabled: true,
    frequency: "daily",
    cron: "15 6 * * *",
    timezone: "UTC",
    humanReadable: "Every day at 06:15",
    runsPerPeriodLabel: "1 run / day",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "06:15",
    dependsOn: "crawl",
    nextRuns: [1, 2, 3, 4].map((d) => {
      const dt = addDays(NOW, d);
      dt.setUTCHours(6, 15, 0, 0);
      return dt.toISOString();
    }),
    misfire: { policy: "run_late", graceSeconds: 1800 },
    retries: { max: 1, delaySeconds: 120 },
    noOverlap: true,
    options: { maxAnalysesPerRun: 40 },
    status: "enabled",
    schedulerJobId: "c1_analysis",
    isCustom: false,
  },
  {
    id: 3,
    companyId: 1,
    jobType: "weekly_brief",
    name: "Weekly Monday Brief",
    enabled: true,
    frequency: "weekly",
    cron: "0 7 * * 1",
    timezone: "UTC",
    humanReadable: "Every Monday at 07:00",
    runsPerPeriodLabel: "1 run / week",
    daysOfWeek: [0],
    timeOfDay: "07:00",
    dependsOn: "analysis",
    nextRuns: [3, 10, 17, 24].map((d) => {
      const dt = addDays(NOW, d);
      dt.setUTCHours(7, 0, 0, 0);
      return dt.toISOString();
    }),
    misfire: { policy: "run_late", graceSeconds: 3600 },
    retries: { max: 1, delaySeconds: 300 },
    noOverlap: true,
    delivery: { email: false, recipients: [] },
    status: "enabled",
    schedulerJobId: "c1_weekly_brief",
    isCustom: false,
  },
  {
    id: 4,
    companyId: 1,
    jobType: "source_audit",
    name: "Monthly source audit",
    enabled: true,
    frequency: "monthly",
    cron: "30 6 1 * *",
    timezone: "UTC",
    humanReadable: "1st of every month at 06:30",
    runsPerPeriodLabel: "1 run / month",
    dayOfMonth: 1,
    timeOfDay: "06:30",
    nextRuns: [11, 41].map((d) => {
      const dt = addDays(NOW, d);
      dt.setUTCHours(6, 30, 0, 0);
      return dt.toISOString();
    }),
    misfire: { policy: "run_late", graceSeconds: 3600 },
    retries: { max: 1, delaySeconds: 300 },
    noOverlap: true,
    lastAuditChangedSources: 1,
    status: "enabled",
    schedulerJobId: "c1_source_audit",
    isCustom: false,
  },
];

const MOCK_OVERRIDES: Override[] = [
  {
    id: 1,
    scheduleId: 3,
    type: "skip",
    startsAt: addDays(NOW, 3).toISOString(),
    reason: "Holiday week skip (MOCK DATA)",
    createdBy: "Founder",
  },
];

const MOCK_RUNS: AutomationRun[] = [
  {
    id: 401,
    scheduleId: 1,
    jobType: "crawl",
    jobName: "Source crawl",
    trigger: "scheduled",
    scheduledFor: addDays(NOW, -1).toISOString(),
    startedAt: addDays(NOW, -1).toISOString(),
    finishedAt: addDays(NOW, -1).toISOString(),
    durationMs: 12400,
    status: "success",
    steps: [
      { label: "Queued", startedAt: addDays(NOW, -1).toISOString(), durationMs: 250 },
      { label: "Fetching sources", startedAt: addDays(NOW, -1).toISOString(), durationMs: 11800 },
      { label: "Finished", startedAt: addDays(NOW, -1).toISOString(), durationMs: 0 },
    ],
    output: { type: "crawl_run", id: "401", counts: { new: 5, changed: 2, failed: 0 } },
    schedulerJobId: "c1_crawl",
  },
];

export function mockAutomationOverview(): AutomationOverview {
  return {
    schedules: MOCK_SCHEDULES,
    upcomingChanges: [
      {
        id: "ov-1",
        date: addDays(NOW, 3).toISOString(),
        label: "Weekly Monday Brief skipped",
        subLabel: "Holiday week skip (MOCK DATA)",
        kind: "skip",
      },
      {
        id: "audit-4",
        date: addDays(NOW, 11).toISOString(),
        label: "Source audit",
        subLabel: "Due next month",
        kind: "audit",
      },
    ],
    pipeline: [
      { jobType: "crawl", name: "Source crawl", nextRunAt: MOCK_SCHEDULES[0]?.nextRuns[0], lastStatus: "success", enabled: true },
      { jobType: "analysis", name: "Signal analysis", nextRunAt: MOCK_SCHEDULES[1]?.nextRuns[0], lastStatus: "success", enabled: true },
      { jobType: "weekly_brief", name: "Weekly Monday Brief", nextRunAt: MOCK_SCHEDULES[2]?.nextRuns[0], lastStatus: "success", enabled: true },
    ],
    health: {
      engine: "running",
      lastHeartbeatAt: new Date().toISOString(),
      jobStore: "PostgreSQL",
      jobsRegistered: 4,
      timezone: "UTC",
      missedRuns30d: 0,
      avgStartDelayMs: 420,
      misfireSummary: "Late runs execute within 1800s",
      successByDay: Array.from({ length: 14 }).map((_, i) => ({
        date: addDays(NOW, i - 13).toISOString().slice(0, 10),
        success: i % 3 === 0 ? 2 : 1,
        failed: 0,
      })),
    },
    overrides: MOCK_OVERRIDES,
    capabilities: { customCron: true, canCreateSchedule: true },
    isMock: true,
  };
}

export function mockCalendarDays(fromStr: string, toStr: string): CalendarDay[] {
  const start = new Date(`${fromStr}T00:00:00Z`);
  const end = new Date(`${toStr}T00:00:00Z`);
  const days: CalendarDay[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const isPast = cur < NOW;
    days.push({
      date: iso,
      runs: [
        {
          scheduleId: 1,
          jobType: "crawl",
          jobName: "Source crawl",
          time: `${iso}T05:30:00Z`,
          state: isPast ? "success" : "scheduled",
          runId: isPast ? "401" : null,
        },
        {
          scheduleId: 2,
          jobType: "analysis",
          jobName: "Signal analysis",
          time: `${iso}T06:15:00Z`,
          state: isPast ? "success" : "scheduled",
          runId: isPast ? "401" : null,
        },
      ],
      overrides: cur.getUTCDate() === addDays(NOW, 3).getUTCDate() ? MOCK_OVERRIDES : [],
      isOffDay: false,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function mockPreviewSchedule(draft: ScheduleDraft): SchedulePreviewResponse {
  return {
    valid: true,
    cron: draft.cron || "0 7 * * 1",
    humanReadable: `MOCK DATA · ${draft.frequency} schedule`,
    runsPerPeriodLabel: "1 run / week",
    nextRuns: [1, 2, 3, 4, 5].map((d) => addDays(NOW, d).toISOString()),
  };
}

export function mockAutomationRuns(filters: AutomationRunsFilters): AutomationRunsResponse {
  const items = MOCK_RUNS.filter((r) => {
    if (filters.status && filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.job && filters.job !== "all" && r.jobType !== filters.job) return false;
    return true;
  });
  return { items, total: items.length, nextCursor: null, isMock: true };
}

export function mockAutomationRunDetail(runId: number): AutomationRunDetailResponse {
  const run = MOCK_RUNS.find((r) => r.id === runId) ?? MOCK_RUNS[0]!;
  return {
    run,
    logs: [
      {
        id: 1,
        runId: run.id,
        ts: run.startedAt || NOW.toISOString(),
        level: "info",
        message: "MOCK DATA — Started scheduled crawl across approved sources",
      },
    ],
    isMock: true,
  };
}

export function mockPreviewOverride(draft: OverrideDraft): OverridePreviewResponse {
  return {
    summary: `MOCK DATA — ${draft.type} starting ${draft.startsAt.slice(0, 10)}`,
    affectedRuns: [],
    conflicts: [],
  };
}
