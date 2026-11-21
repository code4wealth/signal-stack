"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { bulkUpdateSignals, listSignals, patchSignal } from "@/lib/api";
import type {
  CollectedItem,
  SignalItem,
  SignalPatchPayload,
  SignalsListFilters,
  SignalsListResponse,
} from "@/lib/types";

export function useSignalsFeed(
  companyId: number,
  filters: SignalsListFilters,
  enabled = true,
  onNotify?: (tone: "ok" | "error", msg: string) => void,
) {
  const queryClient = useQueryClient();
  const queryKey = ["signals-feed", companyId, filters] as const;

  const query = useInfiniteQuery<SignalsListResponse>({
    queryKey,
    queryFn: ({ pageParam }) =>
      listSignals(companyId, filters, typeof pageParam === "string" ? pageParam : null, 25),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Number.isFinite(companyId) && companyId > 0 && enabled,
    staleTime: 10_000,
  });

  const items: SignalItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const evidenceById: Record<string, CollectedItem> = {};
  for (const page of query.data?.pages ?? []) {
    Object.assign(evidenceById, page.evidenceById);
  }
  const latestPage = query.data?.pages[query.data.pages.length - 1];

  const patchMutation = useMutation({
    mutationFn: ({ signalId, patch }: { signalId: number; patch: SignalPatchPayload }) =>
      patchSignal(companyId, signalId, patch),
    onMutate: async ({ signalId, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["signals-feed", companyId] });
      const previous = queryClient.getQueriesData({ queryKey: ["signals-feed", companyId] });

      queryClient.setQueriesData<{ pages: SignalsListResponse[]; pageParams: unknown[] }>(
        { queryKey: ["signals-feed", companyId] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((sig) =>
                sig.id === signalId
                  ? {
                      ...sig,
                      status: patch.status ?? sig.status,
                      feedback: patch.feedback ?? sig.feedback,
                    }
                  : sig,
              ),
            })),
          };
        },
      );
      return { previous };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) {
        for (const [k, data] of ctx.previous) {
          queryClient.setQueryData(k, data);
        }
      }
      onNotify?.("error", err.message || "Could not update signal.");
    },
    onSuccess: (_data, vars) => {
      if (vars.patch.status === "in_brief") onNotify?.("ok", "Added to Monday Brief.");
      else if (vars.patch.status === "saved") onNotify?.("ok", "Signal saved.");
      else if (vars.patch.status === "dismissed") onNotify?.("ok", "Signal dismissed.");
      else if (vars.patch.feedback) onNotify?.("ok", "Feedback saved.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["signals-feed", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["signals-overview", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["signal-detail", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, patch }: { ids: number[]; patch: SignalPatchPayload }) =>
      bulkUpdateSignals(companyId, ids, patch),
    onSuccess: (res, vars) => {
      const label =
        vars.patch.status === "in_brief"
          ? "added to Monday Brief"
          : vars.patch.status === "dismissed"
            ? "dismissed"
            : "updated";
      onNotify?.("ok", `${res.updatedCount} signal(s) ${label}.`);
      void queryClient.invalidateQueries({ queryKey: ["signals-feed", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["signals-overview", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
    onError: (err: Error) => {
      onNotify?.("error", err.message || "Bulk update failed.");
    },
  });

  return {
    items,
    evidenceById,
    total: latestPage?.total ?? 0,
    countsByClassification: latestPage?.countsByClassification ?? {
      opportunity: 0,
      threat: 0,
      neutral: 0,
    },
    countsByCategory: latestPage?.countsByCategory ?? {
      customers: 0,
      competitors: 0,
      market: 0,
      internal: 0,
    },
    isMock: Boolean(latestPage?.isMock),
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: Boolean(query.hasNextPage),
    fetchNextPage: query.fetchNextPage,
    error: query.error instanceof Error ? query.error.message : null,
    updateSignal: (signalId: number, patch: SignalPatchPayload) =>
      patchMutation.mutate({ signalId, patch }),
    bulkUpdate: (ids: number[], patch: SignalPatchPayload) =>
      bulkMutation.mutate({ ids, patch }),
    isBulkUpdating: bulkMutation.isPending,
  };
}
