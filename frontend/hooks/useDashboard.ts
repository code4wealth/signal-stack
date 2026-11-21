"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { getDashboard, startCrawl } from "@/lib/api";
import type { DashboardData, DashboardRange, SourceCategory } from "@/lib/types";

export function useDashboard(
  companyId: number,
  range: DashboardRange,
  category?: SourceCategory | null,
  onNotify?: (tone: "ok" | "error", msg: string) => void,
) {
  const queryClient = useQueryClient();
  const { isDocumentHidden } = useMotionSafe();

  const query = useQuery<DashboardData>({
    queryKey: ["dashboard", companyId, range, category ?? "all"],
    queryFn: () => getDashboard(companyId, range, category),
    enabled: Number.isFinite(companyId) && companyId > 0,
    placeholderData: keepPreviousData,
    refetchInterval: (q) => {
      if (isDocumentHidden) return false;
      const data = q.state.data;
      if (data?.activeCrawlRunning || data?.activeAnalysisRunning) {
        return 5000;
      }
      return 30_000;
    },
    staleTime: 10_000,
  });

  const crawlMutation = useMutation({
    mutationFn: (sourceIds?: number[]) => startCrawl(companyId, sourceIds),
    onSuccess: () => {
      onNotify?.("ok", "Crawl started. Dashboard will update automatically.");
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["crawler-overview", companyId] });
    },
    onError: (err: Error) => {
      onNotify?.("error", err.message || "Could not start crawl.");
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
    runCrawl: (sourceIds?: number[]) => crawlMutation.mutate(sourceIds),
    isStartingCrawl: crawlMutation.isPending,
  };
}
