"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { generateBrief, getBriefGeneration } from "@/lib/api";
import type { BriefGenerationState } from "@/lib/types";

export function useBriefGeneration(companyId: number, onCompleted?: () => void) {
  const queryClient = useQueryClient();
  const [pageHidden, setPageHidden] = useState(false);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    const sync = () => setPageHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const statusQuery = useQuery<BriefGenerationState>({
    queryKey: ["brief-generation", companyId],
    queryFn: () => getBriefGeneration(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
    refetchInterval: (q) => {
      if (pageHidden) return false;
      const st = q.state.data?.status;
      return st === "queued" || st === "running" ? 3000 : false;
    },
  });

  const status = statusQuery.data?.status ?? "idle";
  const isGenerating = status === "queued" || status === "running";

  useEffect(() => {
    if (isGenerating) {
      wasActiveRef.current = true;
    } else if (wasActiveRef.current && status === "idle") {
      wasActiveRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["brief-latest", companyId] });
      queryClient.invalidateQueries({ queryKey: ["brief-history", companyId] });
      onCompleted?.();
    }
  }, [companyId, isGenerating, onCompleted, queryClient, status]);

  const startMutation = useMutation({
    mutationFn: () => generateBrief(companyId),
    onSuccess: (nextState) => {
      queryClient.setQueryData(["brief-generation", companyId], nextState);
    },
  });

  return {
    generation: statusQuery.data ?? { status: "idle", steps: [] },
    isGenerating,
    startGeneration: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    startError: startMutation.error instanceof Error ? startMutation.error.message : null,
  };
}
