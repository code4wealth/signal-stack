"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, List, Search } from "lucide-react";

import { FAST_TRANSITION, fadeUp } from "@/lib/motion";
import type { FilterStatusTab, SortKey, ViewMode } from "@/hooks/useSourceFilters";
import type { SignalStack } from "@/lib/types";

export function SourceFilterTabs({
  counts,
  totalSources,
  activeStatus,
  onSelectStatus,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: {
  counts: SignalStack["counts"];
  totalSources: number;
  activeStatus: FilterStatusTab;
  onSelectStatus: (st: FilterStatusTab) => void;
  search: string;
  onSearchChange: (q: string) => void;
  sortBy: SortKey;
  onSortChange: (sort: SortKey) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const listRef = useRef<HTMLDivElement | null>(null);

  const tabs: { key: FilterStatusTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: totalSources },
    { key: "needs_review", label: "Needs review", count: counts.needs_review },
    { key: "approved", label: "Approved", count: counts.approved },
    { key: "rejected", label: "Rejected", count: counts.rejected },
    { key: "failing", label: "Failing", count: counts.failing + counts.blocked },
  ];

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    const picked = tabs[next];
    if (!picked) return;
    event.preventDefault();
    onSelectStatus(picked.key);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')?.[next]?.focus();
  }

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    >
      {/* Pill tabs */}
      <div
        ref={listRef}
        role="tablist"
        aria-label="Filter sources by status"
        className="glass flex items-center gap-1 overflow-x-auto rounded-2xl p-1"
      >
        {tabs.map((tab, idx) => {
          const selected = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelectStatus(tab.key)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`focus-ring relative shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                selected ? "text-[#1F2125]" : "text-[#4B5058] hover:text-[#1F2125]"
              }`}
            >
              {selected ? (
                <motion.span
                  layoutId={reduced ? undefined : "signal-stack-status-pill"}
                  transition={FAST_TRANSITION}
                  className="absolute inset-0 rounded-xl bg-white shadow-[0_3px_10px_rgba(31,33,37,0.06)]"
                />
              ) : null}
              <span className="relative z-10 flex items-center gap-1.5">
                <span>{tab.label}</span>
                <span className="tabular rounded-full bg-[#F4F6FB] px-1.5 py-0.5 font-mono text-[10px] text-[#4B5058]">
                  {tab.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Sort, Grid/Table toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:w-52 sm:flex-initial">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search domain or title…"
            aria-label="Search sources by domain or title"
            className="focus-ring h-9 w-full rounded-xl border border-white/80 bg-white/75 pl-8 pr-3 text-xs text-[#1F2125] placeholder:text-[#9AA0AA] outline-none"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          aria-label="Sort sources"
          className="focus-ring h-9 rounded-xl border border-white/80 bg-white/75 px-3 text-xs font-medium text-[#1F2125] outline-none"
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="newest">Sort: Newest</option>
          <option value="category">Sort: Category</option>
        </select>

        <div
          role="group"
          aria-label="Source layout view"
          className="flex items-center rounded-xl border border-white/80 bg-white/75 p-0.5"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            className={`focus-ring rounded-lg p-1.5 transition-colors ${
              viewMode === "grid"
                ? "bg-[#1C1D21] text-white"
                : "text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <LayoutGrid size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            aria-label="Table view"
            aria-pressed={viewMode === "table"}
            className={`focus-ring rounded-lg p-1.5 transition-colors ${
              viewMode === "table"
                ? "bg-[#1C1D21] text-white"
                : "text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <List size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
