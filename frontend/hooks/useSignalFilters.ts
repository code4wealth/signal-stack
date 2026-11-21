"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  SignalClassification,
  SignalRange,
  SignalsListFilters,
  SignalSort,
  SignalStatus,
  SignalTab,
  SourceCategory,
} from "@/lib/types";

const VALID_TABS: SignalTab[] = [
  "overview",
  "feed",
  "opportunities",
  "threats",
  "saved",
  "dismissed",
];

const VALID_RANGES: SignalRange[] = ["week", "30d", "90d", "all"];
const VALID_CATEGORIES: SourceCategory[] = ["customers", "competitors", "market", "internal"];

export function useSignalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = useMemo<SignalTab>(() => {
    const raw = searchParams.get("tab") as SignalTab | null;
    if (raw && VALID_TABS.includes(raw)) return raw;
    if (
      searchParams.get("category") ||
      searchParams.get("classification") ||
      searchParams.get("sourceId") ||
      searchParams.get("status") ||
      searchParams.get("q")
    ) {
      return "feed";
    }
    return "overview";
  }, [searchParams]);

  const range = useMemo<SignalRange>(() => {
    const raw = searchParams.get("range") as SignalRange | null;
    return raw && VALID_RANGES.includes(raw) ? raw : "30d";
  }, [searchParams]);

  const categories = useMemo<SourceCategory[]>(() => {
    const raw = searchParams.get("category");
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim() as SourceCategory)
      .filter((c) => VALID_CATEGORIES.includes(c));
  }, [searchParams]);

  const classification = useMemo<SignalClassification | "all">(() => {
    const raw = searchParams.get("classification");
    if (raw === "opportunity" || raw === "threat" || raw === "neutral") return raw;
    return "all";
  }, [searchParams]);

  const minPriority = useMemo<number>(() => {
    const raw = Number(searchParams.get("minPriority") || "1");
    return Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : 1;
  }, [searchParams]);

  const sourceId = useMemo<number | undefined>(() => {
    const raw = searchParams.get("sourceId");
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [searchParams]);

  const status = useMemo<SignalStatus | "all">(() => {
    const raw = searchParams.get("status");
    if (raw === "new" || raw === "saved" || raw === "in_brief" || raw === "dismissed") {
      return raw;
    }
    return "all";
  }, [searchParams]);

  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const q = searchParams.get("q") || "";

  const sort = useMemo<SignalSort>(() => {
    const raw = searchParams.get("sort");
    if (raw === "newest" || raw === "confidence" || raw === "priority") return raw;
    return "priority";
  }, [searchParams]);

  const selectedSignalId = useMemo<number | null>(() => {
    const raw = searchParams.get("signal");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const selectedEvidenceItemId = useMemo<number | null>(() => {
    const raw = searchParams.get("item");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [searchParams]);

  const updateParams = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setTab = useCallback(
    (nextTab: SignalTab) => {
      updateParams({ tab: nextTab === "overview" ? null : nextTab });
    },
    [updateParams],
  );

  const setRange = useCallback(
    (nextRange: SignalRange) => {
      updateParams({ range: nextRange === "30d" ? null : nextRange });
    },
    [updateParams],
  );

  const toggleCategory = useCallback(
    (cat: SourceCategory) => {
      const next = categories.includes(cat)
        ? categories.filter((c) => c !== cat)
        : [...categories, cat];
      updateParams({ category: next.length > 0 ? next.join(",") : null });
    },
    [categories, updateParams],
  );

  const clearFilters = useCallback(() => {
    updateParams({
      category: null,
      classification: null,
      minPriority: null,
      sourceId: null,
      status: null,
      dateFrom: null,
      dateTo: null,
      q: null,
    });
  }, [updateParams]);

  const effectiveFilters = useMemo<SignalsListFilters>(() => {
    let resolvedClassification: SignalClassification | "all" = classification;
    let resolvedStatus: SignalStatus | "all" = status;

    if (tab === "opportunities") resolvedClassification = "opportunity";
    else if (tab === "threats") resolvedClassification = "threat";

    if (tab === "saved") resolvedStatus = "saved";
    else if (tab === "dismissed") resolvedStatus = "dismissed";

    return {
      category: categories,
      classification: resolvedClassification,
      minPriority,
      sourceId,
      status: resolvedStatus,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      q: q || undefined,
      sort,
    };
  }, [categories, classification, dateFrom, dateTo, minPriority, q, sort, sourceId, status, tab]);

  const hasActiveFilters = Boolean(
    categories.length > 0 ||
      classification !== "all" ||
      minPriority > 1 ||
      sourceId !== undefined ||
      status !== "all" ||
      dateFrom ||
      dateTo ||
      q,
  );

  return {
    tab,
    range,
    categories,
    classification,
    minPriority,
    sourceId,
    status,
    dateFrom,
    dateTo,
    q,
    sort,
    selectedSignalId,
    selectedEvidenceItemId,
    effectiveFilters,
    hasActiveFilters,
    setTab,
    setRange,
    toggleCategory,
    updateParams,
    clearFilters,
  };
}
