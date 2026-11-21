"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, RotateCcw } from "lucide-react";

import { EvidenceDrawer } from "@/components/crawler/EvidenceDrawer";
import {
  AdvisorPanel,
  AutomationHealthCard,
  CategoryKpiRow,
  CategoryPillSwitcher,
  DashboardHeader,
  MixDonut,
  PriorityHero,
  PublishHeatmap,
  RecentSignals,
  SetupChecklist,
  SourcePerformanceTable,
  TrendChart,
} from "@/components/dashboard";
import { Reveal } from "@/components/motion/Reveal";
import { ManageSourceDrawer } from "@/components/signal-stack/ManageSourceDrawer";
import { SignalDrawer } from "@/components/signals/SignalDrawer";
import { GlassCard, SkeletonBlock, Toast } from "@/components/ui-shared";
import { useAskSignals } from "@/hooks/useAskSignals";
import { useDashboard } from "@/hooks/useDashboard";
import { api, patchSignal } from "@/lib/api";
import { adaptCompanyDetail, extractDomain } from "@/lib/company-adapter";
import type {
  CollectedItem,
  DashboardRange,
  Evidence,
  SignalPatchPayload,
  SignalStackSource,
  SignalStackSourcePatch,
  Source,
  SourceCategory,
} from "@/lib/types";

const ADVISOR_STORAGE_KEY = "signalstack:advisor_open";
const VALID_RANGES: DashboardRange[] = ["week", "30d", "quarter"];
const VALID_CATEGORIES: SourceCategory[] = ["customers", "competitors", "market", "internal"];

function adaptSourceForManageDrawer(companyId: number, src: Source): SignalStackSource {
  const statusMap: Record<string, SignalStackSource["status"]> = {
    approved: "approved",
    rejected: "rejected",
    paused: src.health === "failing" ? "failing" : "approved",
    pending: "needs_review",
  };
  const freq =
    src.update_frequency === "hourly" ||
    src.update_frequency === "daily" ||
    src.update_frequency === "weekly"
      ? src.update_frequency
      : "daily";
  return {
    id: src.id,
    companyId,
    name: src.name,
    url: src.url,
    domain: extractDomain(src.url),
    category: src.category,
    type: src.source_type || "webpage",
    crawlMethod: src.feed_url ? "rss" : "html",
    status: statusMap[src.status] ?? "approved",
    relevanceScore: Math.round((src.relevance ?? 0.5) * 100),
    whyRecommended: src.reason || "",
    evidenceIds: [],
    discoveryConfidence: "medium",
    frequency: freq,
    lastCheckedAt: src.last_checked,
    lastError: src.last_error,
    robotsAllowed: true,
    isCustom: false,
  };
}

export default function DashboardPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const range = useMemo<DashboardRange>(() => {
    const raw = searchParams.get("range") as DashboardRange | null;
    return raw && VALID_RANGES.includes(raw) ? raw : "30d";
  }, [searchParams]);

  const activeCategory = useMemo<SourceCategory | null>(() => {
    const raw = searchParams.get("category") as SourceCategory | null;
    return raw && VALID_CATEGORIES.includes(raw) ? raw : null;
  }, [searchParams]);

  const [toast, setToast] = useState<{ id: number; tone: "ok" | "error"; message: string } | null>(
    null,
  );
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<number | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<CollectedItem | null>(null);
  const [managingSourceId, setManagingSourceId] = useState<number | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const prevSignalTotalRef = useRef<number | null>(null);

  // Restore Advisor open state for >=1440px viewports
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth >= 1440) {
      const stored = window.localStorage.getItem(ADVISOR_STORAGE_KEY);
      setAdvisorOpen(stored === null ? true : stored === "true");
    }
  }, []);

  const toggleAdvisor = () => {
    setAdvisorOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ADVISOR_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const notify = useCallback((tone: "ok" | "error", message: string) => {
    setToast({ id: Date.now(), tone, message });
  }, []);

  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

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

  const dashboard = useDashboard(companyId, range, activeCategory, notify);
  const data = dashboard.data;

  // Announce newly arrived signals via aria-live
  useEffect(() => {
    if (!data) return;
    if (prevSignalTotalRef.current !== null && data.totalSignalsInRange > prevSignalTotalRef.current) {
      const diff = data.totalSignalsInRange - prevSignalTotalRef.current;
      setLiveAnnouncement(`${diff} new signal${diff === 1 ? "" : "s"} arrived`);
    }
    prevSignalTotalRef.current = data.totalSignalsInRange;
  }, [data]);

  const askHook = useAskSignals(companyId, data?.suggestedQuestions ?? []);

  const companyName = companyQuery.data?.name ?? `Company #${companyId}`;
  const isOnboardingIncomplete = Boolean(
    data &&
      !data.isMock &&
      (data.workflowStatus.signals === "locked" || data.workflowStatus.sources !== "done"),
  );

  const managingSource = useMemo(() => {
    if (!managingSourceId || !sourcesQuery.data?.items) return null;
    const raw = sourcesQuery.data.items.find((s) => s.id === managingSourceId);
    return raw ? adaptSourceForManageDrawer(companyId, raw) : null;
  }, [companyId, managingSourceId, sourcesQuery.data?.items]);

  const emptyEvidenceMap = useMemo(() => new Map<string, Evidence>(), []);

  const handlePatchSignal = async (signalId: number, patch: SignalPatchPayload) => {
    try {
      await patchSignal(companyId, signalId, patch);
      notify("ok", "Signal updated.");
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["signal-detail", companyId, signalId] });
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not update signal.");
    }
  };

  const handleSaveSource = async (sourceId: number, patch: SignalStackSourcePatch) => {
    try {
      await api.patchSource(sourceId, {
        status: patch.status === "failing" ? "paused" : patch.status,
      });
      notify("ok", "Source updated.");
      setManagingSourceId(null);
      void queryClient.invalidateQueries({ queryKey: ["sources", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not update source.");
    }
  };

  const handleRejectSource = async (sourceId: number) => {
    await handleSaveSource(sourceId, { status: "rejected" });
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-start">
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1320px] space-y-5 px-4 py-6 sm:px-6">
          {/* Polite live announcer */}
          <span className="sr-only" aria-live="polite">
            {liveAnnouncement}
          </span>

          <DashboardHeader
            companyId={companyId}
            companyName={companyName}
            firstName={data?.user?.firstName}
            lastVisitAt={data?.lastVisitAt}
            lastUpdatedAt={data?.lastUpdatedAt}
            range={range}
            hasBrief={Boolean(data?.brief?.latestBriefId)}
            latestBriefId={data?.brief?.latestBriefId}
            activeCrawlRunning={Boolean(data?.activeCrawlRunning)}
            isStartingCrawl={dashboard.isStartingCrawl}
            isFetching={dashboard.isFetching}
            isMock={data?.isMock}
            advisorOpen={advisorOpen}
            onRangeChange={(nextRange) =>
              updateUrl({ range: nextRange === "30d" ? null : nextRange })
            }
            onRefresh={() => void dashboard.refetch()}
            onRunCrawl={() => dashboard.runCrawl()}
            onToggleAdvisor={toggleAdvisor}
          />

          {dashboard.error && !data ? (
            <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-[#DC2626]/25 bg-[#DC2626]/5 p-5">
              <div className="flex items-center gap-2.5 text-sm text-[#991B1B]">
                <AlertCircle size={18} className="shrink-0 text-[#DC2626]" />
                <span>Backend not reachable. Check that the API is running.</span>
              </div>
              <button
                type="button"
                onClick={() => void dashboard.refetch()}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
              >
                <RotateCcw size={13} /> Retry
              </button>
            </GlassCard>
          ) : dashboard.isLoading && !data ? (
            <div className="space-y-4">
              <SkeletonBlock className="h-56" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-36" />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <SkeletonBlock className="h-80 lg:col-span-5" />
                <SkeletonBlock className="h-80 lg:col-span-7" />
              </div>
            </div>
          ) : data && isOnboardingIncomplete ? (
            <SetupChecklist
              companyId={companyId}
              companyName={companyName}
              workflowStatus={data.workflowStatus}
            />
          ) : data ? (
            <>
              <CategoryPillSwitcher
                activeCategory={activeCategory}
                kpis={data.kpis}
                totalSignals={data.kpis.reduce((acc, k) => acc + k.newSignals, 0)}
                onChange={(nextCat) => updateUrl({ category: nextCat })}
              />

              {activeCategory ? (
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                  <Link
                    href={`/company/${companyId}/signal-stack?category=${activeCategory}`}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/85 bg-white/75 px-3 py-1 font-medium text-[#1F2125] no-underline transition-colors hover:bg-white hover:text-[#4F46E5]"
                  >
                    <span>
                      {activeCategory === "internal"
                        ? "Upload internal docs"
                        : `Manage ${activeCategory} sources`}
                    </span>
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                  <Link
                    href={`/company/${companyId}/signals?tab=feed&category=${activeCategory}`}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/85 bg-white/75 px-3 py-1 font-medium text-[#1F2125] no-underline transition-colors hover:bg-white hover:text-[#4F46E5]"
                  >
                    <span>View {activeCategory} signals</span>
                    <ArrowRight size={12} aria-hidden="true" />
                  </Link>
                  {activeCategory === "competitors" ? (
                    <Link
                      href={`/company/${companyId}/competitors`}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/85 bg-white/75 px-3 py-1 font-medium text-[#1F2125] no-underline transition-colors hover:bg-white hover:text-[#4F46E5]"
                    >
                      <span>Competitor profiles</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div
                className={`space-y-5 transition-opacity duration-150 ${
                  dashboard.isFetching && !dashboard.isLoading ? "opacity-80" : "opacity-100"
                }`}
              >
                <PriorityHero
                  companyId={companyId}
                  priorities={data.topPriorities}
                  evidenceById={data.evidenceById}
                  totalSignals={data.totalSignalsInRange}
                  lastUpdatedAt={data.lastUpdatedAt}
                  brief={data.brief}
                  onOpenSignal={setSelectedSignalId}
                  onOpenEvidence={setSelectedEvidence}
                />

                <CategoryKpiRow
                  kpis={data.kpis}
                  activeCategory={activeCategory}
                  onSelectCategory={(cat) =>
                    updateUrl({ category: activeCategory === cat ? null : cat })
                  }
                />

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <PublishHeatmap
                      cells={data.heatmap}
                      max={data.heatmapMax}
                      insight={data.heatmapInsight}
                    />
                  </div>
                  <div className="lg:col-span-7">
                    <TrendChart
                      companyId={companyId}
                      trend={data.trend}
                      range={range}
                    />
                  </div>
                </div>

                <Reveal belowFold>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <MixDonut mix={data.mix} />
                    <RecentSignals
                      companyId={companyId}
                      signals={data.recentSignals}
                      onOpenSignal={setSelectedSignalId}
                    />
                    <AutomationHealthCard
                      companyId={companyId}
                      jobs={data.jobs}
                      health={data.health}
                    />
                  </div>
                </Reveal>

                <Reveal belowFold>
                  <SourcePerformanceTable
                    companyId={companyId}
                    rows={data.sourcePerformance}
                    onManageSource={setManagingSourceId}
                    onRecheckSource={(sid) => dashboard.runCrawl([sid])}
                  />
                </Reveal>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!isOnboardingIncomplete ? (
        <AdvisorPanel
          open={advisorOpen}
          messages={askHook.messages}
          suggestedQuestions={askHook.suggestedQuestions}
          quotedText={askHook.quotedText}
          isPending={askHook.isPending}
          error={askHook.error}
          onSetQuote={askHook.setQuotedText}
          onSend={askHook.sendQuestion}
          onClear={askHook.clearMessages}
          onOpenCitation={(sid) => setSelectedSignalId(sid)}
          onClose={() => {
            setAdvisorOpen(false);
            try {
              window.localStorage.setItem(ADVISOR_STORAGE_KEY, "false");
            } catch {
              /* ignore */
            }
          }}
        />
      ) : null}

      <SignalDrawer
        companyId={companyId}
        signalId={selectedSignalId}
        onClose={() => setSelectedSignalId(null)}
        onSelectSignal={setSelectedSignalId}
        onOpenEvidence={setSelectedEvidence}
        onPatch={(sid, patch) => void handlePatchSignal(sid, patch)}
      />

      <EvidenceDrawer
        companyId={companyId}
        item={selectedEvidence}
        isLoading={false}
        onClose={() => setSelectedEvidence(null)}
      />

      <ManageSourceDrawer
        source={managingSource}
        evidenceMap={emptyEvidenceMap}
        onClose={() => setManagingSourceId(null)}
        onSave={handleSaveSource}
        onReject={handleRejectSource}
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
