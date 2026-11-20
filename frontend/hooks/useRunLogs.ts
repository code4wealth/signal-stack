"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getRunLogs, streamRunLogs } from "@/lib/api";
import type { CrawlLogLine } from "@/lib/types";

const MAX_LOG_BUFFER = 2000;

export type LogConnectionStatus =
  | "idle"
  | "live"
  | "reconnecting"
  | "polling"
  | "paused";

export function useRunLogs(
  companyId: number,
  runId: number | null | undefined,
  isActive: boolean,
  onRunFinished?: () => void,
) {
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const [lines, setLines] = useState<CrawlLogLine[]>([]);
  const [connection, setConnection] = useState<LogConnectionStatus>("idle");
  const [paused, setPaused] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const lastSeenIdRef = useRef<number>(0);
  const onFinishedRef = useRef(onRunFinished);
  onFinishedRef.current = onRunFinished;

  const appendLines = useCallback((incoming: CrawlLogLine[]) => {
    if (incoming.length === 0) return;
    setLines((prev) => {
      const seen = new Set(prev.map((l) => l.id));
      const merged = [...prev];
      for (const line of incoming) {
        if (!seen.has(line.id)) {
          seen.add(line.id);
          merged.push(line);
          if (line.id > lastSeenIdRef.current) {
            lastSeenIdRef.current = line.id;
          }
        }
      }
      if (merged.length > MAX_LOG_BUFFER) {
        return merged.slice(merged.length - MAX_LOG_BUFFER);
      }
      return merged;
    });
  }, []);

  // Load initial logs for any selected runId
  useEffect(() => {
    lastSeenIdRef.current = 0;
    setLines([]);
    setNextCursor(null);

    if (!runId || runId <= 0 || !Number.isFinite(companyId) || companyId <= 0) {
      setConnection("idle");
      return;
    }

    if (useMocks) {
      setLines([
        {
          id: 1,
          runId,
          ts: new Date().toISOString(),
          level: "info",
          message: "MOCK DATA — Started crawl across approved sources (robots.txt respected)",
        },
        {
          id: 2,
          runId,
          ts: new Date().toISOString(),
          level: "success",
          sourceDomain: "example.com",
          message: "HTTP 200 · 3 new, 1 changed, 0 unchanged",
        },
      ]);
      setConnection("idle");
      return;
    }

    let cancelled = false;
    void getRunLogs(companyId, runId)
      .then((res) => {
        if (cancelled) return;
        appendLines(res.items);
        setNextCursor(res.nextCursor);
      })
      .catch(() => {
        /* handled by SSE/polling fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [appendLines, companyId, runId, useMocks]);

  // SSE stream when active, with automatic 3s polling fallback
  useEffect(() => {
    if (useMocks || !runId || runId <= 0 || !isActive) {
      if (!isActive) {
        setConnection(paused ? "paused" : "idle");
      }
      return;
    }

    if (paused) {
      setConnection("paused");
      return;
    }

    let closed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (closed || pollTimer) return;
      setConnection("polling");
      pollTimer = setInterval(() => {
        if (closed) return;
        const cursor = lastSeenIdRef.current > 0 ? String(lastSeenIdRef.current) : undefined;
        void getRunLogs(companyId, runId, cursor)
          .then((res) => {
            if (!closed) appendLines(res.items);
          })
          .catch(() => {
            /* keep retrying */
          });
      }, 3000);
    };

    try {
      setConnection("live");
      es = streamRunLogs(companyId, runId, lastSeenIdRef.current);

      es.addEventListener("log", (evt: MessageEvent) => {
        if (closed) return;
        try {
          const parsed = JSON.parse(String(evt.data)) as CrawlLogLine;
          appendLines([parsed]);
          setConnection("live");
        } catch {
          /* ignore malformed line */
        }
      });

      es.addEventListener("done", () => {
        if (closed) return;
        es?.close();
        setConnection("idle");
        onFinishedRef.current?.();
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
  }, [appendLines, companyId, isActive, paused, runId, useMocks]);

  const loadMore = useCallback(async () => {
    if (!runId || !nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await getRunLogs(companyId, runId, nextCursor);
      appendLines(res.items);
      setNextCursor(res.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [appendLines, companyId, isLoadingMore, nextCursor, runId]);

  const clearView = useCallback(() => {
    setLines([]);
  }, []);

  return {
    lines,
    connection: paused ? "paused" : connection,
    paused,
    togglePaused: () => setPaused((p) => !p),
    clearView,
    hasMore: Boolean(nextCursor),
    loadMore,
    isLoadingMore,
  };
}
