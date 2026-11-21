"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { previewSchedule } from "@/lib/api";
import type { ScheduleDraft, SchedulePreviewResponse } from "@/lib/types";

export function useSchedulePreview(
  companyId: number,
  draft: ScheduleDraft | null,
  enabled = true,
) {
  const [debouncedDraft, setDebouncedDraft] = useState<ScheduleDraft | null>(draft);

  useEffect(() => {
    if (!draft) {
      setDebouncedDraft(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedDraft(draft);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const serialized = debouncedDraft ? JSON.stringify(debouncedDraft) : "";

  const query = useQuery<SchedulePreviewResponse>({
    queryKey: ["schedule-preview", companyId, serialized],
    queryFn: () => previewSchedule(companyId, debouncedDraft as ScheduleDraft),
    enabled:
      enabled &&
      Boolean(debouncedDraft) &&
      Number.isFinite(companyId) &&
      companyId > 0,
    staleTime: 10_000,
    retry: 0,
  });

  return {
    preview: query.data ?? null,
    isLoading: query.isFetching,
    error: query.error,
  };
}
