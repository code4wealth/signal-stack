"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelCrawl,
  getCrawlerOverview,
  recheckSignalStackSource,
  startCrawl,
  updateCrawlerSettings,
} from "@/lib/api";
import { buildDevMockCrawlerOverview } from "@/lib/company-adapter";
import type { CrawlRange, CrawlRun, CrawlerOverview } from "@/lib/types";

export function useCrawlerOverview(companyId: number, enabled = true) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

  const paramRange = searchParams.get("range");
  const range: CrawlRange =
    paramRange === "30d" || paramRange === "90d" ? paramRange : "7d";

  const [tabVisible, setTabVisible] = useState(true);
  const [recheckingIds, setRecheckingIds] = useState<Set<number>>(new Set());
  const [startError, setStartError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(
    null,
  );

  useEffect(() => {
    const handleVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, []);

  const setRange = useCallback(
    (next: CrawlRange) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("range", next);
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const queryKey = ["crawler-overview", companyId, range] as const;

  const overviewQuery = useQuery<CrawlerOverview>({
    queryKey,
    queryFn: () =>
      useMocks
        ? Promise.resolve(buildDevMockCrawlerOverview(companyId, range))
        : getCrawlerOverview(companyId, range),
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    refetchInterval: (q) => {
      if (useMocks || !tabVisible) return false;
      const active = q.state.data?.activeRun;
      return active ? 3000 : 30000;
    },
    refetchIntervalInBackground: false,
    retry: 1,
  });

  // Whenever an active crawl finishes or lastRun advances, invalidate collected items & run history
  const prevRunSigRef = useRef<{ activeId: number | null; lastKey: string | null } | null>(null);
  useEffect(() => {
    const data = overviewQuery.data;
    if (!data) return;
    const activeId = data.activeRun?.id ?? null;
    const lastKey = data.lastRun
      ? `${data.lastRun.id}:${data.lastRun.status}:${data.lastRun.finishedAt ?? ""}:${data.lastRun.counts.new}:${data.lastRun.counts.changed}`
      : null;
    const prev = prevRunSigRef.current;
    prevRunSigRef.current = { activeId, lastKey };
    if (!prev) return;

    const activeFinished = prev.activeId !== null && activeId === null;
    const lastRunUpdated = lastKey !== null && lastKey !== prev.lastKey;
    if (activeFinished || lastRunUpdated) {
      void queryClient.invalidateQueries({ queryKey: ["crawler-items", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["crawler-runs", companyId] });
    }
  }, [companyId, overviewQuery.data, queryClient]);

  const startMutation = useMutation({
    mutationFn: (sourceIds?: number[]) => startCrawl(companyId, sourceIds),
    onMutate: async (sourceIds) => {
      setStartError(null);
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<CrawlerOverview>(queryKey);
      if (prev && !prev.activeRun) {
        const optimisticRun: CrawlRun = {
          id: -Date.now(),
          companyId,
          trigger: "manual",
          status: "running",
          startedAt: new Date().toISOString(),
          sourcesTotal: sourceIds?.length || prev.coverage.filter((c) => c.category !== "internal").reduce((s, c) => s + c.approved, 0),
          sourcesDone: 0,
          counts: { new: 0, changed: 0, unchanged: 0, failed: 0, blocked: 0 },
        };
        queryClient.setQueryData<CrawlerOverview>(queryKey, {
          ...prev,
          activeRun: optimisticRun,
        });
      }
      return { prev };
    },
    onSuccess: (run) => {
      const prev = queryClient.getQueryData<CrawlerOverview>(queryKey);
      if (prev) {
        queryClient.setQueryData<CrawlerOverview>(queryKey, {
          ...prev,
          activeRun: run,
        });
      }
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["crawler-runs", companyId] });
      if (run.status !== "queued" && run.status !== "running") {
        void queryClient.invalidateQueries({ queryKey: ["crawler-items", companyId] });
      }
      setToast({ message: "Crawl started", tone: "ok" });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(queryKey, ctx.prev);
      }
      const msg = err instanceof Error ? err.message : "Failed to start crawl";
      setStartError(msg);
      setToast({ message: msg, tone: "error" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: number) => cancelCrawl(companyId, runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["crawler-runs", companyId] });
      setToast({ message: "Crawl cancellation requested", tone: "ok" });
    },
    onError: (err) => {
      setToast({
        message: err instanceof Error ? err.message : "Could not cancel run",
        tone: "error",
      });
    },
  });

  const recheckMutation = useMutation({
    mutationFn: (sourceId: number) => recheckSignalStackSource(companyId, sourceId),
    onMutate: (sourceId) => {
      setRecheckingIds((prev) => new Set(prev).add(sourceId));
    },
    onSettled: (_data, _err, sourceId) => {
      setRecheckingIds((prev) => {
        const next = new Set(prev);
        next.delete(sourceId);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (src) => {
      setToast({
        message: src.robotsAllowed ? `${src.name} reachable` : `${src.name}: ${src.lastError ?? "check failed"}`,
        tone: src.status === "failing" || src.status === "blocked" ? "error" : "ok",
      });
    },
    onError: (err) => {
      setToast({
        message: err instanceof Error ? err.message : "Recheck failed",
        tone: "error",
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (maxPagesPerRun: number) => updateCrawlerSettings(companyId, { maxPagesPerRun }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      setToast({ message: "Max pages per run updated", tone: "ok" });
    },
    onError: (err) => {
      setToast({
        message: err instanceof Error ? err.message : "Could not update budget",
        tone: "error",
      });
    },
  });

  return {
    overview: overviewQuery.data ?? null,
    range,
    setRange,
    isLoading: overviewQuery.isLoading,
    isError: overviewQuery.isError,
    error: overviewQuery.error,
    refetch: overviewQuery.refetch,
    startCrawl: (sourceIds?: number[]) => startMutation.mutateAsync(sourceIds),
    cancelCrawl: (runId: number) => cancelMutation.mutateAsync(runId),
    recheckSource: (sourceId: number) => recheckMutation.mutateAsync(sourceId),
    updateMaxPages: (maxPagesPerRun: number) => settingsMutation.mutateAsync(maxPagesPerRun),
    isStarting: startMutation.isPending,
    isCancelling: cancelMutation.isPending,
    isUpdatingSettings: settingsMutation.isPending,
    recheckingIds,
    startError,
    clearStartError: () => setStartError(null),
    toast,
    dismissToast: () => setToast(null),
  };
}
