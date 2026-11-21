"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";

import { staggerContainer } from "@/lib/motion";
import type { CompanyRecord, Evidence, Interview } from "@/lib/types";
import { IntroMessage } from "@/components/interview/IntroMessage";
import { AiQuestion } from "@/components/interview/AiQuestion";
import { FounderAnswer } from "@/components/interview/FounderAnswer";
import { ThinkingState } from "@/components/interview/ThinkingState";
import { CompletionSummary } from "@/components/interview/CompletionSummary";

export function ChatThread({
  company,
  interview,
  useContext,
  isThinking,
  thinkingStatus,
  activeQuote,
  editingTurnIndex,
  onClearForceEdit,
  onSaveEdit,
  isEditing,
  onBuildSignalStack,
  isCompleting,
  onEditTurn,
}: {
  company: CompanyRecord;
  interview: Interview;
  useContext: boolean;
  isThinking: boolean;
  thinkingStatus: string | null;
  activeQuote: string | null;
  editingTurnIndex: number | null;
  onClearForceEdit: () => void;
  onSaveEdit: (turnIndex: number, text: string) => Promise<void>;
  isEditing: boolean;
  onBuildSignalStack: () => void;
  isCompleting: boolean;
  onEditTurn: (turnIndex: number) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [scrolledUp, setScrolledUp] = useState(false);

  const evidenceMap = new Map<string, Evidence>();
  for (const ev of company.evidence) {
    evidenceMap.set(ev.id, ev);
    evidenceMap.set(ev.url, ev);
  }

  // Only reveal up to the current active turn (answered/skipped turns + current unanswered turn)
  const visibleTurns = interview.turns.filter(
    (t) => Boolean(t.answer) || t.index === interview.currentIndex,
  );
  const allAnswered =
    interview.turns.length > 0 && interview.turns.every((t) => Boolean(t.answer));

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setScrolledUp(distanceFromBottom > 120);
  }

  function jumpToLatest() {
    bottomRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    setScrolledUp(false);
  }

  // Auto-scroll to newest turn only when user hasn't intentionally scrolled up
  useEffect(() => {
    if (!scrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
  }, [visibleTurns.length, isThinking, allAnswered, scrolledUp, reduced]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label="Founder interview conversation"
        className="h-full space-y-6 overflow-y-auto px-1 py-4"
      >
        <IntroMessage company={company} />

        <motion.div
          variants={staggerContainer(reduced)}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {visibleTurns.map((turn) => (
            <div key={turn.id ?? turn.index} className="space-y-3.5">
              <AiQuestion
                turn={turn}
                evidenceMap={evidenceMap}
                useContext={useContext}
                isCurrent={!turn.answer && turn.index === interview.currentIndex && !isThinking}
                activeQuote={activeQuote}
              />
              {turn.answer ? (
                <FounderAnswer
                  turnIndex={turn.index}
                  answer={turn.answer}
                  forceEditing={editingTurnIndex === turn.index}
                  onCancelForceEdit={onClearForceEdit}
                  onSaveEdit={onSaveEdit}
                  isSaving={isEditing}
                />
              ) : null}
            </div>
          ))}
        </motion.div>

        {isThinking ? <ThinkingState status={thinkingStatus} /> : null}

        {allAnswered && !isThinking ? (
          <CompletionSummary
            learned={interview.learned}
            isCompleting={isCompleting}
            onBuildSignalStack={onBuildSignalStack}
            onReviewAnswers={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            onEditTurn={onEditTurn}
          />
        ) : null}

        <div ref={bottomRef} />
      </div>

      {scrolledUp ? (
        <button
          type="button"
          onClick={jumpToLatest}
          className="glass-strong focus-ring absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-[#1F2125] shadow-md hover:bg-white"
        >
          <ArrowDown size={13} /> Jump to latest
        </button>
      ) : null}
    </div>
  );
}
