"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock, Radar } from "lucide-react";

import { EvidenceDrawer } from "@/components/crawler/EvidenceDrawer";
import {
  AnalysisProgress,
  AskAiPanel,
  CategoryAllocation,
  ConfirmBar,
  FeedFilters,
  FilterRail,
  KpiRow,
  LatestEvidence,
  SignalCard,
  SignalDrawer,
  SignalsHeader,
  SignalsTabs,
  SignalVolumeChart,
  TopMovers,
  TopSignalsTable,
} from "@/components/signals";
import { EmptyState, PageContainer, SkeletonBlock, Toast } from "@/components/ui-shared";
import { useAskSignals } from "@/hooks/useAskSignals";
import { useSignalFilters } from "@/hooks/useSignalFilters";
import { useSignalsFeed } from "@/hooks/useSignalsFeed";
import { useSignalsOverview } from "@/hooks/useSignalsOverview";
import { api, getItem } from "@/lib/api";
import { adaptCompanyDetail } from "@/lib/company-adapter";
import type { CollectedItem } from "@/lib/types";

export default function SignalsPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [toast, setToast] = useState<{ id: number; tone: "ok" | "error"; message: string } | null>(
    null,
  );
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [analysisDismissed, setAnalysisDismissed] = useState(false);
  const [drawerEvidenceItem, setDrawerEvidenceItem] = useState<CollectedItem | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  const notify = useCallback((tone: "ok" | "error", message: string) => {
    setToast({ id: Date.now(), tone, message });
  }, []);

  const filters = useSignalFilters();

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => adaptCompanyDetail(await api.getCompany(companyId)),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });

  const sourcesQuery = useQuery({
    queryKey: ["sources", companyId],
    queryFn: () => api.listSources(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });

  const isMocksEnabled = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
  const isLocked =
    !isMocksEnabled &&
    companyQuery.data?.workflowStatus?.signals === "locked";

  const overviewHook = useSignalsOverview(companyId, filters.range, !isLocked, notify);
  const feedHook = useSignalsFeed(
    companyId,
    filters.effectiveFilters,
    !isLocked && filters.tab !== "overview",
    notify,
  );
  const askHook = useAskSignals(
    companyId,
    overviewHook.overview?.suggestedQuestions ?? [],
  );

  // Sync URL ?item= with EvidenceDrawer
  useEffect(() => {
    if (!filters.selectedEvidenceItemId || !Number.isFinite(companyId)) return;
    let active = true;
    setLoadingEvidence(true);
    getItem(companyId, filters.selectedEvidenceItemId)
      .then((item) => {
        if (active) setDrawerEvidenceItem(item);
      })
      .catch(() => {
        if (active) notify("error", "Could not load referenced evidence item.");
      })
      .finally(() => {
        if (active) setLoadingEvidence(false);
      });
    return () => {
      active = false;
    };
  }, [companyId, filters.selectedEvidenceItemId, notify]);

  const openEvidence = (item: CollectedItem) => {
    setDrawerEvidenceItem(item);
    filters.updateParams({ item: String(item.id) });
  };

  const closeEvidence = () => {
    setDrawerEvidenceItem(null);
    filters.updateParams({ item: null });
  };

  if (companyQuery.isLoading) {
    return (
      <PageContainer>
        <SkeletonBlock className="h-12 w-72" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32" />
          ))}
        </div>
        <SkeletonBlock className="h-72" />
      </PageContainer>
    );
  }

  if (isLocked) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Lock size={20} className="text-[#4F46E5]" />}
          title="Signals unlock after your first crawl"
          description="Run the Crawler Monitor to collect real pages from your approved Signal Stack sources before analysing signals."
          action={
            <Link
              href={`/company/${companyId}/crawler`}
              className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
            >
              <Radar size={14} aria-hidden="true" />
              Go to Crawler Monitor
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const overview = overviewHook.overview;
  const company = companyQuery.data;
  const showAnalysisProgress =
    overview &&
    overview.analysisStatus !== "idle" &&
    !(overview.analysisStatus === "failed" && analysisDismissed);

  return (
    <PageContainer className="pb-24">
      <SignalsHeader
        range={filters.range}
        onRangeChange={filters.setRange}
        unanalysedItems={overview?.unanalysedItems ?? 0}
        isAnalysing={overview?.analysisStatus === "running"}
        isStartingAnalysis={overviewHook.isStartingAnalysis}
        lastAnalysedAt={overview?.lastAnalysedAt}
        isMock={overview?.isMock || feedHook.isMock}
        onAnalyse={() => {
          setAnalysisDismissed(false);
          overviewHook.triggerAnalysis();
        }}
        onOpenAskAi={() => setAskAiOpen(true)}
      />

      <SignalsTabs
        activeTab={filters.tab}
        counts={overview?.countsByStatus}
        onChange={filters.setTab}
      />

      {showAnalysisProgress && overview ? (
        <AnalysisProgress
          companyName={company?.name ?? `Company #${companyId}`}
          websiteUrl={company?.website ?? ""}
          status={overview.analysisStatus}
          steps={overview.analysisSteps}
          error={overview.analysisError}
          onRetry={() => overviewHook.triggerAnalysis()}
          onDismissError={() => setAnalysisDismissed(true)}
        />
      ) : null}

      {filters.tab === "overview" ? (
        overviewHook.isLoading || !overview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-32" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <SkeletonBlock className="h-80 lg:col-span-8" />
              <SkeletonBlock className="h-80 lg:col-span-4" />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <KpiRow
              overview={overview}
              onFilterFeed={(preset) => {
                filters.updateParams({
                  tab: "feed",
                  classification:
                    preset.classification && preset.classification !== "all"
                      ? preset.classification
                      : null,
                  minPriority:
                    preset.minPriority && preset.minPriority > 1
                      ? String(preset.minPriority)
                      : null,
                  status:
                    preset.status && preset.status !== "all" ? preset.status : null,
                });
              }}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <SignalVolumeChart
                  daily={overview.daily}
                  range={filters.range}
                  previousPeriodTotal={overview.previousPeriodTotal}
                  onSelectDate={(date) => {
                    filters.updateParams({
                      tab: "feed",
                      dateFrom: date,
                      dateTo: date,
                    });
                  }}
                />
              </div>
              <div className="lg:col-span-4">
                <TopSignalsTable
                  signals={overview.topSignals}
                  onSelectSignal={(sid) => filters.updateParams({ signal: String(sid) })}
                  onViewAll={() => filters.setTab("feed")}
                />
              </div>
            </div>

            <CategoryAllocation
              byCategory={overview.byCategory}
              avgConfidence={overview.avgConfidence}
              sourcesUsed={overview.sourcesUsed}
              awaitingReview={overview.awaitingReview}
              onSelectCategory={(cat) => {
                filters.updateParams({ tab: "feed", category: cat });
              }}
            />

            <TopMovers
              topOpportunities={overview.topOpportunities}
              topThreats={overview.topThreats}
              watchlist={overview.watchlist}
              onSelectSignal={(sid) => filters.updateParams({ signal: String(sid) })}
            />

            <LatestEvidence
              items={overview.latestEvidence}
              onSelectItem={openEvidence}
            />
          </div>
        )
      ) : (
        <div className="space-y-4">
          <FeedFilters
            categories={filters.categories}
            classification={filters.classification}
            minPriority={filters.minPriority}
            sourceId={filters.sourceId}
            status={filters.status}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            q={filters.q}
            sort={filters.sort}
            sources={sourcesQuery.data?.items ?? []}
            hasActiveFilters={filters.hasActiveFilters}
            lockClassification={
              filters.tab === "opportunities" || filters.tab === "threats"
            }
            lockStatus={filters.tab === "saved" || filters.tab === "dismissed"}
            onToggleCategory={filters.toggleCategory}
            onUpdate={filters.updateParams}
            onClear={filters.clearFilters}
          />

          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1 space-y-4">
              {feedHook.isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-64" />
                ))
              ) : feedHook.items.length === 0 ? (
                <EmptyState
                  title="No signals match these filters"
                  description={
                    filters.hasActiveFilters
                      ? "Try clearing active filters to view all collected signals."
                      : "Analyse collected evidence or run a fresh crawl to surface new signals."
                  }
                  action={
                    filters.hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={filters.clearFilters}
                        className="focus-ring h-9 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  {feedHook.items.map((sig) => {
                    const primaryId = sig.evidenceIds[0] ?? sig.itemIds[0];
                    const evItem = primaryId ? feedHook.evidenceById[primaryId] : null;
                    return (
                      <SignalCard
                        key={sig.id}
                        signal={sig}
                        evidenceItem={evItem}
                        onOpenDetail={(sid) => filters.updateParams({ signal: String(sid) })}
                        onOpenEvidence={openEvidence}
                        onPatch={feedHook.updateSignal}
                      />
                    );
                  })}

                  {feedHook.hasNextPage ? (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        disabled={feedHook.isFetchingNextPage}
                        onClick={() => void feedHook.fetchNextPage()}
                        className="focus-ring h-10 rounded-xl border border-white/85 bg-white/85 px-5 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white disabled:opacity-55"
                      >
                        {feedHook.isFetchingNextPage ? "Loading more…" : "Load more signals"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <FilterRail
              total={feedHook.total}
              visibleIds={feedHook.items.map((s) => s.id)}
              countsByClassification={feedHook.countsByClassification}
              countsByCategory={feedHook.countsByCategory}
              isBulkUpdating={feedHook.isBulkUpdating}
              onBulkAddToBrief={() =>
                feedHook.bulkUpdate(
                  feedHook.items.map((s) => s.id),
                  { status: "in_brief" },
                )
              }
            />
          </div>
        </div>
      )}

      <ConfirmBar
        companyId={companyId}
        inBriefCount={overview?.inBriefCount ?? 0}
        unreviewedCount={overview?.countsByStatus?.new ?? 0}
      />

      <SignalDrawer
        companyId={companyId}
        signalId={filters.selectedSignalId}
        onClose={() => filters.updateParams({ signal: null })}
        onSelectSignal={(sid) => filters.updateParams({ signal: String(sid) })}
        onOpenEvidence={openEvidence}
        onPatch={feedHook.updateSignal}
      />

      <EvidenceDrawer
        companyId={companyId}
        item={drawerEvidenceItem}
        isLoading={loadingEvidence}
        onClose={closeEvidence}
      />

      <AskAiPanel
        open={askAiOpen}
        messages={askHook.messages}
        suggestedQuestions={askHook.suggestedQuestions}
        quotedText={askHook.quotedText}
        isPending={askHook.isPending}
        error={askHook.error}
        onSetQuote={askHook.setQuotedText}
        onSend={askHook.sendQuestion}
        onClear={askHook.clearMessages}
        onOpenCitation={(sid) => {
          setAskAiOpen(false);
          filters.updateParams({ signal: String(sid) });
        }}
        onClose={() => setAskAiOpen(false)}
      />

      {toast ? (
        <Toast
          key={toast.id}
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </PageContainer>
  );
}
