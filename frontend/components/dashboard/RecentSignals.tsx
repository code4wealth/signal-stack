"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Globe, Swords, Users } from "lucide-react";

import {
  ClassificationPill,
  EmptyState,
  GlassCard,
  PriorityDots,
} from "@/components/ui-shared";
import { formatRelativeTime } from "@/lib/company-adapter";
import type { SignalItem, SourceCategory } from "@/lib/types";

const CAT_ICON: Record<SourceCategory, { Icon: typeof Users; cls: string }> = {
  customers: { Icon: Users, cls: "bg-[#0D9488]/10 text-[#0D9488]" },
  competitors: { Icon: Swords, cls: "bg-[#EA580C]/10 text-[#EA580C]" },
  market: { Icon: Globe, cls: "bg-[#2563EB]/10 text-[#2563EB]" },
  internal: { Icon: FileSpreadsheet, cls: "bg-[#7C3AED]/10 text-[#7C3AED]" },
};

export function RecentSignals({
  companyId,
  signals,
  onOpenSignal,
}: {
  companyId: number;
  signals: SignalItem[];
  onOpenSignal: (signalId: number) => void;
}) {
  const seenIdsRef = useRef<Set<number>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (seenIdsRef.current.size === 0) {
      for (const s of signals) seenIdsRef.current.add(s.id);
      return;
    }
    const newlyArrived = signals
      .filter((s) => !seenIdsRef.current.has(s.id))
      .map((s) => s.id);
    if (newlyArrived.length > 0) {
      for (const id of newlyArrived) seenIdsRef.current.add(id);
      setFreshIds(new Set(newlyArrived));
      const timer = window.setTimeout(() => setFreshIds(new Set()), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [signals]);

  return (
    <GlassCard spotlight className="flex h-full flex-col justify-between gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">Recent signals</h2>
          <p className="text-[11px] text-[#4B5058]">Latest 5 analysed items</p>
        </div>
        <Link
          href={`/company/${companyId}/signals`}
          className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
        >
          View all →
        </Link>
      </div>

      {signals.length === 0 ? (
        <EmptyState
          title="No recent signals"
          description="Signals appear here once crawled evidence is analysed."
        />
      ) : (
        <div className="divide-y divide-[#1F2125]/8">
          {signals.slice(0, 5).map((sig) => {
            const cat = CAT_ICON[sig.category] ?? CAT_ICON.market;
            const Icon = cat.Icon;
            const domain = sig.sourceDomains[0] ?? sig.sourceName ?? "Source";
            const isFresh = freshIds.has(sig.id);

            return (
              <button
                key={sig.id}
                type="button"
                onClick={() => onOpenSignal(sig.id)}
                className={`focus-ring flex w-full items-center justify-between gap-2.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/80 ${
                  isFresh ? "signal-row-fresh" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${cat.cls}`}
                    aria-hidden="true"
                  >
                    <Icon size={14} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {sig.status === "new" ? (
                        <span className="shrink-0 rounded bg-[#4F46E5]/12 px-1 py-0.5 font-mono text-[9.5px] font-semibold text-[#4F46E5]">
                          NEW
                        </span>
                      ) : null}
                      <p className="truncate text-xs font-medium text-[#1F2125]">
                        {sig.headline}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-[#9AA0AA]">
                      {domain} · {formatRelativeTime(sig.detectedAt || sig.publishedAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <ClassificationPill classification={sig.classification} compact />
                  <PriorityDots priority={sig.priority} compact showWord={false} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
