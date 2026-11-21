"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  Play,
  XCircle,
} from "lucide-react";

import { listRuns } from "@/lib/api";
import { formatDurationMs, formatRelativeTime } from "@/lib/company-adapter";
import { fadeUp } from "@/lib/motion";
import type { CrawlRange, CrawlRun, CrawlRunStatus } from "@/lib/types";
import { EmptyState, GlassCard, StatusPill } from "@/components/ui-shared";

function runBadge(status: CrawlRunStatus) {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        tile: "bg-[#059669]/12 text-[#059669]",
        text: "text-[#059669]",
        Icon: CheckCircle2,
      };
    case "partial":
      return {
        label: "Partial",
        tile: "bg-[#EA580C]/12 text-[#EA580C]",
        text: "text-[#C2410C]",
        Icon: AlertTriangle,
      };
    case "failed":
      return {
        label: "Failed",
        tile: "bg-[#DC2626]/12 text-[#DC2626]",
        text: "text-[#DC2626]",
        Icon: XCircle,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        tile: "bg-[#64748B]/12 text-[#64748B]",
        text: "text-[#64748B]",
        Icon: CircleSlash,
      };
    default:
      return {
        label: "Running",
        tile: "bg-[#4F46E5]/12 text-[#4F46E5]",
        text: "text-[#4F46E5]",
        Icon: Clock,
      };
  }
}

export function RunHistoryList({
  companyId,
  initialRuns,
  range,
  highlightRunId,
  isMock,
  onSelectRun,
}: {
  companyId: number;
  initialRuns: CrawlRun[];
  range: CrawlRange;
  highlightRunId?: number | null;
  isMock?: boolean;
  onSelectRun: (runId: number) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [extraRuns, setExtraRuns] = useState<CrawlRun[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const runs = [...initialRuns, ...extraRuns.filter((e) => !initialRuns.some((i) => i.id === e.id))];

  async function handleLoadMore() {
    const last = runs[runs.length - 1];
    if (loadingMore || !last) return;
    const next = cursor ?? String(last.id);
    setLoadingMore(true);
    try {
      const res = await listRuns(companyId, next, range);
      setExtraRuns((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div id="runs">
      <GlassCard className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[#1F2125]">Run history</h2>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 font-mono text-[11px] text-[#4B5058]">
          {range}
        </span>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          description="Run your first crawl to inspect per-run source outcomes and logs."
        />
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => {
            const meta = runBadge(run.status);
            const StatusIcon = meta.Icon;
            const isHighlighted = highlightRunId === run.id;

            return (
              <motion.li
                key={run.id}
                variants={fadeUp(reduced)}
                initial="hidden"
                animate="visible"
              >
                <button
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  className={`focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors hover:bg-white ${
                    isHighlighted
                      ? "border-[#4F46E5]/35 bg-[#EEF2FF]/80"
                      : "border-white/75 bg-white/60"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tile}`}
                      aria-hidden="true"
                    >
                      <Play size={14} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#1F2125]">
                        {run.trigger === "scheduled" ? "Scheduled run" : "Manual run"}
                      </p>
                      <p className="truncate font-mono text-[11px] text-[#9AA0AA]">
                        {formatRelativeTime(run.startedAt)} · {formatDurationMs(run.durationMs)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tabular font-mono text-[11px] font-semibold text-[#1F2125]">
                      {run.counts.new} new · {run.counts.changed} chg
                    </p>
                    <p className={`inline-flex items-center gap-1 text-[11px] font-medium ${meta.text}`}>
                      <StatusIcon size={11} aria-hidden="true" />
                      {meta.label}
                    </p>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      {runs.length >= 10 && cursor !== "" ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void handleLoadMore()}
          className="focus-ring inline-flex h-8 w-full items-center justify-center rounded-xl border border-white/80 bg-white/75 text-xs font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
      </GlassCard>
    </div>
  );
}
