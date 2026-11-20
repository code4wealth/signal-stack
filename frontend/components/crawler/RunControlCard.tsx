"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { formatDurationMs, formatRelativeTime } from "@/lib/company-adapter";
import type { CrawlerOverview, SignalStackSource, SourceCategory } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";
import { QuickRecheckRow } from "@/components/crawler/QuickRecheckRow";

function formatElapsed(startedAt: string): string {
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) return "0s";
  const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function RunControlCard({
  companyId,
  overview,
  approvedSources,
  isStarting,
  isCancelling,
  startError,
  recheckingIds,
  onRunNow,
  onRunSelected,
  onCancelRun,
  onRecheckSource,
  onRetryStart,
}: {
  companyId: number;
  overview: CrawlerOverview;
  approvedSources: SignalStackSource[];
  isStarting: boolean;
  isCancelling: boolean;
  startError: string | null;
  recheckingIds: Set<number>;
  onRunNow: () => void;
  onRunSelected: (sourceIds: number[]) => void;
  onCancelRun: (runId: number) => void;
  onRecheckSource: (sourceId: number) => void;
  onRetryStart: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const activeRun = overview.activeRun ?? null;
  const lastRun = overview.lastRun ?? null;
  const isRunning = Boolean(activeRun) || isStarting;

  const [elapsed, setElapsed] = useState("0s");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!activeRun?.startedAt) return;
    setElapsed(formatElapsed(activeRun.startedAt));
    const timer = setInterval(() => {
      setElapsed(formatElapsed(activeRun.startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRun?.startedAt]);

  useEffect(() => {
    setConfirmCancel(false);
  }, [activeRun?.id]);

  const statusPill = (() => {
    if (activeRun) {
      return (
        <StatusPill
          tone="info"
          icon={
            <span
              className={`h-2 w-2 rounded-full bg-[#4F46E5] ${reduced ? "" : "animate-pulse"}`}
            />
          }
        >
          Running
        </StatusPill>
      );
    }
    switch (lastRun?.status) {
      case "completed":
        return (
          <StatusPill tone="verified" icon={<CheckCircle2 size={12} />}>
            Completed
          </StatusPill>
        );
      case "partial":
        return (
          <StatusPill tone="warning" icon={<AlertTriangle size={12} />}>
            Partial
          </StatusPill>
        );
      case "failed":
        return (
          <StatusPill tone="threat" icon={<XCircle size={12} />}>
            Failed
          </StatusPill>
        );
      case "cancelled":
        return (
          <StatusPill tone="neutral" icon={<CircleSlash size={12} />}>
            Cancelled
          </StatusPill>
        );
      default:
        return (
          <StatusPill tone="neutral" icon={<Clock size={12} />}>
            Idle
          </StatusPill>
        );
    }
  })();

  const progressPct =
    activeRun && activeRun.sourcesTotal > 0
      ? Math.min(100, Math.round((activeRun.sourcesDone / activeRun.sourcesTotal) * 100))
      : 0;

  const groupedApproved: Record<SourceCategory, SignalStackSource[]> = {
    customers: approvedSources.filter((s) => s.category === "customers"),
    competitors: approvedSources.filter((s) => s.category === "competitors"),
    market: approvedSources.filter((s) => s.category === "market"),
    internal: [],
  };

  function toggleSource(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <GlassCard className="relative space-y-4 bg-gradient-to-br from-[#EEF2FF]/90 via-white/80 to-[#EFF6FF]/90 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#1F2125]">Crawl status</span>
          {overview.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>
        {statusPill}
      </div>

      {activeRun ? (
        <div className="space-y-2.5 rounded-2xl border border-[#4F46E5]/20 bg-white/75 p-3.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-[#1F2125]">
              Crawled <span className="tabular font-semibold">{activeRun.sourcesDone}</span> of{" "}
              <span className="tabular font-semibold">{activeRun.sourcesTotal}</span> sources
            </span>
            <span className="tabular font-mono text-[11px] text-[#4B5058]">{elapsed}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF2FF]">
            <div
              className="h-full rounded-full bg-[#4F46E5] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-[#4B5058]">
              {activeRun.currentSourceDomain
                ? `Fetching ${activeRun.currentSourceDomain}`
                : "Preparing crawl queue…"}
            </span>
            {activeRun.id > 0 ? (
              confirmCancel ? (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => {
                      setConfirmCancel(false);
                      onCancelRun(activeRun.id);
                    }}
                    className="font-semibold text-[#DC2626] hover:underline"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="text-[#9AA0AA] hover:text-[#1F2125]"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="focus-ring rounded-lg px-2 py-0.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#DC2626]"
                >
                  Cancel run
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#4B5058]">
          {lastRun ? (
            <>
              Last run{" "}
              <span className="font-mono text-[#1F2125]">
                {formatRelativeTime(lastRun.startedAt)}
              </span>{" "}
              · <span className="font-mono">{formatDurationMs(lastRun.durationMs)}</span> ·{" "}
              <span className="capitalize">{lastRun.status}</span>
            </>
          ) : (
            "No completed crawl runs yet."
          )}
        </p>
      )}

      <p className="truncate font-mono text-[10.5px] text-[#9AA0AA]" title={overview.etiquette.userAgent}>
        {overview.etiquette.respectsRobots ? "Respecting robots.txt" : "Robots ignored"} ·{" "}
        {overview.etiquette.delaySeconds}s between requests · {overview.etiquette.userAgent}
      </p>

      {startError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#B91C1C]"
        >
          <span className="truncate">{startError}</span>
          <button
            type="button"
            onClick={onRetryStart}
            className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      ) : null}

      <div className="relative flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isRunning}
          onClick={onRunNow}
          className="btn-motion focus-ring inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-60"
        >
          {isRunning ? (
            <>
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              Run in progress
            </>
          ) : (
            <>
              <Play size={13} strokeWidth={2} aria-hidden="true" />
              Run crawl now
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isRunning || approvedSources.length === 0}
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
          className="focus-ring inline-flex h-9 items-center gap-1 rounded-xl border border-white/80 bg-white/80 px-3 text-xs font-medium text-[#1F2125] hover:bg-white disabled:opacity-50"
        >
          Choose sources
          <ChevronDown size={12} />
        </button>

        {pickerOpen ? (
          <div className="glass-strong absolute left-0 right-0 top-full z-30 mt-2 space-y-3 rounded-2xl p-4 shadow-xl">
            <p className="text-xs font-semibold text-[#1F2125]">Select approved sources to crawl</p>
            <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1 text-xs">
              {(["customers", "competitors", "market"] as const).map((cat) => {
                const list = groupedApproved[cat];
                if (list.length === 0) return null;
                return (
                  <div key={cat} className="space-y-1">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
                      {cat}
                    </p>
                    {list.map((src) => (
                      <label
                        key={src.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/75"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(src.id)}
                          onChange={() => toggleSource(src.id)}
                          className="accent-[#4F46E5]"
                        />
                        <span className="truncate font-medium text-[#1F2125]">{src.name}</span>
                        <span className="truncate font-mono text-[10px] text-[#9AA0AA]">
                          {src.domain}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#1F2125]/8 pt-2">
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-lg px-2.5 py-1 text-xs text-[#4B5058] hover:text-[#1F2125]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  setPickerOpen(false);
                  onRunSelected(ids);
                }}
                className="rounded-xl bg-[#1C1D21] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Run selected ({selectedIds.size})
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <QuickRecheckRow
        companyId={companyId}
        items={overview.quickRecheck}
        recheckingIds={recheckingIds}
        onRecheck={onRecheckSource}
      />
    </GlassCard>
  );
}
