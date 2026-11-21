"use client";

import { Suspense, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import {
  ApiError,
  confirmProfile,
  getCompany,
  rerunResearch,
  updateCompany,
  type ResearchStatus,
} from "@/lib/api";
import { adaptCompanyDetail, buildDevMockCompany, extractDomain } from "@/lib/company-adapter";
import { FAST_TRANSITION, fadeUp, staggerContainer } from "@/lib/motion";
import type {
  CompanyPatchPayload,
  CompanyRecord,
  CompetitorDecision,
  SegmentItem,
  ServiceItem,
} from "@/lib/types";
import { ResearchProgress } from "@/components/landing/ResearchProgress";
import {
  EmptyState,
  GlassCard,
  PageContainer,
  SkeletonBlock,
  StatusPill,
  Toast,
} from "@/components/ui-shared";
import {
  AiSummaryCard,
  CompanyHeader,
  CompanyTabs,
  CompetitorsSection,
  ConfirmBar,
  CustomersSection,
  DetailsPanel,
  EvidenceTable,
  ResearchActivity,
  ResearchLogTimeline,
  ServicesSection,
  StatCards,
  type CompanyTabDef,
  type CompanyTabKey,
} from "@/components/company";

const VALID_TABS: CompanyTabKey[] = [
  "overview",
  "services",
  "customers",
  "competitors",
  "evidence",
  "log",
];

function CompanyProfileSkeleton() {
  return (
    <div className="flex flex-col xl:flex-row">
      <div className="min-w-0 flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <SkeletonBlock className="h-12 w-12 rounded-xl" />
            <div className="space-y-2">
              <SkeletonBlock className="h-7 w-48" />
              <SkeletonBlock className="h-4 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-10 w-32 rounded-xl" />
            <SkeletonBlock className="h-10 w-36 rounded-xl" />
          </div>
        </div>
        <SkeletonBlock className="h-10 w-full rounded-xl" />
        <SkeletonBlock className="h-40 w-full rounded-2xl" />
        <StatCards company={null} loading />
        <SkeletonBlock className="h-48 w-full rounded-2xl" />
      </div>
      <div className="w-full space-y-4 border-t border-white/60 p-5 xl:w-[320px] xl:border-l xl:border-t-0">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function CompanyProfileInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const reduced = Boolean(useReducedMotion());
  const detailsRef = useRef<HTMLDivElement | null>(null);

  const companyId = Number(params?.id);
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const rawTab = searchParams.get("tab") as CompanyTabKey | null;
  const activeTab: CompanyTabKey =
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : "overview";

  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const companyQuery = useQuery<CompanyRecord>({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (useMocks) return buildDevMockCompany(companyId);
      const raw = await getCompany(companyId);
      return adaptCompanyDetail(raw);
    },
    enabled: Number.isFinite(companyId) && companyId > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.researchStatus;
      return status === "queued" || status === "running" ? 3000 : false;
    },
  });

  const company = companyQuery.data;

  const patchMutation = useMutation({
    mutationFn: async (patch: CompanyPatchPayload) => {
      if (useMocks) {
        return null;
      }
      const updated = await updateCompany(companyId, patch);
      return adaptCompanyDetail(updated);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["company", companyId] });
      const previous = queryClient.getQueryData<CompanyRecord>(["company", companyId]);
      if (previous) {
        const next: CompanyRecord = {
          ...previous,
          website: patch.website ?? previous.website,
          domain: patch.website ? extractDomain(patch.website) : previous.domain,
          summary: patch.summary ?? previous.summary,
          industry: patch.industry !== undefined ? patch.industry || null : previous.industry,
          businessModel:
            patch.business_model !== undefined
              ? patch.business_model || null
              : previous.businessModel,
          headquarters:
            patch.headquarters !== undefined
              ? patch.headquarters || null
              : previous.headquarters,
          founded: patch.founded !== undefined ? patch.founded || null : previous.founded,
          size:
            patch.company_size !== undefined
              ? patch.company_size || null
              : previous.size,
          primaryRegion:
            patch.primary_region !== undefined
              ? patch.primary_region || null
              : previous.primaryRegion,
          primaryLanguage:
            patch.primary_language !== undefined
              ? patch.primary_language || null
              : previous.primaryLanguage,
          services: patch.products
            ? patch.products.map((s, idx) => ({
                id: `svc-${idx}`,
                name: s.text.includes(":") ? s.text.split(":")[0]!.trim() : s.text,
                description: s.text.includes(":")
                  ? s.text.split(":").slice(1).join(":").trim()
                  : s.text,
                evidenceIds: s.evidence_url ? [`ev-manual-${idx}`] : [],
                verified: s.verified,
              }))
            : previous.services,
          customerSegments: patch.customers
            ? patch.customers.map((c, idx) => ({
                id: `seg-${idx}`,
                name: c.text.includes(":") ? c.text.split(":")[0]!.trim() : c.text,
                rationale: c.text.includes(":")
                  ? c.text.split(":").slice(1).join(":").trim()
                  : c.text,
                evidenceIds: c.evidence_url ? [`ev-manual-${idx}`] : [],
                verified: c.verified,
              }))
            : previous.customerSegments,
          competitors: patch.likely_competitors
            ? patch.likely_competitors.map((comp, idx) => ({
                id: `comp-${idx}-${extractDomain(comp.website)}`,
                name: comp.name,
                website: comp.website,
                domain: extractDomain(comp.website),
                reason: comp.reason,
                confidence: comp.reason ? "medium" : "low",
                decision: patch.competitor_decisions?.[comp.website] ?? "review",
                evidenceIds: [],
              }))
            : patch.competitor_decisions
              ? previous.competitors.map((comp) => ({
                  ...comp,
                  decision: patch.competitor_decisions?.[comp.website] ?? comp.decision,
                }))
              : previous.competitors,
        };
        queryClient.setQueryData(["company", companyId], next);
      }
      return { previous };
    },
    onError: (err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["company", companyId], context.previous);
      }
      setToast({
        message: err instanceof ApiError ? err.message : "Could not save change — rolled back.",
        tone: "error",
      });
    },
    onSuccess: (adapted) => {
      if (adapted) {
        queryClient.setQueryData(["company", companyId], adapted);
      }
      setToast({ message: "Saved.", tone: "ok" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (useMocks) return null;
      return confirmProfile(companyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      router.push(`/company/${companyId}/interview`);
    },
    onError: (err) => {
      setToast({
        message: err instanceof ApiError ? err.message : "Could not confirm profile.",
        tone: "error",
      });
    },
  });

  async function handleRerunResearch() {
    if (!company || rerunning) return;
    setRerunning(true);
    try {
      await rerunResearch(companyId);
      setToast({ message: "Re-running live website research…", tone: "ok" });
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : "Failed to start research.",
        tone: "error",
      });
    } finally {
      setRerunning(false);
    }
  }

  function handleSelectTab(nextTab: CompanyTabKey) {
    const paramsObj = new URLSearchParams(searchParams.toString());
    if (nextTab === "overview") {
      paramsObj.delete("tab");
    } else {
      paramsObj.set("tab", nextTab);
    }
    const qs = paramsObj.toString();
    router.replace(qs ? `/company/${companyId}?${qs}` : `/company/${companyId}`, { scroll: false });
  }

  function handleSaveServices(nextServices: ServiceItem[]) {
    if (!company) return;
    const evMap = new Map(company.evidence.map((e) => [e.id, e.url]));
    patchMutation.mutate({
      products: nextServices.map((item) => ({
        text:
          item.description && item.description !== item.name
            ? `${item.name}: ${item.description}`
            : item.name,
        evidence_url: (item.evidenceIds[0] && evMap.get(item.evidenceIds[0])) || "",
        verified: item.verified,
      })),
    });
  }

  function handleSaveSegments(nextSegments: SegmentItem[]) {
    if (!company) return;
    const evMap = new Map(company.evidence.map((e) => [e.id, e.url]));
    patchMutation.mutate({
      customers: nextSegments.map((item) => ({
        text:
          item.rationale && item.rationale !== item.name
            ? `${item.name}: ${item.rationale}`
            : item.name,
        evidence_url: (item.evidenceIds[0] && evMap.get(item.evidenceIds[0])) || "",
        verified: item.verified,
      })),
    });
  }

  function handleCompetitorDecision(website: string, decision: CompetitorDecision) {
    if (!company) return;
    const decisions: Record<string, CompetitorDecision> = {};
    for (const comp of company.competitors) {
      decisions[comp.website] = comp.website === website ? decision : comp.decision;
    }
    patchMutation.mutate({
      competitor_decisions: decisions,
    });
  }

  function handleAddCompetitor(item: { name: string; website: string; reason: string }) {
    if (!company) return;
    const decisions: Record<string, CompetitorDecision> = {};
    for (const comp of company.competitors) {
      decisions[comp.website] = comp.decision;
    }
    decisions[item.website] = "keep";

    patchMutation.mutate({
      likely_competitors: [
        ...company.competitors.map((comp) => ({
          name: comp.name,
          website: comp.website,
          reason: comp.reason,
        })),
        {
          name: item.name,
          website: item.website,
          reason: item.reason,
        },
      ],
      competitor_decisions: decisions,
    });
  }

  if (companyQuery.isLoading) {
    return <CompanyProfileSkeleton />;
  }

  if (companyQuery.isError) {
    const err = companyQuery.error;
    const isOffline =
      err instanceof ApiError &&
      (err.status === 0 ||
        err.message.startsWith("Backend not reachable") ||
        err.message.includes("Failed to fetch"));
    return (
      <div className="mx-auto max-w-2xl p-6 sm:p-10">
        <EmptyState
          tone="error"
          icon={<WifiOff size={24} />}
          title={
            isOffline
              ? "Backend not reachable. Check that the API is running."
              : "Could not load company profile"
          }
          description={err instanceof Error ? err.message : "An unexpected error occurred."}
          action={
            <button
              type="button"
              onClick={() => companyQuery.refetch()}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
            >
              <RefreshCw size={13} /> Retry
            </button>
          }
        />
      </div>
    );
  }

  if (!company) {
    return null;
  }

  const tabs: CompanyTabDef[] = [
    { key: "overview", label: "Overview" },
    { key: "services", label: "Services", count: company.services.length },
    { key: "customers", label: "Customers", count: company.customerSegments.length },
    { key: "competitors", label: "Competitors", count: company.competitors.length },
    { key: "evidence", label: "Evidence", count: company.evidence.length },
    { key: "log", label: "Research log", count: company.researchLog.length },
  ];

  const isRunningResearch =
    company.researchStatus === "queued" || company.researchStatus === "running";
  const hasProfileContent =
    Boolean(company.summary) ||
    company.services.length > 0 ||
    company.customerSegments.length > 0 ||
    company.pagesFetchedCount > 0;
  const isFailedEmpty = company.researchStatus === "failed" && !hasProfileContent;
  const progressStatus: ResearchStatus =
    company.researchStatus === "queued"
      ? "reading_website"
      : company.researchStatus === "running"
        ? "identifying_services"
        : company.researchStatus === "failed"
          ? "error"
          : "completed";

  return (
    <PageContainer className="flex flex-col xl:flex-row">
      {/* Main Content Column */}
      <div className="min-w-0 flex-1 space-y-6 p-4 sm:p-6">
        <CompanyHeader
          company={company}
          rerunning={rerunning}
          onRerunResearch={handleRerunResearch}
        />

        {isRunningResearch ? (
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#1F2125]">
                Researching {company.name}…
              </p>
              <StatusPill tone="info">Polling every 3s</StatusPill>
            </div>
            <ResearchProgress
              companyName={company.name}
              websiteUrl={company.website}
              status={progressStatus}
              error={company.researchError}
              onRetry={handleRerunResearch}
              onEdit={() =>
                detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            />
          </GlassCard>
        ) : null}

        {isFailedEmpty ? (
          <EmptyState
            tone="error"
            icon={<AlertTriangle size={22} />}
            title="Live research did not complete"
            description={
              company.researchError ??
              "Could not extract a company profile from the submitted website."
            }
            action={
              <button
                type="button"
                onClick={handleRerunResearch}
                disabled={rerunning}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
              >
                <RefreshCw size={13} /> Retry research
              </button>
            }
          />
        ) : null}

        <CompanyTabs tabs={tabs} activeTab={activeTab} onSelect={handleSelectTab} />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={FAST_TRANSITION}
          >
            {activeTab === "overview" ? (
              <motion.div
                variants={staggerContainer(reduced)}
                initial="hidden"
                animate="visible"
                className="space-y-6"
              >
                <motion.div variants={fadeUp(reduced)}>
                  <AiSummaryCard
                    companyName={company.name}
                    summary={company.summary}
                    updatedAt={company.summaryUpdatedAt}
                    evidence={company.evidence}
                    onSaveSummary={(nextSummary) => patchMutation.mutate({ summary: nextSummary })}
                  />
                </motion.div>

                <motion.div variants={fadeUp(reduced)}>
                  <StatCards company={company} />
                </motion.div>

                {company.unverified.length > 0 ? (
                  <motion.div variants={fadeUp(reduced)}>
                    <div className="rounded-2xl border border-dashed border-[#94A3B8] bg-white/55 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[#1F2125]">
                          Unverified hypotheses (not yet backed by a cited page)
                        </p>
                        <StatusPill tone="warning">Needs review</StatusPill>
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#4B5058]">
                        {company.unverified.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ) : null}

                <motion.div variants={fadeUp(reduced)}>
                  <ServicesSection
                    companyName={company.name}
                    services={company.services}
                    evidence={company.evidence}
                    onSaveServices={handleSaveServices}
                  />
                </motion.div>

                <motion.div variants={fadeUp(reduced)}>
                  <CustomersSection
                    segments={company.customerSegments}
                    evidence={company.evidence}
                    onSaveSegments={handleSaveSegments}
                  />
                </motion.div>

                <motion.div variants={fadeUp(reduced)}>
                  <CompetitorsSection
                    competitors={company.competitors}
                    evidence={company.evidence}
                    onDecisionChange={handleCompetitorDecision}
                    onAddCompetitor={handleAddCompetitor}
                  />
                </motion.div>

                <motion.div variants={fadeUp(reduced)}>
                  <ResearchActivity entries={company.researchLog} />
                </motion.div>

                <motion.div variants={fadeUp(reduced)}>
                  <ConfirmBar
                    confirmedAt={company.confirmedAt}
                    confirming={confirmMutation.isPending}
                    onEditDetails={() =>
                      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                    onConfirm={() => confirmMutation.mutate()}
                  />
                </motion.div>
              </motion.div>
            ) : null}

            {activeTab === "services" ? (
              <ServicesSection
                companyName={company.name}
                services={company.services}
                evidence={company.evidence}
                searchable
                onSaveServices={handleSaveServices}
              />
            ) : null}

            {activeTab === "customers" ? (
              <CustomersSection
                segments={company.customerSegments}
                evidence={company.evidence}
                searchable
                onSaveSegments={handleSaveSegments}
              />
            ) : null}

            {activeTab === "competitors" ? (
              <CompetitorsSection
                competitors={company.competitors}
                evidence={company.evidence}
                searchable
                onDecisionChange={handleCompetitorDecision}
                onAddCompetitor={handleAddCompetitor}
              />
            ) : null}

            {activeTab === "evidence" ? <EvidenceTable evidence={company.evidence} /> : null}

            {activeTab === "log" ? <ResearchLogTimeline entries={company.researchLog} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Right Sidebar: Company details */}
      <div ref={detailsRef}>
        <DetailsPanel
          company={company}
          onPatchField={(patch) => patchMutation.mutate(patch)}
        />
      </div>

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "ok"}
        onDismiss={() => setToast(null)}
      />
    </PageContainer>
  );
}

export default function CompanyProfilePage() {
  return (
    <Suspense fallback={<CompanyProfileSkeleton />}>
      <CompanyProfileInner />
    </Suspense>
  );
}
