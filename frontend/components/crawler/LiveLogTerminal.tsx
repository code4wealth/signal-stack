"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Pause,
  Play,
  Trash2,
} from "lucide-react";

import type { LogConnectionStatus } from "@/hooks/useRunLogs";
import type { CrawlLogLine } from "@/lib/types";

const ROW_HEIGHT = 26;
const OVERSCAN = 12;

function formatLogTime(ts: string): string {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return "--:--:--";
  return dt.toTimeString().slice(0, 8);
}

function levelStyle(level: CrawlLogLine["level"]) {
  switch (level) {
    case "error":
      return { tag: "ERROR", color: "text-red-300", Icon: AlertCircle };
    case "warn":
      return { tag: "WARN ", color: "text-amber-300", Icon: AlertTriangle };
    case "success":
      return { tag: "OK   ", color: "text-emerald-300", Icon: CheckCircle2 };
    default:
      return { tag: "INFO ", color: "text-slate-300", Icon: Info };
  }
}

export function LiveLogTerminal({
  lines,
  connection,
  paused,
  hasMore,
  isLoadingMore,
  externalDomainFilter,
  compact = false,
  onTogglePaused,
  onClearView,
  onLoadMore,
}: {
  lines: CrawlLogLine[];
  connection: LogConnectionStatus;
  paused: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  externalDomainFilter?: string | null;
  compact?: boolean;
  onTogglePaused: () => void;
  onClearView: () => void;
  onLoadMore?: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [announceErrors, setAnnounceErrors] = useState(false);
  const [lastErrorAnnouncement, setLastErrorAnnouncement] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeHighlightDomain = externalDomainFilter ?? selectedDomain;

  const filtered = useMemo(() => {
    return lines.filter((ln) => {
      if (levelFilter === "info" && ln.level !== "info" && ln.level !== "success") return false;
      if (levelFilter === "warn" && ln.level !== "warn") return false;
      if (levelFilter === "error" && ln.level !== "error") return false;
      if (externalDomainFilter && ln.sourceDomain !== externalDomainFilter) return false;
      return true;
    });
  }, [externalDomainFilter, levelFilter, lines]);

  // Autoscroll when unpaused
  useEffect(() => {
    if (paused || !viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [filtered.length, paused]);

  // Announce newest error line when opt-in toggle is enabled
  useEffect(() => {
    if (!announceErrors) return;
    const latestErr = [...lines].reverse().find((l) => l.level === "error");
    if (latestErr) {
      setLastErrorAnnouncement(
        `${latestErr.sourceDomain ? `[${latestErr.sourceDomain}] ` : ""}${latestErr.message}`,
      );
    }
  }, [announceErrors, lines]);

  const containerHeight = compact ? 220 : 320;
  const shouldVirtualize = filtered.length > 150;
  const startIdx = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const visibleCount = shouldVirtualize
    ? Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2
    : filtered.length;
  const visibleLines = shouldVirtualize
    ? filtered.slice(startIdx, startIdx + visibleCount)
    : filtered;

  const padTop = shouldVirtualize ? startIdx * ROW_HEIGHT : 0;
  const padBottom = shouldVirtualize
    ? Math.max(0, (filtered.length - (startIdx + visibleLines.length)) * ROW_HEIGHT)
    : 0;

  async function copyLogs() {
    const text = filtered
      .map(
        (l) =>
          `${formatLogTime(l.ts)}  ${levelStyle(l.level).tag}  ${
            l.sourceDomain ? `[${l.sourceDomain}] ` : ""
          }${l.message}`,
      )
      .join("\n");
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const connLabel =
    connection === "live"
      ? "Live"
      : connection === "polling"
        ? "Polling"
        : connection === "reconnecting"
          ? "Reconnecting..."
          : connection === "paused"
            ? "Paused"
            : "Ready";

  return (
    <section
      id="logs"
      aria-label="Live crawl log"
      className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0F172A] font-mono text-xs text-slate-200 shadow-lg"
    >
      {/* Terminal header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 bg-slate-900/80 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          </div>
          <h2 className="text-xs font-semibold text-slate-100">Live crawl log</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10.5px] text-slate-300">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connection === "live"
                  ? `bg-emerald-400 ${reduced ? "" : "animate-pulse"}`
                  : connection === "polling"
                    ? "bg-amber-400"
                    : "bg-slate-400"
              }`}
            />
            {connLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={announceErrors}
              onChange={(e) => setAnnounceErrors(e.target.checked)}
              className="accent-indigo-500"
            />
            Announce new errors
          </label>

          <button
            type="button"
            onClick={onTogglePaused}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] text-slate-200 hover:bg-slate-700"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? "Resume" : "Pause"}
          </button>

          <select
            aria-label="Filter log level"
            value={levelFilter}
            onChange={(e) =>
              setLevelFilter(e.target.value as "all" | "info" | "warn" | "error")
            }
            className="focus-ring h-7 rounded-lg border border-slate-700 bg-slate-800 px-2 text-[11px] text-slate-200 outline-none"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>

          <button
            type="button"
            onClick={() => void copyLogs()}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] text-slate-200 hover:bg-slate-700"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            type="button"
            onClick={onClearView}
            className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-[11px] text-slate-300 hover:bg-slate-700"
          >
            <Trash2 size={11} />
            Clear view
          </button>
        </div>
      </div>

      {/* Screen-reader live region ONLY for error lines when enabled */}
      <div
        className="sr-only"
        aria-live={announceErrors ? "polite" : "off"}
        aria-atomic="true"
      >
        {announceErrors ? lastErrorAnnouncement : ""}
      </div>

      {/* Log viewport */}
      <div
        ref={viewportRef}
        role="log"
        aria-live="off"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ maxHeight: containerHeight }}
        className="overflow-y-auto overflow-x-hidden p-3 sm:p-4"
      >
        {hasMore && onLoadMore ? (
          <div className="mb-2 text-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
            >
              {isLoadingMore ? "Loading…" : "Load more log lines"}
            </button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            Logs will appear when a crawl runs.
          </p>
        ) : (
          <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {visibleLines.map((line) => {
              const lvl = levelStyle(line.level);
              const LevelIcon = lvl.Icon;
              const isHighlighted =
                Boolean(activeHighlightDomain) && line.sourceDomain === activeHighlightDomain;

              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => {
                    if (!line.sourceDomain) return;
                    setSelectedDomain((prev) =>
                      prev === line.sourceDomain ? null : line.sourceDomain ?? null,
                    );
                  }}
                  className={`flex w-full items-start gap-2 rounded px-2 py-0.5 text-left leading-relaxed transition-colors hover:bg-slate-800/80 ${
                    isHighlighted ? "bg-indigo-500/20" : ""
                  }`}
                >
                  <span className="shrink-0 text-slate-500">{formatLogTime(line.ts)}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 ${lvl.color}`}>
                    <LevelIcon size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {lvl.tag}
                  </span>
                  <span className="min-w-0 break-words whitespace-pre-wrap text-slate-200">
                    {line.sourceDomain ? (
                      <span className="mr-1.5 text-indigo-300">[{line.sourceDomain}]</span>
                    ) : null}
                    {line.message}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
