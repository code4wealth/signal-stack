"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { formatRelativeTime } from "@/lib/company-adapter";
import type { CollectedItem, SignalItem } from "@/lib/types";
import { EmptyState, GlassCard } from "@/components/ui-shared";
import { BriefStatusBlock } from "./BriefStatusBlock";
import { PriorityCard } from "./PriorityCard";

export function PriorityHero({
  companyId,
  priorities,
  evidenceById,
  totalSignals,
  lastUpdatedAt,
  brief,
  onOpenSignal,
  onOpenEvidence,
}: {
  companyId: number;
  priorities: SignalItem[];
  evidenceById: Record<string, CollectedItem>;
  totalSignals: number;
  lastUpdatedAt?: string | null;
  brief?: {
    nextRunAt?: string | null;
    lastGeneratedAt?: string | null;
    latestBriefId?: string | null;
  } | null;
  onOpenSignal: (signalId: number) => void;
  onOpenEvidence?: (item: CollectedItem) => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <GlassCard
      spotlight
      className="relative overflow-hidden border-[#4F46E5]/15 bg-gradient-to-br from-indigo-50/75 via-white/85 to-blue-50/70 p-5 sm:p-6"
    >
      {/* Header row with one-shot 1.2s shimmer */}
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2 overflow-hidden rounded-xl px-1 py-1">
        {!reduced ? (
          <span
            aria-hidden="true"
            className="hero-shimmer-once pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          />
        ) : null}

        <div className="relative z-[1] flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5] text-white shadow-sm">
            <Sparkles size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[#1F2125]">
              This week&apos;s top 3 priorities
            </h2>
            <p className="font-mono text-[11px] text-[#4B5058]">
              From {totalSignals} signal{totalSignals === 1 ? "" : "s"} · updated{" "}
              {lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : "just now"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-9">
          {priorities.length === 0 ? (
            <EmptyState
              title="No priorities yet"
              description="No priorities yet. Run a crawl and analysis first."
              action={
                <Link
                  href={`/company/${companyId}/crawler`}
                  className="btn-motion focus-ring inline-flex h-9 items-center rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline"
                >
                  Open Crawler
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {priorities.slice(0, 3).map((sig, idx) => {
                const rank = (idx + 1) as 1 | 2 | 3;
                const evId = sig.evidenceIds[0] ?? sig.itemIds[0];
                return (
                  <PriorityCard
                    key={sig.id}
                    rank={rank}
                    signal={sig}
                    evidenceItem={evId ? evidenceById[evId] : null}
                    onOpenSignal={onOpenSignal}
                    onOpenEvidence={onOpenEvidence}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="xl:col-span-3">
          <BriefStatusBlock companyId={companyId} brief={brief} />
        </div>
      </div>
    </GlassCard>
  );
}
