"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { RunDrawer } from "@/components/automation/RunDrawer";
import { EvidenceDrawer } from "@/components/crawler/EvidenceDrawer";
import { SignalDrawer } from "@/components/signals/SignalDrawer";
import { SkeletonBlock, Toast } from "@/components/ui-shared";
import { useBrief } from "@/hooks/useBrief";
import { useBriefActions } from "@/hooks/useBriefActions";
import { useBriefGeneration } from "@/hooks/useBriefGeneration";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import { api, getBriefPdfBlob, patchSignal, retryRun } from "@/lib/api";
import { briefToMarkdown } from "@/lib/brief-markdown";
import { adaptCompanyDetail } from "@/lib/company-adapter";
import { FAST_TRANSITION } from "@/lib/motion";
import type { CollectedItem, SignalPatchPayload } from "@/lib/types";
import { ActionsSection } from "./ActionsSection";
import { BriefEmptyState } from "./BriefEmptyState";
import { BriefFooterBar } from "./BriefFooterBar";
import { BriefHero } from "./BriefHero";
import { BriefRightRail } from "./BriefRightRail";
import { BriefTableOfContents } from "./BriefTableOfContents";
import { CategoryIntelligenceSection } from "./CategoryIntelligenceSection";
import { EmailBriefPopover } from "./EmailBriefPopover";
import { ExecutiveSummarySection } from "./ExecutiveSummarySection";
import { GenerationState } from "./GenerationState";
import { HistoryDrawer } from "./HistoryDrawer";
import { OpportunitiesSection } from "./OpportunitiesSection";
import { RisksSection } from "./RisksSection";
import { SourceAppendixSection } from "./SourceAppendixSection";
import { WatchSection } from "./WatchSection";
import { BRIEF_SECTION_DEFS } from "./briefMeta";

const CATEGORY_SECTION_NUMBERS: Record<string, string> = {
  customers: "02",
  competitors: "03",
  market: "04",
  internal: "05",
};

export function BriefReaderView({
  companyId,
  briefId,
}: {
  companyId: number;
  briefId?: string;
}) {
  const { reduced } = useMotionSafe();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const progress = useReadingProgress();

  const sectionIds = useMemo(
    () => BRIEF_SECTION_DEFS.map((d) => d.id),
    [],
  );
  const activeSectionId = useScrollSpy(sectionIds, "executive-summary");

  const companyQuery = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => api.getCompany(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
  const company = useMemo(
    () => (companyQuery.data ? adaptCompanyDetail(companyQuery.data) : null),
    [companyQuery.data],
  );

  const {
    brief,
    prerequisites,
    isLoading,
    error,
    refetchAll,
    syncCache,
    patchBrief,
    isPatching,
    submitFeedback,
    isSubmittingFeedback,
    toggleWatch,
  } = useBrief(companyId, briefId);

  const { generation, isGenerating, startGeneration, isStarting } =
    useBriefGeneration(companyId, () => {
      refetchAll();
    });

  const { updateAction, createAction, isCreatingAction } = useBriefActions(
    companyId,
    brief,
    syncCache,
  );

  const [historyOpen, setHistoryOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<CollectedItem | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [highlightedSourceN, setHighlightedSourceN] = useState<number | null>(null);
  const [returnToOriginId, setReturnToOriginId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone?: "ok" | "error" } | null>(null);

  const showToast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ message, tone });
  }, []);

  const jumpToSource = useCallback(
    (n: number, originId?: string) => {
      const el = document.getElementById(`source-${n}`);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      setHighlightedSourceN(n);
      setReturnToOriginId(originId ?? null);
      window.setTimeout(() => {
        setHighlightedSourceN((cur) => (cur === n ? null : cur));
      }, 1300);
    },
    [reduced],
  );

  // Handle ?cite=n deep link on mount/brief load
  useEffect(() => {
    if (!brief) return;
    const citeParam = searchParams?.get("cite");
    if (!citeParam) return;
    const n = Number(citeParam);
    if (Number.isFinite(n) && n > 0) {
      window.setTimeout(() => jumpToSource(n), 250);
    }
  }, [brief, jumpToSource, searchParams]);

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
    },
    [reduced],
  );

  const jumpToCategoryItem = useCallback(
    (category: string, signalId: string) => {
      const el = document.getElementById(`signal-${category}-${signalId}`);
      if (el) {
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        return;
      }
      scrollToSection(category);
    },
    [reduced, scrollToSection],
  );

  const handleCopyMarkdown = async () => {
    if (!brief) return;
    await navigator.clipboard.writeText(briefToMarkdown(brief));
    showToast("Full brief copied as Markdown");
  };

  const handlePrintPdf = async () => {
    if (!brief) return;
    try {
      const blob = await getBriefPdfBlob(companyId, brief.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `monday-brief-v${brief.version}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("PDF downloaded");
    } catch {
      showToast("Use Save as PDF in the print dialog");
      window.setTimeout(() => window.print(), 120);
    }
  };

  const handleRegenerate = async () => {
    try {
      await startGeneration();
      showToast("Generating new Monday Morning Brief…");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start brief generation", "error");
    }
  };

  const handleSignalPatch = async (signalId: number, patch: SignalPatchPayload) => {
    await patchSignal(companyId, signalId, patch);
    queryClient.invalidateQueries({ queryKey: ["signal-detail", companyId, signalId] });
  };

  const isDraftEditable = Boolean(brief && brief.status === "draft" && !brief.isArchived);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6">
        <SkeletonBlock className="h-56 w-full rounded-[24px]" />
        <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
          <SkeletonBlock className="hidden h-80 rounded-2xl xl:block" />
          <div className="space-y-4">
            <SkeletonBlock className="h-44 rounded-2xl" />
            <SkeletonBlock className="h-44 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[780px] px-4 py-10">
        <div className="glass rounded-2xl p-6 text-sm text-[#B91C1C]">
          Failed to load Monday Morning Brief:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  if (isGenerating || generation.status === "failed") {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <GenerationState
          companyName={company?.name ?? `Company #${companyId}`}
          websiteUrl={company?.website ?? ""}
          generation={generation}
          onRetry={handleRegenerate}
          onCancelView={() => refetchAll()}
        />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <BriefEmptyState
          companyId={companyId}
          prerequisites={prerequisites}
          onGenerate={handleRegenerate}
          isGenerating={isStarting || isGenerating}
        />
      </div>
    );
  }

  return (
    <>
      {/* 2px scaleX Reading Progress Bar */}
      <div
        aria-hidden="true"
        className="brief-reading-progress no-print fixed left-0 right-0 top-14 z-20 h-[2px] bg-transparent pointer-events-none"
      >
        <div
          className="h-full origin-left bg-[#4F46E5]"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={brief.id}
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 1 } : { opacity: 0 }}
            transition={FAST_TRANSITION}
          >
            {/* 3-Zone Editorial Layout */}
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-center">
              {/* Left Sticky 220px TOC (chip bar <1280px) */}
              <BriefTableOfContents
                brief={brief}
                activeId={activeSectionId}
                onSelectSection={scrollToSection}
                onCopyMarkdown={handleCopyMarkdown}
                onPrintPdf={handlePrintPdf}
              />

              {/* Centered 800px Reading Column */}
              <article className="w-full max-w-[800px] space-y-10 min-w-0">
                <BriefHero
                  brief={brief}
                  onCopyMarkdown={handleCopyMarkdown}
                  onPrintPdf={handlePrintPdf}
                  onOpenEmail={() => setEmailOpen(true)}
                  onOpenHistory={() => setHistoryOpen(true)}
                  onRegenerate={handleRegenerate}
                  isRegenerating={isStarting || isGenerating}
                  onOpenRunDrawer={(rid) => setActiveRunId(rid)}
                />

                {/* Right Rail below Hero for <1440px */}
                <div className="2xl:hidden">
                  <BriefRightRail
                    brief={brief}
                    onSubmitFeedback={submitFeedback}
                    isSubmittingFeedback={isSubmittingFeedback}
                    onOpenRunDrawer={(rid) => setActiveRunId(rid)}
                    compactHorizontal
                  />
                </div>

                {/* 01. Executive Summary */}
                <ExecutiveSummarySection
                  items={brief.executiveSummary}
                  sources={brief.sources}
                  onJumpToSource={jumpToSource}
                  onJumpToCategoryItem={jumpToCategoryItem}
                  onInspectSignal={(sid) => setActiveSignalId(sid)}
                />

                {/* 02–05. Category Intelligence Sections */}
                {brief.sections.map((section) => (
                  <CategoryIntelligenceSection
                    key={section.key}
                    sectionNumber={CATEGORY_SECTION_NUMBERS[section.key] ?? "02"}
                    section={section}
                    sources={brief.sources}
                    isDraftEditable={isDraftEditable}
                    noteText={
                      brief.notes.find((n) => n.sectionKey === section.key)?.text ?? ""
                    }
                    onSaveNote={async (sectionKey, text) => {
                      const nextNotes = [
                        ...brief.notes.filter((n) => n.sectionKey !== sectionKey),
                        { sectionKey, text },
                      ];
                      await patchBrief({ notes: nextNotes });
                      showToast("Section note saved");
                    }}
                    onRemoveItem={async (itemId) => {
                      await patchBrief({ removeItemIds: [itemId] });
                      showToast("Item removed from draft brief");
                    }}
                    onJumpToSource={jumpToSource}
                    onInspectSignal={(sid) => setActiveSignalId(sid)}
                  />
                ))}

                {/* 06. Opportunities */}
                <OpportunitiesSection
                  items={brief.opportunities}
                  sources={brief.sources}
                  onJumpToSource={jumpToSource}
                  onJumpToActions={() => scrollToSection("actions")}
                />

                {/* 07. Risks & Threats */}
                <RisksSection
                  items={brief.risks}
                  sources={brief.sources}
                  onJumpToSource={jumpToSource}
                />

                {/* 08. Recommended Actions */}
                <ActionsSection
                  actions={brief.actions}
                  sources={brief.sources}
                  isDraftEditable={isDraftEditable}
                  isArchived={Boolean(brief.isArchived)}
                  onUpdateAction={updateAction}
                  onCreateAction={createAction}
                  isCreatingAction={isCreatingAction}
                  onInspectSignal={(sid) => setActiveSignalId(sid)}
                  onJumpToSource={jumpToSource}
                  onToast={(msg) => showToast(msg)}
                />

                {/* 09. What We Should Watch */}
                <WatchSection
                  items={brief.watch}
                  sources={brief.sources}
                  onToggleWatch={toggleWatch}
                  onJumpToSource={jumpToSource}
                />

                {/* 10. Source Appendix */}
                <SourceAppendixSection
                  sources={brief.sources}
                  highlightedSourceN={highlightedSourceN}
                  returnToOriginId={returnToOriginId}
                  onClearReturn={() => {
                    setHighlightedSourceN(null);
                    setReturnToOriginId(null);
                  }}
                />
              </article>

              {/* Right Sticky 280px Rail at >=1440px (2xl) */}
              <aside className="hidden w-[280px] shrink-0 2xl:block">
                <div className="sticky top-20">
                  <BriefRightRail
                    brief={brief}
                    onSubmitFeedback={submitFeedback}
                    isSubmittingFeedback={isSubmittingFeedback}
                    onOpenRunDrawer={(rid) => setActiveRunId(rid)}
                  />
                </div>
              </aside>
            </div>

            <BriefFooterBar
              brief={brief}
              onMarkReady={async () => {
                await patchBrief({ status: "ready" });
                showToast("Brief marked as ready");
              }}
              isPatching={isPatching}
              onRegenerate={handleRegenerate}
              isRegenerating={isStarting || isGenerating}
              onOpenEmail={() => setEmailOpen(true)}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Drawers & Modals */}
      <HistoryDrawer
        companyId={companyId}
        currentBriefId={brief.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <EmailBriefPopover
        companyId={companyId}
        briefId={brief.id}
        emailConfigured={Boolean(brief.capabilities?.emailConfigured)}
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        onSuccess={(to) => showToast(`Brief sent to ${to}`)}
      />

      <SignalDrawer
        companyId={companyId}
        signalId={activeSignalId}
        onClose={() => setActiveSignalId(null)}
        onSelectSignal={(nextId) => setActiveSignalId(nextId)}
        onOpenEvidence={(item) => setActiveEvidence(item)}
        onPatch={handleSignalPatch}
      />

      <EvidenceDrawer
        companyId={companyId}
        item={activeEvidence}
        isLoading={false}
        onClose={() => setActiveEvidence(null)}
      />

      <RunDrawer
        companyId={companyId}
        runId={activeRunId}
        timezone="UTC"
        showLocalTime
        onClose={() => setActiveRunId(null)}
        onRetryRun={(rid) => retryRun(companyId, rid)}
      />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "ok"}
        onDismiss={() => setToast(null)}
      />
    </>
  );
}
