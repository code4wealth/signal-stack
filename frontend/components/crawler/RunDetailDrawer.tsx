"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  RotateCw,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";

import { getRun } from "@/lib/api";
import { formatDurationMs, formatShortDate } from "@/lib/company-adapter";
import { sidePanelSlide } from "@/lib/motion";
import { useRunLogs } from "@/hooks/useRunLogs";
import type { CrawlRun, SourceCrawlResult } from "@/lib/types";
import { StatusPill } from "@/components/ui-shared";
import { LiveLogTerminal } from "@/components/crawler/LiveLogTerminal";

function runTone(status: CrawlRun["status"]) {
  switch (status) {
    case "completed":
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Completed" };
    case "partial":
      return { tone: "warning" as const, Icon: AlertTriangle, label: "Partial" };
    case "failed":
      return { tone: "threat" as const, Icon: XCircle, label: "Failed" };
    case "cancelled":
      return { tone: "neutral" as const, Icon: CircleSlash, label: "Cancelled" };
    default:
      return { tone: "info" as const, Icon: Clock, label: "Running" };
  }
}

export function RunDetailDrawer({
  companyId,
  runId,
  onClose,
  onRerunFailed,
}: {
  companyId: number;
  runId: number | null;
  onClose: () => void;
  onRerunFailed: (sourceIds: number[]) => Promise<void>;
}) {
  const reduced = Boolean(useReducedMotion());
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [expandedErr, setExpandedErr] = useState<number | null>(null);
  const [rerunning, setRerunning] = useState(false);

  useEffect(() => {
    setSelectedDomain(null);
    setExpandedErr(null);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, runId]);

  const runQuery = useQuery({
    queryKey: ["crawler-run-detail", companyId, runId],
    queryFn: () => getRun(companyId, runId as number),
    enabled: Boolean(runId && runId > 0 && process.env.NEXT_PUBLIC_USE_MOCKS !== "true"),
  });

  const run = runQuery.data?.run ?? null;
  const results: SourceCrawlResult[] = runQuery.data?.results ?? run?.perSource ?? [];
  const isActive = Boolean(run && (run.status === "queued" || run.status === "running"));

  const runLogs = useRunLogs(companyId, runId, isActive);

  if (!runId) return null;

  const failedIds = results
    .filter((r) => r.status === "failed")
    .map((r) => r.sourceId);

  const badge = run ? runTone(run.status) : null;
  const BadgeIcon = badge?.Icon ?? Clock;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.aside
          variants={sidePanelSlide(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label={`Crawl run #${runId} details`}
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[480px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1F2125]">
                  {run?.trigger === "scheduled" ? "Scheduled crawl" : "Manual crawl"} #{runId}
                </h2>
                {badge ? (
                  <StatusPill tone={badge.tone} icon={<BadgeIcon size={11} />}>
                    {badge.label}
                  </StatusPill>
                ) : null}
              </div>
              {run ? (
                <p className="font-mono text-[11px] text-[#9AA0AA]">
                  {formatShortDate(run.startedAt)} · {formatDurationMs(run.durationMs)}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close run detail drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
            {run ? (
              <>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {[
                    { label: "Checked", value: run.sourcesDone },
                    { label: "New", value: run.counts.new },
                    { label: "Changed", value: run.counts.changed },
                    { label: "Failed", value: run.counts.failed },
                    { label: "Blocked", value: run.counts.blocked },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-white/80 bg-white/75 px-2 py-2"
                    >
                      <p className="tabular font-mono text-sm font-semibold text-[#1F2125]">
                        {s.value}
                      </p>
                      <p className="text-[10px] text-[#9AA0AA]">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Per-source results */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                      Per-source results
                    </h3>
                    {selectedDomain ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDomain(null)}
                        className="text-[11px] font-medium text-[#4F46E5] hover:underline"
                      >
                        Clear filter ({selectedDomain})
                      </button>
                    ) : null}
                  </div>

                  {results.length === 0 ? (
                    <p className="text-[#9AA0AA]">No source breakdown recorded for this run.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border border-white/80 bg-white/75">
                      <table className="w-full text-left text-[11px]">
                        <thead className="border-b border-[#1F2125]/8 font-mono text-[10px] uppercase text-[#9AA0AA]">
                          <tr>
                            <th className="px-3 py-2">Source</th>
                            <th className="px-2 py-2">Status</th>
                            <th className="px-2 py-2">HTTP</th>
                            <th className="px-2 py-2">Items</th>
                            <th className="px-2 py-2 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1F2125]/6">
                          {results.map((r) => {
                            const selected = selectedDomain === r.domain;
                            return (
                              <tr
                                key={r.sourceId}
                                onClick={() =>
                                  setSelectedDomain((prev) => (prev === r.domain ? null : r.domain))
                                }
                                className={`cursor-pointer transition-colors hover:bg-[#EEF2FF]/60 ${
                                  selected ? "bg-[#EEF2FF]" : ""
                                }`}
                              >
                                <td className="px-3 py-2">
                                  <p className="font-medium text-[#1F2125]">{r.sourceName}</p>
                                  <p className="font-mono text-[10px] text-[#9AA0AA]">{r.domain}</p>
                                  {r.error ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedErr((prev) =>
                                          prev === r.sourceId ? null : r.sourceId,
                                        );
                                      }}
                                      className="mt-1 block max-w-[200px] truncate text-left font-mono text-[10px] text-[#DC2626] hover:underline"
                                    >
                                      {expandedErr === r.sourceId ? r.error : `Error: ${r.error}`}
                                    </button>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2">
                                  <span className="inline-flex items-center gap-1 capitalize">
                                    {r.status === "blocked" ? (
                                      <ShieldAlert size={11} className="text-[#DC2626]" />
                                    ) : r.status === "failed" ? (
                                      <XCircle size={11} className="text-[#DC2626]" />
                                    ) : r.status === "success" ? (
                                      <CheckCircle2 size={11} className="text-[#059669]" />
                                    ) : null}
                                    {r.status.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="px-2 py-2 font-mono text-[#4B5058]">
                                  {r.httpStatus ?? "—"}
                                </td>
                                <td className="tabular px-2 py-2 font-mono text-[#1F2125]">
                                  {r.itemsNew}/{r.itemsChanged}
                                </td>
                                <td className="tabular px-2 py-2 text-right font-mono text-[#9AA0AA]">
                                  {formatDurationMs(r.durationMs)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Run logs */}
                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                    Logs for run #{runId}
                  </h3>
                  <LiveLogTerminal
                    lines={runLogs.lines}
                    connection={runLogs.connection}
                    paused={runLogs.paused}
                    onTogglePaused={runLogs.togglePaused}
                    onClearView={runLogs.clearView}
                    externalDomainFilter={selectedDomain}
                    compact
                  />
                </section>
              </>
            ) : (
              <p className="text-[#9AA0AA]">Loading run details…</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-[#1F2125]/8 bg-white/75 px-5 py-3.5">
            {failedIds.length > 0 ? (
              <button
                type="button"
                disabled={rerunning}
                onClick={async () => {
                  setRerunning(true);
                  try {
                    await onRerunFailed(failedIds);
                    onClose();
                  } finally {
                    setRerunning(false);
                  }
                }}
                className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-50"
              >
                <RotateCw size={13} className={rerunning ? "animate-spin" : ""} />
                Re-run failed sources ({failedIds.length})
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={onClose}
              className="focus-ring h-9 rounded-xl border border-[#1F2125]/12 bg-white px-4 text-xs font-medium text-[#1F2125]"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
