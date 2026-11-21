"use client";

import { useMutation } from "@tanstack/react-query";

import { createBriefAction, patchBriefAction } from "@/lib/api";
import type { Brief, BriefActionItem } from "@/lib/types";

export function useBriefActions(
  companyId: number,
  brief: Brief | null,
  onSyncBrief: (updated: Brief) => void,
) {
  const updateActionMutation = useMutation({
    mutationFn: ({
      actionId,
      patch,
    }: {
      actionId: string;
      patch: { done?: boolean; owner?: string; dueDate?: string | null; order?: number };
    }) => {
      if (!brief) throw new Error("No brief loaded");
      return patchBriefAction(companyId, brief.id, actionId, patch);
    },
    onMutate: ({ actionId, patch }) => {
      if (!brief) return;
      const optimisticActions: BriefActionItem[] = brief.actions
        .map((a) => (a.id === actionId ? { ...a, ...patch } : a))
        .sort((a, b) => a.order - b.order);
      onSyncBrief({ ...brief, actions: optimisticActions });
    },
    onSuccess: (updatedItem) => {
      if (!brief) return;
      const next = brief.actions
        .map((a) => (a.id === updatedItem.id ? updatedItem : a))
        .sort((a, b) => a.order - b.order);
      onSyncBrief({ ...brief, actions: next });
    },
  });

  const createActionMutation = useMutation({
    mutationFn: (payload: {
      text: string;
      owner: string;
      dueDate?: string | null;
      effort: "low" | "medium" | "high";
    }) => {
      if (!brief) throw new Error("No brief loaded");
      return createBriefAction(companyId, brief.id, payload);
    },
    onSuccess: (created) => {
      if (!brief) return;
      onSyncBrief({ ...brief, actions: [...brief.actions, created] });
    },
  });

  return {
    updateAction: updateActionMutation.mutateAsync,
    createAction: createActionMutation.mutateAsync,
    isCreatingAction: createActionMutation.isPending,
  };
}
