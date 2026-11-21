"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createOverride,
  createSchedule,
  deleteOverride,
  deleteSchedule,
  getAutomation,
  retryRun,
  runScheduleNow,
  updateSchedule,
} from "@/lib/api";
import type {
  AutomationOverview,
  AutomationRun,
  OverrideDraft,
  Schedule,
  ScheduleDraft,
} from "@/lib/types";

export function useAutomation(
  companyId: number,
  notify: (tone: "ok" | "error", message: string) => void,
) {
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const queryKey = ["automation-overview", companyId] as const;

  const query = useQuery<AutomationOverview>({
    queryKey,
    queryFn: () => getAutomation(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
    refetchInterval: (q) => {
      if (hidden) return false;
      const d = q.state.data;
      const anyRunning = d?.schedules.some((s) => s.status === "running");
      return anyRunning ? 5_000 : 30_000;
    },
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ["automation-calendar", companyId] });
    void queryClient.invalidateQueries({ queryKey: ["automation-runs", companyId] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ scheduleId, enabled }: { scheduleId: number; enabled: boolean }) =>
      updateSchedule(companyId, scheduleId, { enabled }),
    onMutate: async ({ scheduleId, enabled }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<AutomationOverview>(queryKey);
      if (prev) {
        queryClient.setQueryData<AutomationOverview>(queryKey, {
          ...prev,
          schedules: prev.schedules.map((s) =>
            s.id === scheduleId
              ? { ...s, enabled, status: enabled ? "enabled" : "paused" }
              : s,
          ),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      notify("error", err instanceof Error ? err.message : "Could not update schedule.");
    },
    onSuccess: (updated) => {
      notify("ok", `${updated.name} ${updated.enabled ? "enabled" : "paused"}.`);
      invalidateAll();
    },
  });

  const saveScheduleMutation = useMutation({
    mutationFn: ({
      scheduleId,
      draft,
    }: {
      scheduleId?: number | null;
      draft: ScheduleDraft;
    }) =>
      scheduleId
        ? updateSchedule(companyId, scheduleId, draft)
        : createSchedule(companyId, draft),
    onSuccess: (saved: Schedule, vars) => {
      const prevSched = vars.scheduleId
        ? query.data?.schedules.find((s) => s.id === vars.scheduleId)
        : null;
      const prevNext = prevSched?.nextRuns[0];
      const nextNext = saved.nextRuns[0];
      if (prevNext && nextNext && prevNext !== nextNext) {
        notify(
          "ok",
          `Saved ${saved.name}. Next run changes from ${new Date(prevNext).toLocaleString()} to ${new Date(nextNext).toLocaleString()}.`,
        );
      } else {
        notify("ok", `${saved.name} saved.`);
      }
      invalidateAll();
    },
    onError: (err) => {
      notify("error", err instanceof Error ? err.message : "Could not save schedule.");
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId: number) => deleteSchedule(companyId, scheduleId),
    onSuccess: () => {
      notify("ok", "Schedule deleted.");
      invalidateAll();
    },
    onError: (err) => {
      notify("error", err instanceof Error ? err.message : "Could not delete schedule.");
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (scheduleId: number) => runScheduleNow(companyId, scheduleId),
    onMutate: async (scheduleId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<AutomationOverview>(queryKey);
      if (prev) {
        queryClient.setQueryData<AutomationOverview>(queryKey, {
          ...prev,
          schedules: prev.schedules.map((s) =>
            s.id === scheduleId ? { ...s, status: "running" } : s,
          ),
        });
      }
      return { prev };
    },
    onSuccess: (run: AutomationRun) => {
      notify("ok", `${run.jobName} started (run #${run.id}).`);
      invalidateAll();
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      notify("error", err instanceof Error ? err.message : "Could not start run.");
    },
  });

  const retryRunMutation = useMutation({
    mutationFn: (runId: number) => retryRun(companyId, runId),
    onSuccess: (run: AutomationRun) => {
      notify("ok", `Retrying ${run.jobName} (run #${run.id}).`);
      invalidateAll();
    },
    onError: (err) => {
      notify("error", err instanceof Error ? err.message : "Could not retry run.");
    },
  });

  const createOverrideMutation = useMutation({
    mutationFn: (draft: OverrideDraft) => createOverride(companyId, draft),
    onSuccess: () => {
      notify("ok", "Override applied.");
      invalidateAll();
    },
    onError: (err) => {
      notify("error", err instanceof Error ? err.message : "Could not create override.");
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: (overrideId: number) => deleteOverride(companyId, overrideId),
    onSuccess: () => {
      notify("ok", "Override removed.");
      invalidateAll();
    },
    onError: (err) => {
      notify("error", err instanceof Error ? err.message : "Could not remove override.");
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    toggleSchedule: (scheduleId: number, enabled: boolean) =>
      toggleMutation.mutate({ scheduleId, enabled }),
    saveSchedule: (scheduleId: number | null | undefined, draft: ScheduleDraft) =>
      saveScheduleMutation.mutateAsync({ scheduleId, draft }),
    deleteSchedule: (scheduleId: number) => deleteScheduleMutation.mutateAsync(scheduleId),
    runNow: (scheduleId: number) => runNowMutation.mutateAsync(scheduleId),
    retryRun: (runId: number) => retryRunMutation.mutateAsync(runId),
    createOverride: (draft: OverrideDraft) => createOverrideMutation.mutateAsync(draft),
    deleteOverride: (overrideId: number) => deleteOverrideMutation.mutateAsync(overrideId),
    isSavingSchedule: saveScheduleMutation.isPending,
    isCreatingOverride: createOverrideMutation.isPending,
  };
}
