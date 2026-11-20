"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { SignalStackSource, SignalStackSourceStatus, SourceCategory } from "@/lib/types";

export type FilterStatusTab = "all" | SignalStackSourceStatus;
export type SortKey = "relevance" | "newest" | "category";
export type ViewMode = "grid" | "table";

const VALID_CATEGORIES: SourceCategory[] = ["customers", "competitors", "market", "internal"];
const VALID_STATUSES: FilterStatusTab[] = [
  "all",
  "needs_review",
  "approved",
  "rejected",
  "failing",
  "blocked",
];

export function useSourceFilters(sources: SignalStackSource[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category") as SourceCategory | null;
  const activeCategory: SourceCategory | "all" =
    rawCategory && VALID_CATEGORIES.includes(rawCategory) ? rawCategory : "all";

  const rawStatus = searchParams.get("status") as FilterStatusTab | null;
  const activeStatus: FilterStatusTab =
    rawStatus && VALID_STATUSES.includes(rawStatus) ? rawStatus : "all";

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("relevance");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  function updateQuery(next: { category?: SourceCategory | "all"; status?: FilterStatusTab }) {
    const params = new URLSearchParams(searchParams.toString());
    const cat = next.category !== undefined ? next.category : activeCategory;
    const st = next.status !== undefined ? next.status : activeStatus;

    if (cat === "all") params.delete("category");
    else params.set("category", cat);

    if (st === "all") params.delete("status");
    else params.set("status", st);

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sources.filter((src) => {
      if (activeCategory !== "all" && src.category !== activeCategory) return false;
      if (activeStatus !== "all" && src.status !== activeStatus) return false;
      if (
        q &&
        !src.name.toLowerCase().includes(q) &&
        !src.domain.toLowerCase().includes(q) &&
        !src.url.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === "relevance") return b.relevanceScore - a.relevanceScore;
      if (sortBy === "newest") return b.id - a.id;
      return a.category.localeCompare(b.category) || b.relevanceScore - a.relevanceScore;
    });
  }, [sources, activeCategory, activeStatus, search, sortBy]);

  return {
    activeCategory,
    setCategory: (category: SourceCategory | "all") => updateQuery({ category }),
    activeStatus,
    setStatus: (status: FilterStatusTab) => updateQuery({ status }),
    search,
    setSearch,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    filteredSources,
  };
}
