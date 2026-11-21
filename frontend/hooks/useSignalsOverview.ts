"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { getSignalsOverview, runAnalysis } from "@/lib/api";
import type { SignalRange, SignalsOverviewResponse } from "@/lib/types";

export function useSignalsOverview(
  companyId: number,
  range: SignalRange,
  enabled = true,
  onNotify?: (tone: "ok" | "error", msg: string) => void,
) {
  const queryClient = useQueryClient();
  const { isDocumentHidden } = useMotionSafe();

  const query = useQuery<SignalsOverviewResponse>({
    queryKey: ["signals-overview", companyId, range],
    queryFn: () => getSignalsOverview(companyId, range),
    enabled: Number.isFinite(companyId) && companyId > 0 && enabled,
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      !isDocumentHidden && q.state.data?.analysisStatus === "running" ? 3000 : false,
    staleTime: 30_000,
  });

  const analyseMutation = useMutation({
    mutationFn: () => runAnalysis(companyId),
    onSuccess: () => {
      onNotify?.("ok", "Signal analysis started.");
      void queryClient.invalidateQueries({ queryKey: ["signals-overview", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["signals-feed", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
    onError: (err: Error) => {
      onNotify?.("error", err.message || "Could not start analysis.");
    },
  });

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch,
    triggerAnalysis: () => analyseMutation.mutate(),
    isStartingAnalysis: analyseMutation.isPending,
  };
}
