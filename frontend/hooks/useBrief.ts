"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getBrief,
  getLatestBrief,
  patchBrief,
  submitBriefFeedback,
  toggleWatchlistItem,
} from "@/lib/api";
import type { Brief, BriefLatestResponse, BriefNote, BriefStatus } from "@/lib/types";

export function useBrief(companyId: number, briefId?: string) {
  const queryClient = useQueryClient();

  const latestQuery = useQuery<BriefLatestResponse>({
    queryKey: ["brief-latest", companyId],
    queryFn: () => getLatestBrief(companyId),
    enabled: !briefId && Number.isFinite(companyId) && companyId > 0,
    staleTime: 20_000,
  });

  const specificQuery = useQuery<Brief>({
    queryKey: ["brief-detail", companyId, briefId],
    queryFn: async () => {
      const b = await getBrief(companyId, briefId as string);
      queryClient.invalidateQueries({ queryKey: ["brief-latest", companyId] });
      return b;
    },
    enabled: Boolean(briefId) && Number.isFinite(companyId) && companyId > 0,
    staleTime: 20_000,
  });

  const brief = briefId ? (specificQuery.data ?? null) : (latestQuery.data?.brief ?? null);
  const prerequisites = latestQuery.data?.prerequisites ?? {
    ready: true,
    signalsCount: brief?.stats.signals ?? 0,
    completedCrawls: 1,
  };
  const isLoading = briefId ? specificQuery.isLoading : latestQuery.isLoading;
  const error = briefId ? specificQuery.error : latestQuery.error;

  const syncCache = (updated: Brief) => {
    if (briefId) {
      queryClient.setQueryData(["brief-detail", companyId, briefId], updated);
    }
    queryClient.setQueryData<BriefLatestResponse>(["brief-latest", companyId], (prev) =>
      prev && prev.brief?.id === updated.id ? { ...prev, brief: updated } : prev,
    );
  };

  const patchMutation = useMutation({
    mutationFn: (payload: {
      status?: BriefStatus;
      removeItemIds?: string[];
      notes?: BriefNote[];
    }) => {
      if (!brief) throw new Error("No brief loaded");
      return patchBrief(companyId, brief.id, payload);
    },
    onSuccess: (updated) => {
      syncCache(updated);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload: { useful: boolean; comment?: string }) => {
      if (!brief) throw new Error("No brief loaded");
      return submitBriefFeedback(companyId, brief.id, payload);
    },
    onSuccess: (fb) => {
      if (!brief) return;
      syncCache({ ...brief, feedback: fb });
    },
  });

  const watchToggleMutation = useMutation({
    mutationFn: (watchId: string) => toggleWatchlistItem(companyId, watchId),
    onSuccess: ({ watchId, inWatchlist }) => {
      if (!brief) return;
      syncCache({
        ...brief,
        watch: brief.watch.map((w) => (w.id === watchId ? { ...w, inWatchlist } : w)),
      });
    },
  });

  const refetchAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ["brief-latest", companyId] });
    if (briefId) {
      await queryClient.invalidateQueries({ queryKey: ["brief-detail", companyId, briefId] });
    }
  };

  return {
    brief,
    prerequisites,
    isLoading,
    error,
    refetchAll,
    syncCache,
    patchBrief: patchMutation.mutateAsync,
    isPatching: patchMutation.isPending,
    submitFeedback: feedbackMutation.mutateAsync,
    isSubmittingFeedback: feedbackMutation.isPending,
    toggleWatch: watchToggleMutation.mutateAsync,
  };
}
