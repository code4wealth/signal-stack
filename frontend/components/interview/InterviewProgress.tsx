"use client";

import { motion, useReducedMotion } from "framer-motion";

import { BASE_TRANSITION, fadeUp } from "@/lib/motion";
import type { Turn } from "@/lib/types";

export function InterviewProgress({
  turns,
  currentIndex,
  totalQuestions,
  onJumpToTurn,
}: {
  turns: Turn[];
  currentIndex: number;
  totalQuestions: number;
  onJumpToTurn: (turnIndex: number) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const total = Math.max(totalQuestions, turns.length, 10);
  const completedCount = turns.filter((t) => Boolean(t.answer)).length;
  const activeNumber = Math.min(total, completedCount + 1);
  const remaining = Math.max(0, total - completedCount);

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="space-y-2 py-2.5"
    >
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="hidden font-medium text-[#1F2125] sm:inline">
          Question {activeNumber} of {total}
        </span>
        <span className="font-medium text-[#1F2125] sm:hidden">
          Q{activeNumber}/{total}
        </span>
        <span className="text-[#4B5058]">{remaining} left</span>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }).map((_, idx) => {
          const turn = turns[idx];
          const isAnswered = Boolean(turn?.answer && !turn.answer.skipped);
          const isSkipped = Boolean(turn?.answer?.skipped);
          const isCurrent = Boolean(turn && !turn.answer && turn.index === currentIndex);
          const clickable = Boolean(turn && turn.answer);

          const stateLabel = isAnswered
            ? "answered"
            : isSkipped
              ? "skipped"
              : isCurrent
                ? "current"
                : "upcoming";

          return (
            <button
              key={idx}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (turn) onJumpToTurn(turn.index);
              }}
              aria-label={`Question ${idx + 1}, ${stateLabel}`}
              title={`Question ${idx + 1}: ${stateLabel}`}
              className={`focus-ring relative h-1 sm:h-1.5 overflow-hidden rounded-full transition-colors ${
                clickable ? "cursor-pointer" : "cursor-default"
              } ${
                isAnswered
                  ? "bg-[#4F46E5]"
                  : isSkipped
                    ? "border border-[#94A3B8]/60 bg-[#94A3B8]/35"
                    : isCurrent
                      ? "bg-[#4F46E5]/30"
                      : "bg-white/60"
              }`}
              style={
                isSkipped
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(75,80,88,0.28) 3px, rgba(75,80,88,0.28) 5px)",
                    }
                  : undefined
              }
            >
              {isCurrent ? (
                <motion.span
                  initial={reduced ? false : { scaleX: 0.3 }}
                  animate={{ scaleX: 1 }}
                  transition={BASE_TRANSITION}
                  className={`block h-full w-full origin-left rounded-full bg-[#4F46E5] ${
                    reduced ? "" : "animate-pulse"
                  }`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
