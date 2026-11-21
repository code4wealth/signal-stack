"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, Lock, RotateCcw } from "lucide-react";

import {
  AutomationHeader,
  DayDrawer,
  JobCard,
  OverrideDialog,
  OverridesList,
  PipelineOverview,
  RunDrawer,
  RunHistoryTable,
  ScheduleEditorDrawer,
  SchedulerHealthCard,
  SchedulerStoppedBanner,
  UpcomingChangesStrip,
  WeekView,
} from "@/components/automation";
import { Reveal } from "@/components/motion/Reveal";
import { EmptyState, GlassCard, SkeletonBlock, Toast } from "@/components/ui-shared";
import { useAutomation } from "@/hooks/useAutomation";
import { useAutomationRuns } from "@/hooks/useAutomationRuns";
import { useCalendarWeek } from "@/hooks/useCalendarWeek";
import { api } from "@/lib/api";
import { adaptCompanyDetail } from "@/lib/company-adapter";
import type {
  AutomationRunsFilters,
  OverrideType,
  Schedule,
  ScheduleDraft,
} from "@/lib/types";

export default function AutomationPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [toast, setToast] = useState<{
    id: number;
    tone: "ok" | "error";
    message: string;
  } | null>(null);
  const [showLocalTime, setShowLocalTime] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDirection, setWeekDirection] = useState(1);

  // Drawers / Dialogs state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [selectedDayIso, setSelectedDayIso] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [dayPickMode, setDayPickMode] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideDefaultSchedId, setOverrideDefaultSchedId] = useState<number | null>(null);
  const [overrideDefaultType, setOverrideDefaultType] = useState<OverrideType>("skip");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  // Local non-URL filters (dateFrom, dateTo, trigger, q) + URL-synced (?job=&status=)
  const [extraFilters, setExtraFilters] = useState<{
    trigger?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }>({});

  const filters = useMemo<AutomationRunsFilters>(
    () => ({
      job: searchParams.get("job") || "all",
      status: searchParams.get("status") || "all",
      trigger: extraFilters.trigger || "all",
      dateFrom: extraFilters.dateFrom || "",
      dateTo: extraFilters.dateTo || "",
      q: extraFilters.q || "",
    }),
    [extraFilters, searchParams],
  );

  const handleFiltersChange = useCallback(
    (next: AutomationRunsFilters) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (!next.job || next.job === "all") nextParams.delete("job");
      else nextParams.set("job", next.job);

      if (!next.status || next.status === "all") nextParams.delete("status");
      else nextParams.set("status", next.status);

      const qs = nextParams.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      setExtraFilters({
        trigger: next.trigger,
        dateFrom: next.dateFrom,
        dateTo: next.dateTo,
        q: next.q,
      });
    },
    [pathname, router, searchParams],
  );

  const notify = useCallback((tone: "ok" | "error", message: string) => {
    setToast({ id: Date.now(), tone, message });
  }, []);

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => adaptCompanyDetail(await api.getCompany(companyId)),
    enabled: !useMocks && Number.isFinite(companyId) && companyId > 0,
  });

  const isLocked = Boolean(
    !useMocks &&
      companyQuery.data &&
      companyQuery.data.workflowStatus.sources !== "done",
  );

  const automation = useAutomation(companyId, notify);
  const overview = automation.data;
  const schedules = overview?.schedules ?? [];
  const hasActiveRun = schedules.some((s) => s.status === "running");

  const calendar = useCalendarWeek(companyId, weekOffset, !isLocked);
  const runsState = useAutomationRuns(companyId, filters, hasActiveRun, !isLocked);

  const primaryTimezone = overview?.health.timezone || schedules[0]?.timezone || "UTC";

  const openEditorForSchedule = (sched: Schedule | null) => {
    setEditingSchedule(sched);
    setEditorOpen(true);
  };

  const openDayDrawer = (isoDate: string, pickMode = false) => {
    setSelectedDayIso(isoDate);
    setDayPickMode(pickMode);
    setDayDrawerOpen(true);
  };

  const openOverrideModal = (
    schedId: number | null = null,
    type: OverrideType = "skip",
  ) => {
    setOverrideDefaultSchedId(schedId);
    setOverrideDefaultType(type);
    setOverrideDialogOpen(true);
  };

  const handleRunCrawlNow = async () => {
    const crawlSched = schedules.find((s) => s.jobType === "crawl");
    if (crawlSched) {
      const run = await automation.runNow(crawlSched.id);
      setSelectedRunId(run.id);
    }
  };

  if (isLocked) {
    return (
      <div className="py-12">
        <GlassCard className="mx-auto max-w-xl p-8">
          <EmptyState
            icon={<Lock size={22} />}
            title="Automation unlocks after Step 3"
            description="Confirm your Signal Stack sources first so scheduled crawls, signal analysis, Weekly Monday Briefs, and monthly audits have approved sources to monitor."
            action={
              <Link
                href={`/company/${companyId}/signal-stack`}
                className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline"
              >
                Go to Signal Stack <ArrowRight size={14} />
              </Link>
            }
          />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      {automation.error && !overview ? (
        <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-[#DC2626]/25 bg-[#DC2626]/5 p-5">
          <div className="flex items-center gap-2.5 text-sm text-[#991B1B]">
            <AlertCircle size={18} className="shrink-0 text-[#DC2626]" />
            <span>Backend not reachable. Check that the API is running.</span>
          </div>
          <button
            type="button"
            onClick={() => void automation.refetch()}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
          >
            <RotateCcw size={13} /> Retry
          </button>
        </GlassCard>
      ) : automation.isLoading && !overview ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-20" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-44" />
            ))}
          </div>
          <SkeletonBlock className="h-64" />
        </div>
      ) : overview ? (
        <>
          <SchedulerStoppedBanner health={overview.health} />

          <Reveal>
            <AutomationHeader
              schedules={schedules}
              primaryTimezone={primaryTimezone}
              showLocalTime={showLocalTime}
              canCreateSchedule={Boolean(overview.capabilities.canCreateSchedule ?? true)}
              isMock={overview.isMock}
              onToggleLocalTime={() => setShowLocalTime((v) => !v)}
              onOpenTimezoneSettings={() => openEditorForSchedule(schedules[0] ?? null)}
              onOpenOverrideDialog={() => openOverrideModal(null, "skip")}
              onNewSchedule={() => openEditorForSchedule(null)}
            />
          </Reveal>

          <Reveal delay={0.04}>
            <UpcomingChangesStrip
              changes={overview.upcomingChanges}
              isMock={overview.isMock}
              onSelectDate={(iso) => openDayDrawer(iso, false)}
            />
          </Reveal>

          <Reveal delay={0.08}>
            <WeekView
              weekOffset={weekOffset}
              direction={weekDirection}
              label={calendar.bounds.label}
              rangeLabel={calendar.bounds.rangeLabel}
              days={calendar.days}
              isLoading={calendar.isLoading}
              nextWeekHasOverrides={calendar.nextWeekHasOverrides}
              timezone={primaryTimezone}
              showLocalTime={showLocalTime}
              onPrevWeek={() => {
                setWeekDirection(-1);
                setWeekOffset((w) => w - 1);
              }}
              onNextWeek={() => {
                setWeekDirection(1);
                setWeekOffset((w) => w + 1);
              }}
              onToday={() => {
                setWeekDirection(weekOffset > 0 ? -1 : 1);
                setWeekOffset(0);
              }}
              onAddOverride={() => openOverrideModal(null, "skip")}
              onEditFutureWeek={() => {
                const nextWeekDate = new Date();
                nextWeekDate.setDate(nextWeekDate.getDate() + 7);
                openDayDrawer(nextWeekDate.toISOString().slice(0, 10), true);
              }}
              onSelectDay={(iso) => openDayDrawer(iso, false)}
            />
          </Reveal>

          <Reveal delay={0.12}>
            <PipelineOverview
              nodes={overview.pipeline}
              timezone={primaryTimezone}
              showLocalTime={showLocalTime}
            />
          </Reveal>

          {/* Default schedules + Scheduler health right column on >=1280 */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <section
              aria-label="Default weekly schedules"
              className="space-y-3 xl:col-span-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#1F2125]">
                  Default schedules
                </h2>
                <span className="font-mono text-[11px] text-[#9AA0AA]">
                  {schedules.length} configured
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {schedules.map((sched, idx) => (
                  <Reveal key={sched.id} delay={idx * 0.05}>
                    <JobCard
                      companyId={companyId}
                      schedule={sched}
                      showLocalTime={showLocalTime}
                      isMock={overview.isMock}
                      onToggleEnabled={(nextEnabled) =>
                        automation.toggleSchedule(sched.id, nextEnabled)
                      }
                      onRunNow={async () => {
                        const run = await automation.runNow(sched.id);
                        setSelectedRunId(run.id);
                      }}
                      onEdit={() => openEditorForSchedule(sched)}
                      onSkipNext={() => openOverrideModal(sched.id, "skip")}
                      onPauseUntil={() => openOverrideModal(sched.id, "pause")}
                      onViewHistory={() => {
                        handleFiltersChange({ ...filters, job: sched.jobType });
                        document
                          .getElementById("automation-run-history")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      onViewRun={(runId) => setSelectedRunId(runId)}
                      onDeleteCustom={
                        sched.isCustom
                          ? () => void automation.deleteSchedule(sched.id)
                          : undefined
                      }
                      onCountdownExpire={() => void automation.refetch()}
                    />
                  </Reveal>
                ))}
              </div>
            </section>

            <aside className="space-y-3 xl:col-span-4">
              <div className="hidden xl:block xl:h-[24px]" aria-hidden="true" />
              <SchedulerHealthCard health={overview.health} isMock={overview.isMock} />
            </aside>
          </div>

          <div id="automation-run-history">
            <RunHistoryTable
              companyId={companyId}
              runs={runsState.runs}
              total={runsState.total}
              schedules={schedules}
              filters={filters}
              hasMore={runsState.hasMore}
              isLoading={runsState.isLoading}
              loadingMore={runsState.loadingMore}
              freshIds={runsState.freshIds}
              timezone={primaryTimezone}
              showLocalTime={showLocalTime}
              isMock={overview.isMock}
              onChangeFilters={handleFiltersChange}
              onLoadMore={() => void runsState.loadMore()}
              onSelectRun={setSelectedRunId}
              onRetryRun={async (rid) => {
                const retried = await automation.retryRun(rid);
                setSelectedRunId(retried.id);
              }}
              onRunCrawlNow={handleRunCrawlNow}
            />
          </div>

          <Reveal belowFold>
            <OverridesList
              overrides={overview.overrides}
              schedules={schedules}
              timezone={primaryTimezone}
              showLocalTime={showLocalTime}
              isMock={overview.isMock}
              onAddOverride={() => openOverrideModal(null, "skip")}
              onRemoveOverride={(id) => automation.deleteOverride(id)}
            />
          </Reveal>
        </>
      ) : null}

      {/* Drawers & Dialogs */}
      <ScheduleEditorDrawer
        companyId={companyId}
        open={editorOpen}
        schedule={editingSchedule}
        allSchedules={schedules}
        emailConfigured={Boolean(overview?.capabilities.emailConfigured)}
        showLocalTime={showLocalTime}
        isSaving={automation.isSavingSchedule}
        onClose={() => setEditorOpen(false)}
        onSave={async (sid, draft: ScheduleDraft) => {
          await automation.saveSchedule(sid, draft);
        }}
        onDelete={async (sid) => {
          await automation.deleteSchedule(sid);
        }}
      />

      <DayDrawer
        companyId={companyId}
        open={dayDrawerOpen}
        selectedDate={selectedDayIso}
        pickMode={dayPickMode}
        schedules={schedules}
        timezone={primaryTimezone}
        showLocalTime={showLocalTime}
        onClose={() => setDayDrawerOpen(false)}
        onSelectDate={(iso) => {
          setSelectedDayIso(iso);
          setDayPickMode(false);
        }}
        onOpenRun={(runId) => setSelectedRunId(runId)}
        onRunNow={async (sid) => {
          const run = await automation.runNow(sid);
          setSelectedRunId(run.id);
        }}
        onCreateOverride={(draft) => automation.createOverride(draft)}
        onDeleteOverride={(ovId) => automation.deleteOverride(ovId)}
      />

      <OverrideDialog
        companyId={companyId}
        open={overrideDialogOpen}
        defaultScheduleId={overrideDefaultSchedId}
        defaultType={overrideDefaultType}
        schedules={schedules}
        isSubmitting={automation.isCreatingOverride}
        onClose={() => setOverrideDialogOpen(false)}
        onSubmit={(draft) => automation.createOverride(draft)}
      />

      <RunDrawer
        companyId={companyId}
        runId={selectedRunId}
        timezone={primaryTimezone}
        showLocalTime={showLocalTime}
        onClose={() => setSelectedRunId(null)}
        onRetryRun={(rid) => automation.retryRun(rid)}
      />

      {toast ? (
        <Toast
          key={toast.id}
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
