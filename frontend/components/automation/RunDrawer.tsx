"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  RotateCw,
  SkipForward,
  X,
  XCircle,
} from "lucide-react";

import { LiveLogTerminal } from "@/components/crawler/LiveLogTerminal";
import { StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import {
  getAutomationRun,
  getAutomationRunLogs,
  streamAutomationRunLogs,
} from "@/lib/api";
import { formatDurationMs } from "@/lib/company-adapter";
import { sidePanelSlide } from "@/lib/motion";
import type { AutomationRun, CrawlLogLine } from "@/lib/types";
import { formatDateTimeInZone } from "./jobMeta";

function toneForRun(status: AutomationRun["status"]) {
  switch (status) {
    case "success":
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Success" };
    case "failed":
      return { tone: "threat" as const, Icon: XCircle, label: "Failed" };
    case "skipped":
      return { tone: "warning" as const, Icon: SkipForward, label: "Skipped" };
    case "missed":
      return { tone: "threat" as const, Icon: AlertTriangle, label: "Missed" };
    default:
      return { tone: "info" as const, Icon: Clock, label: status === "queued" ? "Queued" : "Running" };
  }
}

export function RunDrawer({
  companyId,
  runId,
  timezone,
  showLocalTime,
  onClose,
  onRetryRun,
}: {
  companyId: number;
  runId: number | null;
  timezone: string;
  showLocalTime: boolean;
  onClose: () => void;
  onRetryRun: (runId: number) => Promise<AutomationRun>;
}) {
  const { reduced } = useMotionSafe();
  const [logs, setLogs] = useState<CrawlLogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [connection, setConnection] = useState<"idle" | "live" | "polling" | "paused">("idle");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["automation-run-detail", companyId, runId],
    queryFn: () => getAutomationRun(companyId, runId as number),
    enabled: Boolean(runId && runId > 0),
    refetchInterval: (q) => {
      const s = q.state.data?.run.status;
      return s === "running" || s === "queued" ? 2500 : false;
    },
  });

  const run = detailQuery.data?.run ?? null;
  const isActive = Boolean(run && (run.status === "queued" || run.status === "running"));

  const appendLogs = useCallback((incoming: CrawlLogLine[]) => {
    if (incoming.length === 0) return;
    setLogs((prev) => {
      const seen = new Set(prev.map((l) => l.id));
      const merged = [...prev];
      for (const ln of incoming) {
        if (!seen.has(ln.id)) {
          seen.add(ln.id);
          merged.push(ln);
        }
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    setLogs(detailQuery.data?.logs ?? []);
  }, [detailQuery.data?.logs]);

  useEffect(() => {
    if (!runId || !isActive || process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
      setConnection(paused ? "paused" : "idle");
      return;
    }
    if (paused) {
      setConnection("paused");
      return;
    }

    let closed = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (closed || pollTimer) return;
      setConnection("polling");
      pollTimer = setInterval(() => {
        void getAutomationRunLogs(companyId, runId)
          .then((res) => {
            if (!closed) appendLogs(res.items);
          })
          .catch(() => undefined);
      }, 2500);
    };

    try {
      setConnection("live");
      es = streamAutomationRunLogs(companyId, runId);
      es.addEventListener("log", (evt: MessageEvent) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(String(evt.data)) as CrawlLogLine;
          appendLogs([parsed]);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("done", () => {
        if (closed) return;
        es?.close();
        setConnection("idle");
        void detailQuery.refetch();
      });
      es.onerror = () => {
        if (closed) return;
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [appendLogs, companyId, detailQuery, isActive, paused, runId]);

  useEffect(() => {
    if (!runId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, runId]);

  if (!runId) return null;

  const badge = run ? toneForRun(run.status) : null;
  const BadgeIcon = badge?.Icon ?? Clock;

  const copyVal = async (key: string, val: string) => {
    await navigator.clipboard?.writeText(val).catch(() => undefined);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1400);
  };

  const handleRetry = async () => {
    if (!run) return;
    setRetrying(true);
    try {
      await onRetryRun(run.id);
      onClose();
    } finally {
      setRetrying(false);
    }
  };

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
          aria-label={`Run #${runId} details`}
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[520px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1F2125]">
                  {run ? run.jobName : `Run #${runId}`}
                </h2>
                {badge ? (
                  <StatusPill tone={badge.tone} icon={<BadgeIcon size={11} />}>
                    {badge.label}
                  </StatusPill>
                ) : null}
                {run?.lateByMs && run.lateByMs > 60_000 ? (
                  <span className="rounded bg-[#EA580C]/12 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#C2410C]">
                    Late by {Math.round(run.lateByMs / 1000)}s
                  </span>
                ) : null}
              </div>

              {run ? (
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-[#4B5058]">
                  <span>Trigger: {run.trigger}</span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => void copyVal("run", String(run.id))}
                    className="inline-flex items-center gap-1 hover:text-[#1F2125]"
                  >
                    Run #{run.id}
                    {copiedKey === "run" ? <Check size={10} className="text-[#059669]" /> : <Copy size={10} />}
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => void copyVal("job", run.schedulerJobId)}
                    className="inline-flex items-center gap-1 hover:text-[#1F2125]"
                  >
                    {run.schedulerJobId}
                    {copiedKey === "job" ? <Check size={10} className="text-[#059669]" /> : <Copy size={10} />}
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close run drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
            {run ? (
              <>
                <dl className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-white/85 bg-white/70 p-2.5">
                    <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Scheduled</dt>
                    <dd className="mt-0.5 font-mono text-[11px] text-[#1F2125]">
                      {formatDateTimeInZone(run.scheduledFor, timezone, showLocalTime)}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-white/85 bg-white/70 p-2.5">
                    <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Duration</dt>
                    <dd className="tabular mt-0.5 font-mono text-[11px] text-[#1F2125]">
                      {formatDurationMs(run.durationMs)}
                    </dd>
                  </div>
                </dl>

                {/* Summary counts */}
                {run.output ? (
                  <section className="space-y-2 rounded-2xl border border-white/85 bg-white/75 p-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                        Output summary
                      </h3>
                      <Link
                        href={
                          run.output.type === "brief"
                            ? `/company/${companyId}/brief`
                            : run.output.type === "crawl_run"
                              ? `/company/${companyId}/crawler`
                              : run.output.type === "audit"
                                ? `/company/${companyId}/signal-stack`
                                : `/company/${companyId}/signals`
                        }
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
                      >
                        {run.output.type === "brief"
                          ? "Open brief"
                          : run.output.type === "audit"
                            ? "Review in Signal Stack"
                            : "Open details"}{" "}
                        <ExternalLink size={11} />
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(run.output.counts ?? {}).map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded-xl border border-white/80 bg-white px-3 py-1.5"
                        >
                          <span className="tabular font-mono text-sm font-semibold text-[#1F2125]">
                            {v}
                          </span>{" "}
                          <span className="text-[11px] capitalize text-[#4B5058]">{k}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Steps timeline */}
                {run.steps && run.steps.length > 0 ? (
                  <section className="space-y-2">
                    <h3 className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                      Execution steps
                    </h3>
                    <ol className="space-y-1.5">
                      {run.steps.map((step, i) => (
                        <li
                          key={`${step.label}-${i}`}
                          className="flex items-center justify-between rounded-xl border border-white/85 bg-white/70 px-3 py-2"
                        >
                          <span className="font-medium text-[#1F2125]">{step.label}</span>
                          <span className="tabular font-mono text-[11px] text-[#4B5058]">
                            {formatDurationMs(step.durationMs)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {/* Error block */}
                {run.error ? (
                  <div className="rounded-2xl border border-[#DC2626]/30 bg-[#DC2626]/8 p-3.5 text-[#991B1B]">
                    <p className="font-semibold">Failure details</p>
                    <p className="mt-1 font-mono text-[11px] break-words">{run.error}</p>
                  </div>
                ) : null}

                {/* Logs */}
                <LiveLogTerminal
                  lines={logs}
                  connection={connection}
                  paused={paused}
                  compact
                  onTogglePaused={() => setPaused((p) => !p)}
                  onClearView={() => setLogs([])}
                />
              </>
            ) : (
              <p className="text-[#9AA0AA]">Loading run details…</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-[#1F2125]/8 px-5 py-3.5">
            {run?.status === "failed" ? (
              <button
                type="button"
                disabled={retrying}
                onClick={() => void handleRetry()}
                className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white disabled:opacity-50"
              >
                <RotateCw size={13} /> {retrying ? "Retrying…" : "Retry run"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="focus-ring h-9 rounded-xl border border-white/85 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
