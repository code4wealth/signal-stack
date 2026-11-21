"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Play,
  RotateCw,
  Search,
  SkipForward,
  Terminal,
  User,
  XCircle,
} from "lucide-react";

import { GlassCard, SkeletonBlock, StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { exportRunsCsvUrl } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import type { AutomationRun, AutomationRunsFilters, Schedule } from "@/lib/types";
import { formatDateTimeInZone, JOB_META } from "./jobMeta";

type SortCol = "scheduledFor" | "durationMs" | "status" | "jobName";

function runStatusBadge(status: AutomationRun["status"]) {
  switch (status) {
    case "success":
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Success" };
    case "failed":
      return { tone: "threat" as const, Icon: XCircle, label: "Failed" };
    case "running":
    case "queued":
      return { tone: "info" as const, Icon: Clock, label: status === "queued" ? "Queued" : "Running" };
    case "skipped":
      return { tone: "warning" as const, Icon: SkipForward, label: "Skipped" };
    default:
      return { tone: "threat" as const, Icon: AlertTriangle, label: "Missed" };
  }
}

function triggerLabel(trigger: AutomationRun["trigger"]) {
  switch (trigger) {
    case "manual":
      return { label: "Manual", Icon: User };
    case "retry":
      return { label: "Retry", Icon: RotateCw };
    default:
      return { label: "Scheduled", Icon: Clock };
  }
}

export function RunHistoryTable({
  companyId,
  runs,
  total,
  schedules,
  filters,
  hasMore,
  isLoading,
  loadingMore,
  freshIds,
  timezone,
  showLocalTime,
  isMock,
  onChangeFilters,
  onLoadMore,
  onSelectRun,
  onRetryRun,
  onRunCrawlNow,
}: {
  companyId: number;
  runs: AutomationRun[];
  total: number;
  schedules: Schedule[];
  filters: AutomationRunsFilters;
  hasMore: boolean;
  isLoading: boolean;
  loadingMore: boolean;
  freshIds: Set<number>;
  timezone: string;
  showLocalTime: boolean;
  isMock?: boolean;
  onChangeFilters: (next: AutomationRunsFilters) => void;
  onLoadMore: () => void;
  onSelectRun: (runId: number) => void;
  onRetryRun: (runId: number) => Promise<unknown>;
  onRunCrawlNow: () => Promise<unknown>;
}) {
  const { reduced } = useMotionSafe();
  const [sortCol, setSortCol] = useState<SortCol>("scheduledFor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const sortedRuns = useMemo(() => {
    const copy = [...runs];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "scheduledFor") {
        cmp = Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor);
      } else if (sortCol === "durationMs") {
        cmp = (a.durationMs ?? -1) - (b.durationMs ?? -1);
      } else if (sortCol === "status") {
        cmp = a.status.localeCompare(b.status);
      } else {
        cmp = a.jobName.localeCompare(b.jobName);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [runs, sortCol, sortDir]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const copyId = async (id: number) => {
    await navigator.clipboard?.writeText(String(id)).catch(() => undefined);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1400);
  };

  const renderOutputLink = (run: AutomationRun) => {
    if (!run.output) {
      return <span className="text-[#9AA0AA]">{run.skippedReason || "—"}</span>;
    }
    const base = `/company/${companyId}`;
    const counts = run.output.counts ?? {};
    if (run.output.type === "brief") {
      return (
        <Link
          href={`${base}/briefs`}
          onClick={(e) => e.stopPropagation()}
          className="focus-ring inline-flex items-center gap-1 font-medium text-[#4F46E5] no-underline hover:underline"
        >
          Brief <ExternalLink size={11} />
        </Link>
      );
    }
    if (run.output.type === "crawl_run") {
      return (
        <Link
          href={`${base}/crawler`}
          onClick={(e) => e.stopPropagation()}
          className="focus-ring inline-flex items-center gap-1 font-medium text-[#4F46E5] no-underline hover:underline"
        >
          Crawl run ({counts.new ?? 0} new) <ExternalLink size={11} />
        </Link>
      );
    }
    if (run.output.type === "audit") {
      return (
        <Link
          href={`${base}/signal-stack`}
          onClick={(e) => e.stopPropagation()}
          className="focus-ring inline-flex items-center gap-1 font-medium text-[#4F46E5] no-underline hover:underline"
        >
          Audit ({counts.failing ?? 0} failing) <ExternalLink size={11} />
        </Link>
      );
    }
    return (
      <Link
        href={`${base}/signals`}
        onClick={(e) => e.stopPropagation()}
        className="focus-ring inline-flex items-center gap-1 font-medium text-[#4F46E5] no-underline hover:underline"
      >
        {counts.signals ?? 0} signals <ExternalLink size={11} />
      </Link>
    );
  };

  const exportHref = exportRunsCsvUrl(companyId, filters);

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
    >
      <GlassCard className="p-5">
        {/* Header + Export */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-[#1F2125]">Run history</h2>
            <span className="tabular rounded-full bg-white/85 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#1F2125] shadow-sm">
              {total}
            </span>
            {isMock ? (
              <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#C2410C]">
                MOCK DATA
              </span>
            ) : null}
          </div>

          <a
            href={exportHref}
            download
            className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-3 text-xs font-medium text-[#1F2125] no-underline shadow-sm hover:bg-white"
          >
            <Download size={13} aria-hidden="true" />
            Export CSV
          </a>
        </div>

        {/* Filter bar */}
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <select
            aria-label="Filter by job"
            value={filters.job || "all"}
            onChange={(e) => onChangeFilters({ ...filters, job: e.target.value })}
            className="focus-ring h-9 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-[#1F2125] outline-none"
          >
            <option value="all">All jobs</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.jobType}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={filters.status || "all"}
            onChange={(e) => onChangeFilters({ ...filters, status: e.target.value })}
            className="focus-ring h-9 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-[#1F2125] outline-none"
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
            <option value="skipped">Skipped</option>
            <option value="missed">Missed</option>
          </select>

          <select
            aria-label="Filter by trigger"
            value={filters.trigger || "all"}
            onChange={(e) => onChangeFilters({ ...filters, trigger: e.target.value })}
            className="focus-ring h-9 rounded-xl border border-white/85 bg-white/75 px-3 text-xs text-[#1F2125] outline-none"
          >
            <option value="all">All triggers</option>
            <option value="scheduled">Scheduled</option>
            <option value="manual">Manual</option>
            <option value="retry">Retry</option>
          </select>

          <input
            type="date"
            aria-label="From date"
            value={filters.dateFrom || ""}
            onChange={(e) => onChangeFilters({ ...filters, dateFrom: e.target.value })}
            className="focus-ring h-9 rounded-xl border border-white/85 bg-white/75 px-3 font-mono text-xs text-[#1F2125] outline-none"
          />

          <input
            type="date"
            aria-label="To date"
            value={filters.dateTo || ""}
            onChange={(e) => onChangeFilters({ ...filters, dateTo: e.target.value })}
            className="focus-ring h-9 rounded-xl border border-white/85 bg-white/75 px-3 font-mono text-xs text-[#1F2125] outline-none"
          />

          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search run history"
              placeholder="Search runs…"
              value={filters.q || ""}
              onChange={(e) => onChangeFilters({ ...filters, q: e.target.value })}
              className="focus-ring h-9 w-full rounded-xl border border-white/85 bg-white/75 pl-8 pr-3 text-xs text-[#1F2125] placeholder:text-[#9AA0AA] outline-none"
            />
          </div>
        </div>

        {/* Table / Empty / Loading */}
        {isLoading && sortedRuns.length === 0 ? (
          <SkeletonBlock className="h-44" />
        ) : sortedRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#1F2125]/12 bg-white/45 px-4 py-10 text-center">
            <p className="max-w-md text-xs text-[#4B5058]">
              No runs yet. Scheduled jobs will appear here after their first execution.
            </p>
            <button
              type="button"
              onClick={() => void onRunCrawlNow()}
              className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-3.5 text-xs font-medium text-white"
            >
              <Play size={12} /> Run Source crawl now
            </button>
          </div>
        ) : (
          <>
            {/* Desktop dense table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#1F2125]/8 font-mono text-[10.5px] uppercase text-[#9AA0AA]">
                  <tr>
                    <th
                      className="py-2.5 pl-3 pr-2"
                      aria-sort={
                        sortCol === "jobName"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("jobName")}
                        className="focus-ring inline-flex items-center gap-1 uppercase hover:text-[#1F2125]"
                      >
                        Job <ArrowDownUp size={11} />
                      </button>
                    </th>
                    <th className="px-2 py-2.5">Trigger</th>
                    <th
                      className="px-2 py-2.5"
                      aria-sort={
                        sortCol === "scheduledFor"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("scheduledFor")}
                        className="focus-ring inline-flex items-center gap-1 uppercase hover:text-[#1F2125]"
                      >
                        Scheduled for <ArrowDownUp size={11} />
                      </button>
                    </th>
                    <th className="px-2 py-2.5">Started</th>
                    <th
                      className="px-2 py-2.5"
                      aria-sort={
                        sortCol === "durationMs"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("durationMs")}
                        className="focus-ring inline-flex items-center gap-1 uppercase hover:text-[#1F2125]"
                      >
                        Duration <ArrowDownUp size={11} />
                      </button>
                    </th>
                    <th
                      className="px-2 py-2.5"
                      aria-sort={
                        sortCol === "status"
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("status")}
                        className="focus-ring inline-flex items-center gap-1 uppercase hover:text-[#1F2125]"
                      >
                        Status <ArrowDownUp size={11} />
                      </button>
                    </th>
                    <th className="px-2 py-2.5">Output</th>
                    <th className="py-2.5 pl-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2125]/6">
                  {sortedRuns.map((run) => {
                    const meta = JOB_META[run.jobType];
                    const JobIcon = meta.Icon;
                    const trig = triggerLabel(run.trigger);
                    const TrigIcon = trig.Icon;
                    const badge = runStatusBadge(run.status);
                    const isExpanded = expandedId === run.id;
                    const isFresh = freshIds.has(run.id) && !reduced;
                    const isLate = (run.lateByMs ?? 0) > 60_000;

                    return (
                      <Fragment key={run.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : run.id)}
                          className={`group relative cursor-pointer transition-colors hover:bg-white/60 ${
                            isFresh ? "signal-row-fresh" : ""
                          }`}
                        >
                          <td className="relative py-2.5 pl-3 pr-2">
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1 left-0 top-1 w-0.5 origin-center scale-y-0 rounded-full bg-[#4F46E5] transition-transform duration-150 group-hover:scale-y-100"
                            />
                            <div className="flex items-center gap-2">
                              <JobIcon size={14} className="shrink-0 text-[#4F46E5]" />
                              <span className="font-medium text-[#1F2125]">{run.jobName}</span>
                              <ChevronDown
                                size={12}
                                className={`text-[#9AA0AA] transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-[#4B5058]">
                            <span className="inline-flex items-center gap-1">
                              <TrigIcon size={12} /> {trig.label}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[11px] text-[#4B5058]">
                            {formatDateTimeInZone(run.scheduledFor, timezone, showLocalTime)}
                          </td>
                          <td className="px-2 py-2.5 font-mono text-[11px] text-[#4B5058]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>
                                {run.startedAt
                                  ? formatDateTimeInZone(run.startedAt, timezone, showLocalTime)
                                  : "—"}
                              </span>
                              {isLate ? (
                                <span className="rounded bg-[#EA580C]/12 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#C2410C]">
                                  Late by {Math.round((run.lateByMs ?? 0) / 1000)}s
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="tabular px-2 py-2.5 font-mono text-[11px] text-[#1F2125]">
                            {run.durationMs != null
                              ? `${Math.max(1, Math.round(run.durationMs / 1000))}s`
                              : "—"}
                          </td>
                          <td className="px-2 py-2.5">
                            <StatusPill tone={badge.tone} icon={<badge.Icon size={11} />}>
                              {badge.label}
                            </StatusPill>
                          </td>
                          <td className="px-2 py-2.5">{renderOutputLink(run)}</td>
                          <td
                            className="py-2.5 pl-2 pr-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onSelectRun(run.id)}
                                className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
                              >
                                <Terminal size={11} /> Logs
                              </button>
                              {run.status === "failed" ? (
                                <button
                                  type="button"
                                  onClick={() => void onRetryRun(run.id)}
                                  className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#DC2626] hover:bg-[#DC2626]/10"
                                >
                                  <RotateCw size={11} /> Retry
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void copyId(run.id)}
                                aria-label={`Copy run #${run.id}`}
                                className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
                              >
                                {copiedId === run.id ? (
                                  <Check size={12} className="text-[#059669]" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded ? (
                          <tr className="bg-white/55">
                            <td colSpan={8} className="px-4 py-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="font-mono text-[11px] text-[#4B5058]">
                                    Run ID #{run.id} · APScheduler job:{" "}
                                    <span className="text-[#1F2125]">{run.schedulerJobId}</span>
                                  </p>
                                  {run.error ? (
                                    <p className="text-[#B91C1C]">Error: {run.error}</p>
                                  ) : run.skippedReason ? (
                                    <p className="text-[#C2410C]">{run.skippedReason}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onSelectRun(run.id)}
                                  className="focus-ring rounded-xl bg-[#1C1D21] px-3 py-1.5 text-xs font-medium text-white"
                                >
                                  Open run drawer
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list <768px */}
            <div className="space-y-2.5 md:hidden">
              {sortedRuns.map((run) => {
                const badge = runStatusBadge(run.status);
                return (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-white/85 bg-white/75 p-3.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#1F2125]">{run.jobName}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-[#4B5058]">
                          {formatDateTimeInZone(run.scheduledFor, timezone, showLocalTime)}
                        </p>
                      </div>
                      <StatusPill tone={badge.tone} icon={<badge.Icon size={11} />}>
                        {badge.label}
                      </StatusPill>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-[#1F2125]/8 pt-2">
                      {renderOutputLink(run)}
                      <button
                        type="button"
                        onClick={() => onSelectRun(run.id)}
                        className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5]"
                      >
                        View logs →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                  className="btn-motion focus-ring h-9 rounded-xl border border-white/85 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </GlassCard>
    </motion.div>
  );
}
