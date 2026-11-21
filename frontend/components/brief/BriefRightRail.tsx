"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { GlassCard } from "@/components/ui-shared";
import type { Brief } from "@/lib/types";
import { estimateReadingMinutes, formatBriefDate } from "./briefMeta";

export function BriefRightRail({
  brief,
  onSubmitFeedback,
  isSubmittingFeedback,
  onOpenRunDrawer,
  compactHorizontal = false,
}: {
  brief: Brief;
  onSubmitFeedback: (payload: { useful: boolean; comment?: string }) => Promise<unknown>;
  isSubmittingFeedback: boolean;
  onOpenRunDrawer?: (runId: number) => void;
  compactHorizontal?: boolean;
}) {
  const [usefulDraft, setUsefulDraft] = useState<boolean | null>(
    brief.feedback?.useful ?? null,
  );
  const [comment, setComment] = useState(brief.feedback?.comment ?? "");
  const [savedToast, setSavedToast] = useState(false);

  const readMins = estimateReadingMinutes(brief);
  const doneCount = brief.actions.filter((a) => a.done).length;
  const totalActions = brief.actions.length;
  const actionPct = totalActions > 0 ? Math.round((doneCount / totalActions) * 100) : 0;

  const handleVote = async (useful: boolean) => {
    setUsefulDraft(useful);
    await onSubmitFeedback({ useful, comment: comment.trim() || undefined });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 1800);
  };

  const handleSaveComment = async () => {
    if (usefulDraft === null) return;
    await onSubmitFeedback({ useful: usefulDraft, comment: comment.trim() || undefined });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 1800);
  };

  return (
    <GlassCard
      strong={!compactHorizontal}
      className={
        compactHorizontal
          ? "no-print grid gap-4 p-4 sm:grid-cols-3"
          : "no-print space-y-4 p-4"
      }
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
            This brief
          </p>
          {brief.isMock ? (
            <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
              MOCK DATA
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#1F2125]">
          <Clock size={14} className="text-[#4F46E5]" aria-hidden="true" />
          <span>{readMins} min read</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-[#4B5058]">
          Generated {formatBriefDate(brief.generatedAt)}
        </p>

        {/* Mini counts & verified coverage */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-[#1F2125]/10 bg-white/80 px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
            {brief.stats.signals} signals
          </span>
          <span className="rounded-full border border-[#1F2125]/10 bg-white/80 px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
            {brief.stats.sources} sources
          </span>
          {brief.stats.verifiedPct < 100 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#EA580C]/35 bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#C2410C]">
              <AlertTriangle size={10} aria-hidden="true" />
              {brief.stats.verifiedPct}% verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/30 bg-[#059669]/8 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#047857]">
              <CheckCircle2 size={10} aria-hidden="true" />
              100% verified
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[#4B5058]">
            <span>Actions completed</span>
            <span className="tabular font-mono font-semibold text-[#1F2125]">
              {doneCount}/{totalActions}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1F2125]/10">
            <div
              className="h-full origin-left rounded-full bg-[#4F46E5] transition-transform"
              style={{ transform: `scaleX(${actionPct / 100})` }}
            />
          </div>
        </div>
      </div>

      {/* How this was made */}
      <div className={compactHorizontal ? "" : "border-t border-[#1F2125]/8 pt-3.5"}>
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
          How this was made
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-[#4B5058]">
          {brief.provenance.steps.map((step) => (
            <li key={step} className="flex items-start gap-1.5">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[#059669]" aria-hidden="true" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
        {brief.provenance.model ? (
          <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-[#9AA0AA]">
            <Cpu size={11} aria-hidden="true" />
            {brief.provenance.model}
          </p>
        ) : null}
        {brief.automationRunId && onOpenRunDrawer ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => onOpenRunDrawer(Number(brief.automationRunId))}
              className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] underline-offset-2 hover:underline"
            >
              Automation run #{brief.automationRunId} →
            </button>
          </div>
        ) : null}
      </div>

      {/* Feedback */}
      <div className={compactHorizontal ? "" : "border-t border-[#1F2125]/8 pt-3.5"}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
            Was this brief useful?
          </p>
          {savedToast ? (
            <span className="font-mono text-[10.5px] text-[#059669]">Saved</span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={isSubmittingFeedback}
            onClick={() => handleVote(true)}
            aria-pressed={usefulDraft === true}
            className={`focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              usefulDraft === true
                ? "border-[#059669]/40 bg-[#059669]/12 text-[#047857]"
                : "border-[#1F2125]/10 bg-white/75 text-[#4B5058] hover:bg-white"
            }`}
          >
            <ThumbsUp size={13} aria-hidden="true" />
            Yes
          </button>
          <button
            type="button"
            disabled={isSubmittingFeedback}
            onClick={() => handleVote(false)}
            aria-pressed={usefulDraft === false}
            className={`focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              usefulDraft === false
                ? "border-[#DC2626]/40 bg-[#DC2626]/10 text-[#B91C1C]"
                : "border-[#1F2125]/10 bg-white/75 text-[#4B5058] hover:bg-white"
            }`}
          >
            <ThumbsDown size={13} aria-hidden="true" />
            No
          </button>
        </div>

        {usefulDraft !== null ? (
          <div className="mt-2.5 space-y-1.5">
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional note on what to sharpen..."
              className="focus-ring w-full rounded-xl border border-[#1F2125]/12 bg-white/85 px-2.5 py-1.5 text-xs text-[#1F2125] placeholder:text-[#9AA0AA]"
            />
            <button
              type="button"
              disabled={isSubmittingFeedback}
              onClick={handleSaveComment}
              className="focus-ring rounded-lg bg-[#1C1D21] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1C1D21]/90"
            >
              Save note
            </button>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
