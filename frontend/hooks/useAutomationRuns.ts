"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listAutomationRuns } from "@/lib/api";
import type { AutomationRun, AutomationRunsFilters } from "@/lib/types";

export function useAutomationRuns(
  companyId: number,
  filters: AutomationRunsFilters,
  hasActiveRuns: boolean,
  enabled = true,
) {
  const [extraRuns, setExtraRuns] = useState<AutomationRun[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    setExtraRuns([]);
    setCursor(null);
  }, [filterKey]);

  const query = useQuery({
    queryKey: ["automation-runs", companyId, filterKey],
    queryFn: () => listAutomationRuns(companyId, filters),
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    refetchInterval: hasActiveRuns ? 5_000 : 30_000,
  });

  // Track newly inserted runs for fadeUp + indigo-50 highlight
  useEffect(() => {
    const items = query.data?.items;
    if (!items) return;
    if (!initializedRef.current) {
      items.forEach((r) => seenIdsRef.current.add(r.id));
      initializedRef.current = true;
      return;
    }
    const newlyArrived: number[] = [];
    for (const r of items) {
      if (!seenIdsRef.current.has(r.id)) {
        seenIdsRef.current.add(r.id);
        newlyArrived.push(r.id);
      }
    }
    if (newlyArrived.length > 0) {
      setFreshIds(new Set(newlyArrived));
      const timer = window.setTimeout(() => setFreshIds(new Set()), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [query.data?.items]);

  const loadMore = useCallback(async () => {
    const next = cursor ?? query.data?.nextCursor ?? null;
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listAutomationRuns(companyId, filters, next);
      setExtraRuns((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.items.filter((r) => !seen.has(r.id))];
      });
      setCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [companyId, cursor, filters, loadingMore, query.data?.nextCursor]);

  const baseItems = query.data?.items ?? [];
  const baseSeen = new Set(baseItems.map((r) => r.id));
  const runs = [...baseItems, ...extraRuns.filter((r) => !baseSeen.has(r.id))];
  const nextCursor = extraRuns.length > 0 ? cursor : (query.data?.nextCursor ?? null);

  return {
    runs,
    total: query.data?.total ?? runs.length,
    hasMore: Boolean(nextCursor),
    isLoading: query.isLoading,
    loadingMore,
    freshIds,
    loadMore,
    refetch: query.refetch,
  };
}
