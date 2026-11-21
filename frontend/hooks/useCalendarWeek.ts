"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getCalendar } from "@/lib/api";
import type { CalendarDay } from "@/lib/types";

export function getWeekBounds(weekOffset: number): {
  from: string;
  to: string;
  label: string;
  rangeLabel: string;
} {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + weekOffset * 7);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);

  const fmtIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const label =
    weekOffset === 0
      ? "This week"
      : weekOffset === 1
        ? "Next week"
        : weekOffset === -1
          ? "Last week"
          : `${fmtShort(mon)} – ${fmtShort(sun)}`;

  const rangeLabel = `${fmtShort(mon)} – ${fmtShort(sun)}, ${sun.getFullYear()}`;
  return { from: fmtIso(mon), to: fmtIso(sun), label, rangeLabel };
}

export function useCalendarWeek(companyId: number, weekOffset: number, enabled = true) {
  const queryClient = useQueryClient();
  const bounds = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);
  const prevBounds = useMemo(() => getWeekBounds(weekOffset - 1), [weekOffset]);
  const nextBounds = useMemo(() => getWeekBounds(weekOffset + 1), [weekOffset]);

  const query = useQuery<CalendarDay[]>({
    queryKey: ["automation-calendar", companyId, bounds.from, bounds.to],
    queryFn: () => getCalendar(companyId, bounds.from, bounds.to),
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    staleTime: 20_000,
  });

  const nextWeekQuery = useQuery<CalendarDay[]>({
    queryKey: ["automation-calendar", companyId, nextBounds.from, nextBounds.to],
    queryFn: () => getCalendar(companyId, nextBounds.from, nextBounds.to),
    enabled: enabled && Number.isFinite(companyId) && companyId > 0,
    staleTime: 30_000,
  });

  // Prefetch previous week cleanly
  useEffect(() => {
    if (!enabled || !Number.isFinite(companyId) || companyId <= 0) return;
    void queryClient.prefetchQuery({
      queryKey: ["automation-calendar", companyId, prevBounds.from, prevBounds.to],
      queryFn: () => getCalendar(companyId, prevBounds.from, prevBounds.to),
      staleTime: 30_000,
    });
  }, [companyId, enabled, prevBounds.from, prevBounds.to, queryClient]);

  const nextWeekHasOverrides = Boolean(
    nextWeekQuery.data?.some((d) => d.overrides.length > 0),
  );

  return {
    bounds,
    days: query.data ?? [],
    isLoading: query.isLoading,
    nextWeekHasOverrides,
    refetch: query.refetch,
  };
}
