"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Lock, RefreshCw, WifiOff } from "lucide-react";

import { ApiError, getCompany } from "@/lib/api";
import { adaptCompanyDetail, buildDevMockCompany } from "@/lib/company-adapter";
import { useDraftAnswer } from "@/hooks/useDraftAnswer";
import { useInterview } from "@/hooks/useInterview";
import { useTextSelection } from "@/hooks/useTextSelection";
import type { CompanyRecord } from "@/lib/types";
import {
  EmptyState,
  PageContainer,
  SkeletonBlock,
  StatusPill,
  Toast,
} from "@/components/ui-shared";
import {
  ChatThread,
  Composer,
  InterviewHeader,
  InterviewProgress,
  LearnedPanel,
  SelectionReplyButton,
  StartCard,
  SuggestionList,
} from "@/components/interview";

const CONTEXT_STORAGE_KEY = "signalstack:interview-use-context";

function InterviewSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-4 p-4 sm:p-6">
        <SkeletonBlock className="h-12 w-full rounded-2xl" />
        <SkeletonBlock className="h-6 w-full rounded-xl" />
        <SkeletonBlock className="h-36 w-full rounded-2xl" />
        <div className="mt-auto">
          <SkeletonBlock className="h-28 w-full rounded-[28px]" />
        </div>
      </div>
      <div className="hidden w-[320px] border-l border-white/60 p-5 xl:block">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="mt-4 h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const companyId = Number(params?.id);
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [useContext, setUseContext] = useState<boolean>(true);
  const [learnedOpen, setLearnedOpen] = useState<boolean>(false);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [suggestionsDismissedForTurn, setSuggestionsDismissedForTurn] = useState<number | null>(null);
  const [editingTurnIndex, setEditingTurnIndex] = useState<number | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);

  // Restore persisted "Use research context" toggle + open Learned panel by default on >=1280px
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONTEXT_STORAGE_KEY);
      if (saved !== null) {
        setUseContext(saved === "true");
      }
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined" && window.innerWidth >= 1280) {
      setLearnedOpen(true);
    }
  }, []);

  function handleToggleContext() {
    setUseContext((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CONTEXT_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
    company && !useMocks && company.workflowStatus.interview === "locked",
  );

  const interviewHook = useInterview(
    companyId,
    Boolean(company) && !isLocked,
  );
  const interview = interviewHook.interview;

  const activeTurnIndex = interview?.currentIndex ?? 0;
  const currentTurn =
    interview?.turns.find((t) => t.index === activeTurnIndex && !t.answer) ?? null;

  const { draft, setDraft, clearDraft } = useDraftAnswer(companyId, activeTurnIndex);

  const handleReplyWithQuote = useCallback((text: string) => {
    setQuotedText(text);
    setFocusTrigger((prev) => prev + 1);
  }, []);

  const { selection, buttonRef, clearSelection } = useTextSelection({
    onTriggerReply: handleReplyWithQuote,
  });

  // Focus composer whenever a new active question appears
  useEffect(() => {
    if (currentTurn && !interviewHook.isSubmitting && !interviewHook.isSkipping) {
      setFocusTrigger((prev) => prev + 1);
      setQuotedText(null);
    }
  }, [currentTurn?.index, interviewHook.isSubmitting, interviewHook.isSkipping, currentTurn]);

  // Surface transient notices from edits/restarts in Toast
  useEffect(() => {
    if (interviewHook.notice) {
      setToast({ message: interviewHook.notice, tone: "ok" });
      interviewHook.clearNotice();
    }
  }, [interviewHook]);

  async function handleSubmit() {
    if (!currentTurn || draft.trim().length === 0) return;
    const textToSend = draft.trim();
    const quoteToSend = quotedText ?? undefined;
    try {
      await interviewHook.submit({
        turnIndex: currentTurn.index,
        text: textToSend,
        quotedText: quoteToSend,
      });
      clearDraft();
      setQuotedText(null);
    } catch {
      // Keep draft and quote intact so user text is never lost
    }
  }

  async function handleSkip() {
    if (!currentTurn) return;
    try {
      await interviewHook.skip(currentTurn.index);
      clearDraft();
      setQuotedText(null);
    } catch {
      /* error shown in composer */
    }
  }

  async function handleBuildSignalStack() {
    if (!interview) return;
    if (interview.status !== "completed") {
      await interviewHook.complete();
    }
    router.push(`/company/${companyId}/signal-stack`);
  }

  function handleJumpToTurn(turnIndex: number) {
    const el = document.getElementById(`interview-turn-${turnIndex}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEditFromPanel(turnIndex: number) {
    setEditingTurnIndex(turnIndex);
    handleJumpToTurn(turnIndex);
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setLearnedOpen(false);
    }
  }

  if (companyQuery.isLoading || (!isLocked && interviewHook.isLoading && !interview)) {
    return <InterviewSkeleton />;
  }

  if (companyQuery.isError || interviewHook.isError) {
    const err = companyQuery.error ?? interviewHook.error;
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
              : "Could not load founder interview"
          }
          description={err instanceof Error ? err.message : "An unexpected error occurred."}
          action={
            <button
              type="button"
              onClick={() => {
                void companyQuery.refetch();
                void interviewHook.refetch();
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

  if (!company) {
    return null;
  }

  if (isLocked) {
    return (
      <div className="mx-auto max-w-xl p-6 sm:p-10">
        <EmptyState
          icon={<Lock size={24} className="text-[#4F46E5]" />}
          title="Confirm company profile first"
          description="Complete live company research and review the company profile before starting the 10-question founder interview."
          action={
            <Link
              href={`/company/${companyId}`}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
            >
              Review company profile
            </Link>
          }
        />
      </div>
    );
  }

  const isThinking = interviewHook.isSubmitting || interviewHook.isSkipping;
  const allDone = Boolean(
    interview && interview.turns.length > 0 && interview.turns.every((t) => Boolean(t.answer)),
  );
  const suggestions =
    currentTurn &&
    !isThinking &&
    suggestionsDismissedForTurn !== currentTurn.index &&
    currentTurn.suggestedAnswers &&
    currentTurn.suggestedAnswers.length > 0
      ? currentTurn.suggestedAnswers
      : [];

  return (
    <PageContainer className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Center Chat Column */}
      <div className="flex min-w-0 flex-1 flex-col px-3 sm:px-6">
        <div className="mx-auto flex h-full w-full max-w-[760px] flex-col">
          <InterviewHeader
            companyName={company.name}
            interview={interview}
            useContext={useContext}
            onToggleContext={handleToggleContext}
            learnedOpen={learnedOpen}
            onToggleLearned={() => setLearnedOpen((prev) => !prev)}
            onRestart={async () => {
              await interviewHook.reset();
            }}
            isResetting={interviewHook.isResetting}
          />

          {company.isMock ? (
            <div className="mt-2 flex items-center justify-center">
              <StatusPill tone="warning">MOCK DATA</StatusPill>
            </div>
          ) : null}

          {interview && interview.status === "not_started" ? (
            <StartCard
              companyName={company.name}
              servicesCount={company.services.length}
              competitorsCount={company.competitors.length}
              isStarting={interviewHook.isStarting}
              error={interviewHook.submitError}
              onStart={async () => {
                await interviewHook.start();
              }}
            />
          ) : interview ? (
            <>
              <InterviewProgress
                turns={interview.turns}
                currentIndex={interview.currentIndex}
                totalQuestions={interview.totalQuestions}
                onJumpToTurn={handleJumpToTurn}
              />

              <ChatThread
                company={company}
                interview={interview}
                useContext={useContext}
                isThinking={isThinking}
                thinkingStatus={interviewHook.thinkingStatus}
                activeQuote={quotedText}
                editingTurnIndex={editingTurnIndex}
                onClearForceEdit={() => setEditingTurnIndex(null)}
                onSaveEdit={async (idx, text) => {
                  await interviewHook.edit(idx, text);
                }}
                isEditing={interviewHook.isEditing}
                onBuildSignalStack={() => void handleBuildSignalStack()}
                isCompleting={interviewHook.isCompleting}
                onEditTurn={handleEditFromPanel}
              />

              {!allDone ? (
                <div className="pt-2">
                  {suggestions.length > 0 ? (
                    <SuggestionList
                      suggestions={suggestions}
                      onSelect={(text) => {
                        setDraft(text);
                        setFocusTrigger((prev) => prev + 1);
                      }}
                      onClose={() => {
                        if (currentTurn) setSuggestionsDismissedForTurn(currentTurn.index);
                      }}
                    />
                  ) : null}

                  <Composer
                    value={draft}
                    onChange={setDraft}
                    quotedText={quotedText}
                    onClearQuote={() => setQuotedText(null)}
                    model={interview.model}
                    disabled={isThinking || !currentTurn}
                    disabledReason={isThinking ? "Preparing the next question…" : "Interview complete"}
                    isSubmitting={interviewHook.isSubmitting}
                    isSkipping={interviewHook.isSkipping}
                    focusTrigger={focusTrigger}
                    error={interviewHook.submitError}
                    onRetry={() => void handleSubmit()}
                    onSubmit={() => void handleSubmit()}
                    onSkip={() => void handleSkip()}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Right Panel: What I've learned */}
      {interview && interview.status !== "not_started" ? (
        <LearnedPanel
          open={learnedOpen}
          onClose={() => setLearnedOpen(false)}
          learned={interview.learned}
          newlyLearnedId={interviewHook.newlyLearnedId}
          answeredCount={interview.turns.filter((t) => Boolean(t.answer && !t.answer.skipped)).length}
          skippedCount={interview.turns.filter((t) => Boolean(t.answer?.skipped)).length}
          onEditTurn={handleEditFromPanel}
        />
      ) : null}

      <SelectionReplyButton
        selection={selection}
        buttonRef={buttonRef}
        onReply={(text) => {
          handleReplyWithQuote(text);
          window.getSelection()?.removeAllRanges();
          clearSelection();
        }}
      />

      <Toast
        message={toast?.message ?? null}
        tone={toast?.tone ?? "ok"}
        onDismiss={() => setToast(null)}
      />
    </PageContainer>
  );
}
