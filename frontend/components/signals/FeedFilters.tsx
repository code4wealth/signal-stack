"use client";

import { Search, X } from "lucide-react";

import type {
  SignalClassification,
  SignalSort,
  SignalStatus,
  Source,
  SourceCategory,
} from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

const CATEGORIES: { value: SourceCategory; label: string; dot: string }[] = [
  { value: "customers", label: "Customers", dot: "bg-[#0D9488]" },
  { value: "competitors", label: "Competitors", dot: "bg-[#EA580C]" },
  { value: "market", label: "Market", dot: "bg-[#2563EB]" },
  { value: "internal", label: "Internal", dot: "bg-[#7C3AED]" },
];

export function FeedFilters({
  categories,
  classification,
  minPriority,
  sourceId,
  status,
  dateFrom,
  dateTo,
  q,
  sort,
  sources,
  hasActiveFilters,
  lockClassification,
  lockStatus,
  onToggleCategory,
  onUpdate,
  onClear,
}: {
  categories: SourceCategory[];
  classification: SignalClassification | "all";
  minPriority: number;
  sourceId?: number;
  status: SignalStatus | "all";
  dateFrom: string;
  dateTo: string;
  q: string;
  sort: SignalSort;
  sources: Source[];
  hasActiveFilters: boolean;
  lockClassification?: boolean;
  lockStatus?: boolean;
  onToggleCategory: (cat: SourceCategory) => void;
  onUpdate: (patch: Record<string, string | null>) => void;
  onClear: () => void;
}) {
  return (
    <GlassCard className="sticky top-[68px] z-10 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
          {CATEGORIES.map((cat) => {
            const active = categories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleCategory(cat.value)}
                className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#1C1D21] bg-[#1C1D21] text-white"
                    : "border-white/85 bg-white/80 text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${cat.dot}`} aria-hidden="true" />
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => onUpdate({ q: e.target.value || null })}
              placeholder="Search signals…"
              aria-label="Search signals"
              className="focus-ring h-8 w-44 rounded-xl border border-white/85 bg-white/85 pl-8 pr-2.5 text-xs text-[#1F2125] placeholder:text-[#9AA0AA] outline-none sm:w-52"
            />
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={onClear}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl border border-[#1F2125]/10 bg-white/85 px-2.5 text-xs font-medium text-[#4B5058] hover:text-[#1F2125]"
            >
              <X size={12} aria-hidden="true" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {!lockClassification ? (
          <select
            aria-label="Filter by type"
            value={classification}
            onChange={(e) =>
              onUpdate({ classification: e.target.value === "all" ? null : e.target.value })
            }
            className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
          >
            <option value="all">All types</option>
            <option value="opportunity">Opportunities</option>
            <option value="threat">Threats</option>
            <option value="neutral">Neutral</option>
          </select>
        ) : null}

        <select
          aria-label="Minimum priority"
          value={String(minPriority)}
          onChange={(e) =>
            onUpdate({ minPriority: e.target.value === "1" ? null : e.target.value })
          }
          className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
        >
          <option value="1">Priority 1+ (All)</option>
          <option value="2">Priority 2+</option>
          <option value="3">Priority 3+ (Medium)</option>
          <option value="4">Priority 4+ (High)</option>
          <option value="5">Priority 5 (Critical)</option>
        </select>

        <select
          aria-label="Filter by source"
          value={sourceId ? String(sourceId) : ""}
          onChange={(e) => onUpdate({ sourceId: e.target.value || null })}
          className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
        >
          <option value="">All sources</option>
          {sources.map((src) => (
            <option key={src.id} value={String(src.id)}>
              {src.name}
            </option>
          ))}
        </select>

        {!lockStatus ? (
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => onUpdate({ status: e.target.value === "all" ? null : e.target.value })}
            className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
          >
            <option value="all">Active statuses</option>
            <option value="new">New / unreviewed</option>
            <option value="saved">Saved</option>
            <option value="in_brief">In Monday Brief</option>
            <option value="dismissed">Dismissed</option>
          </select>
        ) : null}

        <input
          type="date"
          aria-label="From date"
          value={dateFrom}
          onChange={(e) => onUpdate({ dateFrom: e.target.value || null })}
          className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
        />

        <input
          type="date"
          aria-label="To date"
          value={dateTo}
          onChange={(e) => onUpdate({ dateTo: e.target.value || null })}
          className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
        />

        <select
          aria-label="Sort signals"
          value={sort}
          onChange={(e) => onUpdate({ sort: e.target.value === "priority" ? null : e.target.value })}
          className="focus-ring h-8 rounded-xl border border-white/85 bg-white/85 px-2.5 text-xs text-[#1F2125]"
        >
          <option value="priority">Sort: Highest priority</option>
          <option value="newest">Sort: Newest first</option>
          <option value="confidence">Sort: Highest confidence</option>
        </select>
      </div>
    </GlassCard>
  );
}
