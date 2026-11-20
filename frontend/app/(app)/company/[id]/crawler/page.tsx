"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, RefreshCw, WifiOff } from "lucide-react";

import { ApiError, getCompany, getSignalStack } from "@/lib/api";
import {
  adaptCompanyDetail,
  buildDevMockCompany,
  buildDevMockSignalStack,
} from "@/lib/company-adapter";
import { useCollectedItems } from "@/hooks/useCollectedItems";
import { useCrawlerOverview } from "@/hooks/useCrawlerOverview";
import { useRunLogs } from "@/hooks/useRunLogs";
import { BASE_TRANSITION, fadeUp } from "@/lib/motion";
import type { CompanyRecord, SignalStack, SourceCrawlResultStatus } from "@/lib/types";
import {
  EmptyState,
  PageContainer,
  SkeletonBlock,
  Toast,
} from "@/components/ui-shared";
import {
  ActivityChart,
  CategoryCoverage,
  CollectedItemsTable,
  ConfirmBar,
  CrawlBudgetBar,
  CrawlerHeader,
  EtiquetteCard,
  EvidenceDrawer,
  HealthGauge,
  LiveLogTerminal,
  ResultBreakdown,
  RunControlCard,
  RunDetailDrawer,
  RunHistoryList,
  TotalsColumn,
} from "@/components/crawler";

function CrawlerSkeleton() {
  return (
    <div className="mx-auto max-w-[1380px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-36" />
          <SkeletonBlock className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-28 rounded-xl" />
          <SkeletonBlock className="h-9 w-32 rounded-xl" />
          <SkeletonBlock className="h-9 w-32 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-9">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <SkeletonBlock className="h-72 rounded-2xl lg:col-span-8" />
            <SkeletonBlock className="h-72 rounded-2xl lg:col-span-4" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <SkeletonBlock className="h-36 rounded-2xl md:col-span-6" />
            <SkeletonBlock className="h-36 rounded-2xl md:col-span-6" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
            <SkeletonBlock className="h-64 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-4 xl:col-span-3">
          <SkeletonBlock className="h-72 rounded-2xl" />
          <SkeletonBlock className="h-96 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function CrawlerInner() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);
  const reduced = Boolean(useReducedMotion());
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [highlightRunId, setHighlightRunId] = useState<number | null>(null);

  const companyQuery = useQuery<CompanyRecord>({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (useMocks) return buildDevMockCompany(companyId);
      const raw = await getCompany(companyId);
      return adaptCompanyDetail(raw);
    },
    enabled: Number.isFinite(companyId) && companyId > 0,
    retry: 1,
  });

  const company = companyQuery.data ?? null;
  const isLocked = Boolean(
    company &&
      !useMocks &&
      (company.workflowStatus.crawler
        ? company.workflowStatus.crawler === "locked"
        : company.workflowStatus.signals === "locked"),
  );

  const overviewHook = useCrawlerOverview(companyId, Boolean(company) && !isLocked);
  const overview = overviewHook.overview;

  const stackQuery = useQuery<SignalStack>({
    queryKey: ["signal-stack", companyId],
    queryFn: () =>
      useMocks ? Promise.resolve(buildDevMockSignalStack(companyId)) : getSignalStack(companyId),
    enabled: Boolean(company) && !isLocked,
    retry: 1,
  });

  const itemsHook = useCollectedItems(companyId, Boolean(company) && !isLocked);

  const streamRunId = overview?.activeRun?.id ?? overview?.lastRun?.id ?? null;
  const isRunActive = Boolean(overview?.activeRun);

  const logsHook = useRunLogs(companyId, streamRunId, isRunActive, () => {
    void overviewHook.refetch();
    void itemsHook.refetch();
  });

  if (companyQuery.isLoading || (!isLocked && overviewHook.isLoading && !overview)) {
    return <CrawlerSkeleton />;
  }

  if (companyQuery.isError || overviewHook.isError) {
    const err = companyQuery.error ?? overviewHook.error;
    const isOffline =
      err instanceof ApiError &&
      (err.status === 0 || err.status >= 500 || err.message.includes("Failed to fetch"));
    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-10">
        <EmptyState
          tone="error"
          icon={<WifiOff size={24} />}
          title={
            isOffline
              ? "Backend not reachable. Check that the API is running."
              : "Could not load Crawler Monitor"
          }
          description={err instanceof Error ? err.message : "An unexpected error occurred."}
          action={
            <button
              type="button"
              onClick={() => {
                void companyQuery.refetch();
                void overviewHook.refetch();
              }}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
            >
              <RefreshCw size={13} /> Retry
            </button>
          }
        />
      </div>
    );
  }

  if (!company) return null;

  if (isLocked) {
    return (
      <div className="mx-auto max-w-xl p-6 sm:p-10">
        <EmptyState
          icon={<Lock size={24} className="text-[#4F46E5]" />}
          title="Confirm your Signal Stack first"
          description="Approve at least one source in Customers, Competitors, and Market and start monitoring from your Signal Stack before launching the crawler."
          action={
            <Link
              href={`/company/${companyId}/signal-stack`}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
            >
              Go to Signal Stack
            </Link>
          }
        />
      </div>
    );
  }

  if (!overview) return null;

  const approvedSources = (stackQuery.data?.sources ?? []).filter(
    (s) => s.status === "approved" && s.category !== "internal",
  );
  const recentRuns = overview.recentRuns ?? (overview.lastRun ? [overview.lastRun] : []);
  const hasCompletedRun = Boolean(
    overview.lastRun &&
      (overview.lastRun.status === "completed" || overview.lastRun.status === "partial"),
  );

  async function handleStartCrawl(sourceIds?: number[]) {
    try {
      const started = await overviewHook.startCrawl(sourceIds);
      if (started?.id) {
        setHighlightRunId(started.id);
        setTimeout(() => setHighlightRunId(null), 2400);
      }
    } catch {
      /* inline startError handled by hook */
    }
  }

  function handleSelectOutcome(outcome: SourceCrawlResultStatus) {
    if (outcome === "success" || outcome === "partial") {
      itemsHook.setFilters({ ...itemsHook.filters, change: "new" });
    } else if (outcome === "not_modified") {
      itemsHook.setFilters({ ...itemsHook.filters, change: "unchanged" });
    }
    const el = document.getElementById("collected-evidence-section");
    el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <PageContainer className="mx-auto max-w-[1380px] space-y-5 p-4 sm:p-6">
      <motion.div variants={fadeUp(reduced)} initial="hidden" animate="visible">
        <CrawlerHeader
          companyId={companyId}
          overview={overview}
          range={overviewHook.range}
          onRangeChange={overviewHook.setRange}
          onRunNow={() => void handleStartCrawl()}
          isStarting={overviewHook.isStarting}
        />
      </motion.div>

      {/* Main 12-column responsive bento grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left/Main 9 columns on >=1280; uses contents on <768 so exact mobile order applies */}
        <div className="contents md:grid md:grid-cols-2 md:gap-4 xl:col-span-9 xl:flex xl:flex-col">
          {/* Row 1: Activity Chart (8) + Totals Column (4) */}
          <div className="contents xl:grid xl:grid-cols-12 xl:gap-4">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.06 }}
              className="order-3 md:col-span-2 xl:order-none xl:col-span-8"
            >
              <ActivityChart
                overview={overview}
                range={overviewHook.range}
                onRunNow={() => void handleStartCrawl()}
                isRunning={Boolean(overview.activeRun) || overviewHook.isStarting}
              />
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.12 }}
              className="order-2 md:col-span-2 xl:order-none xl:col-span-4"
            >
              <TotalsColumn totals={overview.totals} range={overviewHook.range} />
            </motion.div>
          </div>

          {/* Row 2: Crawl Budget + Etiquette */}
          <div className="contents xl:grid xl:grid-cols-12 xl:gap-4">
            {overview.budget ? (
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.18 }}
                className="order-5 md:col-span-1 xl:order-none xl:col-span-6"
              >
                <CrawlBudgetBar
                  budget={overview.budget}
                  isMock={overview.isMock}
                  isSaving={overviewHook.isUpdatingSettings}
                  onSaveLimit={overviewHook.updateMaxPages}
                />
              </motion.div>
            ) : null}

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.24 }}
              className={`order-6 md:col-span-1 xl:order-none ${
                overview.budget ? "xl:col-span-6" : "md:col-span-2 xl:col-span-12"
              }`}
            >
              <EtiquetteCard
                companyId={companyId}
                etiquette={overview.etiquette}
                isMock={overview.isMock}
              />
            </motion.div>
          </div>

          {/* Row 3: Result Breakdown + Health Gauge + Category Coverage */}
          <div className="contents xl:grid xl:grid-cols-12 xl:gap-4">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.3 }}
              className="order-4 md:col-span-1 xl:order-none xl:col-span-4"
            >
              <ResultBreakdown
                recentRuns={recentRuns}
                isMock={overview.isMock}
                onSelectOutcome={handleSelectOutcome}
              />
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.36 }}
              className="order-4 md:col-span-1 xl:order-none xl:col-span-4"
            >
              <HealthGauge health={overview.health} isMock={overview.isMock} />
            </motion.div>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.42 }}
              className="order-4 md:col-span-2 xl:order-none xl:col-span-4"
            >
              <CategoryCoverage
                companyId={companyId}
                coverage={overview.coverage}
                allTimeCoverage={overview.allTimeCoverage}
                isMock={overview.isMock}
              />
            </motion.div>
          </div>
        </div>

        {/* Right column (3 cols on >=1280; moves below main grid on 768-1279; ordered on <768) */}
        <div className="contents md:grid md:grid-cols-2 md:gap-4 xl:col-span-3 xl:flex xl:flex-col">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.1 }}
            className="order-1 md:col-span-1 xl:order-none"
          >
            <RunControlCard
              companyId={companyId}
              overview={overview}
              approvedSources={approvedSources}
              isStarting={overviewHook.isStarting}
              isCancelling={overviewHook.isCancelling}
              startError={overviewHook.startError}
              recheckingIds={overviewHook.recheckingIds}
              onRunNow={() => void handleStartCrawl()}
              onRunSelected={(ids) => void handleStartCrawl(ids)}
              onCancelRun={(runId) => void overviewHook.cancelCrawl(runId)}
              onRecheckSource={(sid) => void overviewHook.recheckSource(sid)}
              onRetryStart={() => void handleStartCrawl()}
            />
          </motion.div>

          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...BASE_TRANSITION, delay: reduced ? 0 : 0.2 }}
            className="order-7 md:col-span-1 xl:order-none"
          >
            <RunHistoryList
              companyId={companyId}
              initialRuns={recentRuns}
              range={overviewHook.range}
              highlightRunId={highlightRunId}
              isMock={overview.isMock}
              onSelectRun={(runId) => setSelectedRunId(runId)}
            />
          </motion.div>
        </div>
      </div>

      {/* Full-width Live Log Terminal */}
      <LiveLogTerminal
        lines={logsHook.lines}
        connection={logsHook.connection}
        paused={logsHook.paused}
        hasMore={logsHook.hasMore}
        isLoadingMore={logsHook.isLoadingMore}
        onTogglePaused={logsHook.togglePaused}
        onClearView={logsHook.clearView}
        onLoadMore={() => void logsHook.loadMore()}
      />

      {/* Full-width Collected Evidence Table */}
      <div id="collected-evidence-section">
        <CollectedItemsTable
          items={itemsHook.items}
          total={itemsHook.total}
          sources={stackQuery.data?.sources ?? []}
          filters={itemsHook.filters}
          isLoading={itemsHook.isLoading}
          hasMore={itemsHook.hasMore}
          loadingMore={itemsHook.loadingMore}
          isMock={overview.isMock}
          onFiltersChange={itemsHook.setFilters}
          onSelectItem={(itemId) => itemsHook.setSelectedItemId(itemId)}
          onLoadMore={() => void itemsHook.loadMore()}
        />
      </div>

      {/* Sticky footer bar */}
      <ConfirmBar
        companyId={companyId}
        lastRun={overview.lastRun}
        hasCompletedRun={hasCompletedRun}
      />

      {/* Run Detail Drawer */}
      <RunDetailDrawer
        companyId={companyId}
        runId={selectedRunId}
        onClose={() => setSelectedRunId(null)}
        onRerunFailed={(sourceIds) => handleStartCrawl(sourceIds)}
      />

      {/* Evidence Detail Drawer */}
      <EvidenceDrawer
        companyId={companyId}
        item={itemsHook.selectedItem}
        isLoading={itemsHook.isLoadingDetail && itemsHook.selectedItemId !== null}
        onClose={() => itemsHook.setSelectedItemId(null)}
      />

      <Toast
        message={overviewHook.toast?.message ?? null}
        tone={overviewHook.toast?.tone ?? "ok"}
        onDismiss={overviewHook.dismissToast}
      />
    </PageContainer>
  );
}

export default function CrawlerMonitorPage() {
  return (
    <Suspense fallback={<CrawlerSkeleton />}>
      <CrawlerInner />
    </Suspense>
  );
}
