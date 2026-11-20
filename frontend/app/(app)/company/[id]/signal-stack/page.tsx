"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lock, RefreshCw, WifiOff } from "lucide-react";

import { ApiError, getCompany, type ResearchStatus } from "@/lib/api";
import { adaptCompanyDetail, buildDevMockCompany } from "@/lib/company-adapter";
import { useSignalStack } from "@/hooks/useSignalStack";
import { useSourceFilters } from "@/hooks/useSourceFilters";
import type { CompanyRecord, Evidence, SignalStackSource, SourceCategory } from "@/lib/types";
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
  AddSourceDialog,
  AuditBanner,
  AuditReviewDialog,
  CategorySummaryRow,
  ConfirmBar,
  ManageSourceDrawer,
  SignalStackHeader,
  SourceFilterTabs,
  SourceGrid,
  SourceTable,
} from "@/components/signal-stack";

function SignalStackSkeleton() {
  return (
    <div className="mx-auto max-w-[1320px] space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-44" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-36 rounded-xl" />
          <SkeletonBlock className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="h-10 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-72 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function SignalStackInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const companyId = Number(params?.id);
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [addOpen, setAddOpen] = useState(false);
  const [addDefaultCategory, setAddDefaultCategory] = useState<SourceCategory>("market");
  const [managingSource, setManagingSource] = useState<SignalStackSource | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

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
    company && !useMocks && company.workflowStatus.sources === "locked",
  );

  const stackHook = useSignalStack(companyId, Boolean(company) && !isLocked);
  const stack = stackHook.signalStack;
  const sources = stack?.sources ?? [];

  const filters = useSourceFilters(sources);

  if (companyQuery.isLoading || (!isLocked && stackHook.isLoading && !stack)) {
    return <SignalStackSkeleton />;
  }

  if (companyQuery.isError || stackHook.isError) {
    const err = companyQuery.error ?? stackHook.error;
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
              : "Could not load Signal Stack"
          }
          description={err instanceof Error ? err.message : "An unexpected error occurred."}
          action={
            <button
              type="button"
              onClick={() => {
                void companyQuery.refetch();
                void stackHook.refetch();
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
          title="Complete founder interview first"
          description="Finish the 10-question adaptive founder interview before discovering and approving your Signal Stack monitoring sources."
          action={
            <Link
              href={`/company/${companyId}/interview`}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
            >
              Go to founder interview
            </Link>
          }
        />
      </div>
    );
  }

  if (!stack) return null;

  const evidenceMap = new Map<string, Evidence>();
  for (const ev of company.evidence) {
    evidenceMap.set(ev.id, ev);
    evidenceMap.set(ev.url, ev);
  }

  const isDiscovering =
    stackHook.isStartingDiscovery ||
    stack.discoveryStatus === "queued" ||
    stack.discoveryStatus === "running";

  const discoveryProgressStatus: ResearchStatus =
    stack.discoveryStatus === "queued"
      ? "reading_website"
      : stack.discoveryStatus === "running"
        ? "finding_competitors"
        : stack.discoveryStatus === "failed"
          ? "error"
          : "completed";

  const auditProposals = stack.auditProposals ?? [];

  function openAdd(category?: SourceCategory) {
    setAddDefaultCategory(
      category && category !== "internal"
        ? category
        : filters.activeCategory !== "all" && filters.activeCategory !== "internal"
          ? filters.activeCategory
          : "market",
    );
    setAddOpen(true);
  }

  return (
    <PageContainer className="mx-auto max-w-[1320px] space-y-6 p-4 sm:p-6">
      {/* Screen reader status announcements for approve / reject / bulk actions */}
      <div className="sr-only" aria-live="polite">
        {stackHook.liveAnnouncement}
      </div>

      {stack.isMock || company.isMock ? (
        <div>
          <StatusPill tone="warning">MOCK DATA</StatusPill>
        </div>
      ) : null}

      {auditProposals.length > 0 ? (
        <AuditBanner count={auditProposals.length} onReview={() => setAuditOpen(true)} />
      ) : null}

      <SignalStackHeader
        counts={stack.counts}
        isDiscovering={isDiscovering}
        onRerunDiscovery={async () => {
          await stackHook.runDiscovery();
        }}
        onOpenAddSource={() => openAdd()}
      />

      {isDiscovering ? (
        <GlassCard className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#1F2125]">
              {stack.discoveryStage || "Discovering and checking candidate sources…"}
            </p>
            <StatusPill tone="info">Polling every 3s</StatusPill>
          </div>
          <ResearchProgress
            companyName={company.name}
            websiteUrl={company.website}
            status={discoveryProgressStatus}
            error={stack.discoveryError ?? null}
            onRetry={() => void stackHook.runDiscovery()}
            onEdit={() => openAdd()}
          />
        </GlassCard>
      ) : null}

      {stack.discoveryStatus === "failed" && sources.length === 0 ? (
        <EmptyState
          tone="error"
          icon={<AlertTriangle size={22} />}
          title="Source discovery failed"
          description={stack.discoveryError || "Could not discover sources for this company."}
          action={
            <button
              type="button"
              onClick={() => void stackHook.runDiscovery()}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
            >
              <RefreshCw size={13} /> Retry discovery
            </button>
          }
        />
      ) : null}

      <CategorySummaryRow
        sources={sources}
        internalFiles={stack.internalFiles}
        activeCategory={filters.activeCategory}
        onSelectCategory={filters.setCategory}
      />

      <SourceFilterTabs
        counts={stack.counts}
        totalSources={sources.length}
        activeStatus={filters.activeStatus}
        onSelectStatus={filters.setStatus}
        search={filters.search}
        onSearchChange={filters.setSearch}
        sortBy={filters.sortBy}
        onSortChange={filters.setSortBy}
        viewMode={filters.viewMode}
        onViewModeChange={filters.setViewMode}
      />

      {filters.viewMode === "table" && filters.activeCategory !== "internal" ? (
        <SourceTable
          sources={filters.filteredSources}
          onApprove={(id) => void stackHook.patchSource(id, { status: "approved" })}
          onReject={(id) => void stackHook.patchSource(id, { status: "rejected" })}
          onRestore={(id) => void stackHook.patchSource(id, { status: "needs_review" })}
          onRecheck={(id) => void stackHook.recheckSource(id)}
          onManage={(src) => setManagingSource(src)}
        />
      ) : (
        <SourceGrid
          sources={filters.filteredSources}
          internalFiles={stack.internalFiles}
          activeCategory={filters.activeCategory}
          recommendedThreshold={stack.recommendedThreshold}
          allowedExtensions={stack.allowedExtensions}
          maxUploadBytes={stack.maxUploadBytes}
          evidenceMap={evidenceMap}
          justApprovedId={stackHook.justApprovedId}
          checkingIds={stackHook.checkingIds}
          isUploadingFile={stackHook.isUploadingFile}
          isBulkUpdating={stackHook.isBulkUpdating}
          onApprove={(id) => void stackHook.patchSource(id, { status: "approved" })}
          onReject={(id) => void stackHook.patchSource(id, { status: "rejected" })}
          onRestore={(id) => void stackHook.patchSource(id, { status: "needs_review" })}
          onRecheck={(id) => void stackHook.recheckSource(id)}
          onManage={(src) => setManagingSource(src)}
          onChangeFrequency={(id, freq) => void stackHook.patchSource(id, { frequency: freq })}
          onDelete={(id) => void stackHook.deleteSource(id)}
          onBulkApprove={stackHook.bulkApprove}
          onUploadFile={stackHook.uploadFile}
          onDeleteFile={stackHook.deleteFile}
          onOpenAddSource={openAdd}
          onRerunDiscovery={() => void stackHook.runDiscovery()}
        />
      )}

      <ConfirmBar
        companyId={companyId}
        sources={sources}
        internalFilesCount={stack.internalFiles.length}
        isConfirming={stackHook.isConfirming}
        onStartMonitoring={async () => {
          await stackHook.confirm();
          router.push(`/company/${companyId}/crawler`);
        }}
      />

      <AddSourceDialog
        open={addOpen}
        defaultCategory={addDefaultCategory}
        onClose={() => setAddOpen(false)}
        onSubmitSource={stackHook.addSource}
      />

      <ManageSourceDrawer
        source={managingSource}
        evidenceMap={evidenceMap}
        onClose={() => setManagingSource(null)}
        onSave={async (sourceId, patch) => {
          await stackHook.patchSource(sourceId, patch);
        }}
        onReject={async (sourceId) => {
          await stackHook.patchSource(sourceId, { status: "rejected" });
        }}
      />

      <AuditReviewDialog
        open={auditOpen}
        proposals={auditProposals}
        evidenceMap={evidenceMap}
        isApplying={stackHook.isApplyingAudit}
        onClose={() => setAuditOpen(false)}
        onApply={async (decisions) => {
          await stackHook.applyAudit(decisions);
        }}
      />

      <Toast
        message={stackHook.toast?.message ?? null}
        tone={stackHook.toast?.tone ?? "ok"}
        onDismiss={stackHook.dismissToast}
      />
    </PageContainer>
  );
}

export default function SignalStackPage() {
  return (
    <Suspense fallback={<SignalStackSkeleton />}>
      <SignalStackInner />
    </Suspense>
  );
}
