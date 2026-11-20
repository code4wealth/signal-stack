"use client";

import { useState } from "react";
import { ArrowUpRight, FileEdit, Search, Sparkles } from "lucide-react";

import { formatRelativeTime, formatShortDate } from "@/lib/company-adapter";
import type {
  CollectedItem,
  CollectedItemsFilters,
  SignalStackSource,
  SourceCategory,
} from "@/lib/types";
import { CategoryBadge, EmptyState, GlassCard, StatusPill } from "@/components/ui-shared";

const CATEGORIES: { key: SourceCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "customers", label: "Customers" },
  { key: "competitors", label: "Competitors" },
  { key: "market", label: "Market" },
];

export function CollectedItemsTable({
  items,
  total,
  sources,
  filters,
  isLoading,
  hasMore,
  loadingMore,
  isMock,
  onFiltersChange,
  onSelectItem,
  onLoadMore,
}: {
  items: CollectedItem[];
  total: number;
  sources: SignalStackSource[];
  filters: CollectedItemsFilters;
  isLoading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  isMock?: boolean;
  onFiltersChange: (next: CollectedItemsFilters) => void;
  onSelectItem: (itemId: number) => void;
  onLoadMore: () => void;
}) {
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(new Set());

  return (
    <GlassCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-[#1F2125]">Collected evidence</h2>
          <span className="tabular rounded-full bg-white/85 px-2.5 py-0.5 font-mono text-xs font-medium text-[#4B5058]">
            {total}
          </span>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => {
            const active = (filters.category ?? "all") === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onFiltersChange({ ...filters, category: c.key })}
                className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#1C1D21] bg-[#1C1D21] text-white"
                    : "border-white/80 bg-white/75 text-[#4B5058] hover:bg-white"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters bar */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.q ?? ""}
            onChange={(e) => onFiltersChange({ ...filters, q: e.target.value })}
            placeholder="Search collected titles or text…"
            aria-label="Search collected items"
            className="focus-ring h-9 w-full rounded-xl border border-white/80 bg-white/80 pl-8 pr-3 text-xs text-[#1F2125] placeholder:text-[#9AA0AA] outline-none"
          />
        </div>

        <select
          aria-label="Filter by change status"
          value={filters.change ?? "all"}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              change: e.target.value as CollectedItemsFilters["change"],
            })
          }
          className="focus-ring h-9 rounded-xl border border-white/80 bg-white/80 px-2.5 text-xs text-[#1F2125] outline-none"
        >
          <option value="all">All changes</option>
          <option value="new">New only</option>
          <option value="changed">Changed only</option>
          <option value="unchanged">Unchanged</option>
        </select>

        <select
          aria-label="Filter by source"
          value={filters.sourceId ?? ""}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              sourceId: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="focus-ring h-9 rounded-xl border border-white/80 bg-white/80 px-2.5 text-xs text-[#1F2125] outline-none"
        >
          <option value="">All sources</option>
          {sources
            .filter((s) => s.status === "approved")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        <input
          type="date"
          aria-label="Fetched from date"
          value={filters.dateFrom ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, dateFrom: e.target.value || undefined })
          }
          className="focus-ring h-9 rounded-xl border border-white/80 bg-white/80 px-2.5 font-mono text-xs text-[#1F2125] outline-none"
        />
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-[#9AA0AA]">Loading collected evidence…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No collected items yet"
          description="Items collected from approved sources will appear here once a crawl completes."
        />
      ) : (
        <>
          {/* Desktop dense table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#1F2125]/8 font-mono text-[11px] uppercase text-[#9AA0AA]">
                <tr>
                  <th className="py-2.5 pr-3">Title</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Change</th>
                  <th className="px-3 py-2.5">Published</th>
                  <th className="px-3 py-2.5">Fetched</th>
                  <th className="py-2.5 pl-3 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2125]/6">
                {items.map((item) => {
                  const dom = item.domain ?? "";
                  const showFallback = !dom || failedFavicons.has(dom);
                  return (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={() => onSelectItem(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectItem(item.id);
                        }
                      }}
                      className="focus-ring cursor-pointer transition-colors hover:bg-white/75"
                    >
                      <td className="max-w-[320px] py-3 pr-3 font-medium text-[#1F2125]">
                        <span className="line-clamp-1">{item.title}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-[11px] text-[#4B5058]">
                          {showFallback ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded bg-[#EEF2FF] text-[9px] font-semibold text-[#4F46E5]">
                              {(dom || "S").charAt(0).toUpperCase()}
                            </span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=32`}
                              alt=""
                              width={14}
                              height={14}
                              className="h-3.5 w-3.5 rounded object-contain"
                              onError={() =>
                                setFailedFavicons((prev) => new Set(prev).add(dom))
                              }
                            />
                          )}
                          {dom}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <CategoryBadge category={item.category} />
                      </td>
                      <td className="px-3 py-3">
                        {item.change === "changed" ? (
                          <StatusPill tone="warning" icon={<FileEdit size={11} />}>
                            Changed
                          </StatusPill>
                        ) : (
                          <StatusPill tone="info" icon={<Sparkles size={11} />}>
                            New
                          </StatusPill>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#4B5058]">
                        {item.publishedAt ? formatShortDate(item.publishedAt) : "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#9AA0AA]">
                        {formatRelativeTime(item.fetchedAt)}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-[#2563EB] no-underline hover:underline"
                        >
                          Source <ArrowUpRight size={11} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <ul className="space-y-2.5 md:hidden">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item.id)}
                  className="focus-ring w-full space-y-2 rounded-2xl border border-white/80 bg-white/75 p-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-[#1F2125]">{item.title}</p>
                    {item.change === "changed" ? (
                      <StatusPill tone="warning" icon={<FileEdit size={11} />}>
                        Changed
                      </StatusPill>
                    ) : (
                      <StatusPill tone="info" icon={<Sparkles size={11} />}>
                        New
                      </StatusPill>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-[#4B5058]">{item.domain}</span>
                    <CategoryBadge category={item.category} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <div className="pt-2 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="focus-ring inline-flex h-9 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-xs font-medium text-[#1F2125] hover:bg-white"
              >
                {loadingMore ? "Loading…" : "Load more items"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}
