"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import type { CrawlRun, SourceCrawlResultStatus } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";

const SEGMENTS: {
  key: SourceCrawlResultStatus;
  label: string;
  barClass: string;
  hatched?: boolean;
  Icon: typeof CheckCircle2;
  iconColor: string;
}[] = [
  {
    key: "success",
    label: "Success",
    barClass: "bg-[#059669]",
    Icon: CheckCircle2,
    iconColor: "text-[#059669]",
  },
  {
    key: "not_modified",
    label: "Not modified",
    barClass: "bg-[#64748B]",
    Icon: Clock,
    iconColor: "text-[#64748B]",
  },
  {
    key: "partial",
    label: "Partial",
    barClass: "bg-[#EA580C]",
    Icon: AlertTriangle,
    iconColor: "text-[#EA580C]",
  },
  {
    key: "failed",
    label: "Failed",
    barClass: "bg-[#DC2626]",
    Icon: XCircle,
    iconColor: "text-[#DC2626]",
  },
  {
    key: "blocked",
    label: "Blocked by robots.txt",
    barClass: "border border-[#DC2626] bg-[#DC2626]/15",
    hatched: true,
    Icon: ShieldAlert,
    iconColor: "text-[#DC2626]",
  },
];

export function ResultBreakdown({
  recentRuns,
  isMock,
  onSelectOutcome,
}: {
  recentRuns: CrawlRun[];
  isMock?: boolean;
  onSelectOutcome?: (status: SourceCrawlResultStatus) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const finishedRuns = recentRuns.filter((r) => r.status !== "queued" && r.status !== "running");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(
    finishedRuns[0]?.id ?? null,
  );
  const [hoveredKey, setHoveredKey] = useState<SourceCrawlResultStatus | null>(null);

  const activeRun =
    finishedRuns.find((r) => r.id === selectedRunId) ?? finishedRuns[0] ?? null;

  const counts: Record<SourceCrawlResultStatus, number> = {
    success: 0,
    not_modified: 0,
    partial: 0,
    failed: 0,
    blocked: 0,
  };

  if (activeRun?.perSource && activeRun.perSource.length > 0) {
    for (const r of activeRun.perSource) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
  } else if (activeRun) {
    counts.not_modified = activeRun.counts.unchanged;
    counts.failed = activeRun.counts.failed;
    counts.blocked = activeRun.counts.blocked;
    counts.success = Math.max(
      0,
      activeRun.sourcesDone - counts.failed - counts.blocked,
    );
  }

  const totalChecked = Object.values(counts).reduce((s, v) => s + v, 0);

  return (
    <GlassCard className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#1F2125]">Result breakdown</h2>
            {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
          </div>
          <p className="mt-0.5 text-xs text-[#4B5058]">Sources by outcome, last run</p>
        </div>

        {finishedRuns.length > 0 ? (
          <select
            aria-label="Select run for result breakdown"
            value={activeRun?.id ?? ""}
            onChange={(e) => setSelectedRunId(Number(e.target.value))}
            className="focus-ring h-8 rounded-xl border border-white/80 bg-white/80 px-2.5 font-mono text-[11px] text-[#1F2125] outline-none"
          >
            {finishedRuns.map((run) => (
              <option key={run.id} value={run.id}>
                Run #{run.id} · {formatShortDate(run.startedAt)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
            {totalChecked}
          </span>
          <span className="text-xs text-[#9AA0AA]">
            source{totalChecked === 1 ? "" : "s"} checked
          </span>
        </div>

        {/* Segmented horizontal bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/75 p-0.5">
          {totalChecked === 0 ? (
            <div className="h-full w-full rounded-full bg-[#1F2125]/8" />
          ) : (
            SEGMENTS.map((seg) => {
              const count = counts[seg.key];
              if (count <= 0) return null;
              const pct = (count / totalChecked) * 100;
              const dimmed = hoveredKey !== null && hoveredKey !== seg.key;
              return (
                <div
                  key={seg.key}
                  style={{
                    width: `${pct}%`,
                    transition: reduced ? "none" : "opacity 150ms ease, width 400ms ease",
                    opacity: dimmed ? 0.35 : 1,
                    backgroundImage: seg.hatched
                      ? "repeating-linear-gradient(-45deg, rgba(220,38,38,0.28) 0px, rgba(220,38,38,0.28) 4px, transparent 4px, transparent 8px)"
                      : undefined,
                  }}
                  className={`h-full first:rounded-l-full last:rounded-r-full ${seg.barClass}`}
                  title={`${seg.label}: ${count}`}
                />
              );
            })
          )}
        </div>
      </div>

      <ul className="space-y-1.5 text-xs">
        {SEGMENTS.map((seg) => {
          const count = counts[seg.key];
          const pct = totalChecked > 0 ? Math.round((count / totalChecked) * 100) : 0;
          const Icon = seg.Icon;
          return (
            <li key={seg.key}>
              <button
                type="button"
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectOutcome?.(seg.key)}
                className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-white/75"
              >
                <span className="flex items-center gap-2 text-[#4B5058]">
                  <Icon size={13} className={seg.iconColor} aria-hidden="true" />
                  <span>{seg.label}</span>
                </span>
                <span className="tabular font-mono text-[11px] text-[#1F2125]">
                  {count} <span className="text-[#9AA0AA]">({pct}%)</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
