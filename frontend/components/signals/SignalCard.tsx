"use client";

import {
  Bookmark,
  Check,
  EyeOff,
  FilePlus2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import type { CollectedItem, SignalItem, SignalPatchPayload } from "@/lib/types";
import {
  ActionBox,
  CategoryBadge,
  ClassificationPill,
  ConfidenceBadge,
  EvidenceBlock,
  GlassCard,
  PriorityDots,
  StatusPill,
} from "@/components/ui-shared";
import { InterpretationBlock } from "./InterpretationBlock";
import { RankingPopover } from "./RankingPopover";

export function SignalCard({
  signal,
  evidenceItem,
  onOpenDetail,
  onOpenEvidence,
  onPatch,
}: {
  signal: SignalItem;
  evidenceItem?: CollectedItem | null;
  onOpenDetail: (signalId: number) => void;
  onOpenEvidence: (item: CollectedItem) => void;
  onPatch: (signalId: number, patch: SignalPatchPayload) => void;
}) {
  const isSaved = signal.status === "saved";
  const isInBrief = signal.status === "in_brief";
  const isDismissed = signal.status === "dismissed";

  return (
    <GlassCard className="space-y-4 p-5">
      {/* Top meta row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={signal.category} />
          <ClassificationPill classification={signal.classification} />
          <ConfidenceBadge level={signal.confidence} />
          {signal.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PriorityDots priority={signal.priority} />
          <RankingPopover
            priorityValue={signal.priorityValue}
            reasons={signal.priorityReasons}
          />
        </div>
      </div>

      {/* Headline */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetail(signal.id)}
          className="focus-ring text-left text-base font-semibold tracking-[-0.015em] text-[#1F2125] hover:text-[#4F46E5]"
        >
          {signal.headline}
        </button>
        <span className="font-mono text-[11px] text-[#9AA0AA]">
          {formatRelativeTime(signal.detectedAt || signal.publishedAt)}
        </span>
      </div>

      {/* 1. Strict Fact Block */}
      <EvidenceBlock
        signalId={signal.id}
        evidenceItem={evidenceItem}
        verified={signal.verified}
        onOpenEvidence={onOpenEvidence}
      />

      {/* 2. Distinct AI Interpretation Block */}
      <InterpretationBlock
        whyItMatters={signal.whyItMatters}
        potentialImpact={signal.potentialImpact}
        impactLevel={signal.impactLevel}
        assumptionRefs={signal.assumptionRefs}
        limitations={signal.limitations}
      />

      {/* 3. Prominent Recommended Action */}
      <ActionBox action={signal.recommendedAction} />

      {/* Action footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onPatch(signal.id, { status: isInBrief ? "new" : "in_brief" })
            }
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors ${
              isInBrief
                ? "bg-[#1C1D21] text-white"
                : "border border-[#1F2125]/12 bg-white text-[#1F2125] hover:bg-[#F4F6FB]"
            }`}
          >
            {isInBrief ? <Check size={13} /> : <FilePlus2 size={13} />}
            <span>{isInBrief ? "In Monday Brief" : "Add to Monday Brief"}</span>
          </button>

          <button
            type="button"
            onClick={() => onPatch(signal.id, { status: isSaved ? "new" : "saved" })}
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors ${
              isSaved
                ? "border border-[#4F46E5]/30 bg-[#4F46E5]/10 text-[#4F46E5]"
                : "border border-white/85 bg-white/80 text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <Bookmark size={13} />
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onPatch(signal.id, { status: isDismissed ? "new" : "dismissed" })
            }
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-2.5 text-xs font-medium text-[#4B5058] hover:text-[#DC2626]"
          >
            <EyeOff size={13} />
            <span>{isDismissed ? "Restore" : "Dismiss"}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Mark signal useful"
            aria-pressed={signal.feedback === "useful"}
            onClick={() => onPatch(signal.id, { feedback: "useful" })}
            className={`focus-ring inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-xs transition-colors ${
              signal.feedback === "useful"
                ? "border-[#16A34A]/35 bg-[#16A34A]/10 font-medium text-[#15803D]"
                : "border-white/85 bg-white/80 text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <ThumbsUp size={12} />
            <span>Useful</span>
          </button>

          <button
            type="button"
            aria-label="Mark signal not useful"
            aria-pressed={signal.feedback === "not_useful"}
            onClick={() => onPatch(signal.id, { feedback: "not_useful" })}
            className={`focus-ring inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-xs transition-colors ${
              signal.feedback === "not_useful"
                ? "border-[#DC2626]/35 bg-[#DC2626]/10 font-medium text-[#B91C1C]"
                : "border-white/85 bg-white/80 text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <ThumbsDown size={12} />
            <span>Not useful</span>
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
