"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  ExternalLink,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";

import {
  CategoryBadge,
  EmptyState,
  GlassCard,
  StatusPill,
} from "@/components/ui-shared";
import { formatRelativeTime } from "@/lib/company-adapter";
import type { DashboardSourcePerf } from "@/lib/types";

type SortKey = "name" | "category" | "yieldPct" | "items" | "signals" | "lastCheckedAt";

function SourceFavicon({ domain, name }: { domain: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1C1D21] text-[10px] font-semibold text-white">
        {(name || "S").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#1F2125]/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function healthTone(health?: string, status?: string): "verified" | "warning" | "threat" | "neutral" {
  if (health === "ok") return "verified";
  if (health === "failing") return "threat";
  if (status === "paused") return "warning";
  return "neutral";
}

export function SourcePerformanceTable({
  companyId,
  rows,
  onManageSource,
  onRecheckSource,
}: {
  companyId: number;
  rows: DashboardSourcePerf[];
  onManageSource: (sourceId: number) => void;
  onRecheckSource: (sourceId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("signals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.domain.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q),
        )
      : [...rows];

    list.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name" || sortKey === "category") {
        return a[sortKey].localeCompare(b[sortKey]) * mul;
      }
      if (sortKey === "lastCheckedAt") {
        return (a.lastCheckedAt || "").localeCompare(b.lastCheckedAt || "") * mul;
      }
      return (a[sortKey] - b[sortKey]) * mul;
    });

    return expanded ? list : list.slice(0, 8);
  }, [expanded, query, rows, sortDir, sortKey]);

  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  const tableContent = (
    <GlassCard spotlight className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">Source performance</h2>
          <p className="text-[11px] text-[#4B5058]">
            Signal yield, collected volume, and check health per monitored source
          </p>
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter sources…"
              aria-label="Filter source performance table"
              className="focus-ring h-8 w-44 rounded-xl border border-white/85 bg-white/85 pl-8 pr-2.5 text-xs text-[#1F2125] placeholder:text-[#9AA0AA] outline-none sm:w-52"
            />
          </div>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? "Exit full-screen table" : "Expand table full-screen"}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-xl border border-white/85 bg-white/85 text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No sources match"
          description="Approve sources in Signal Stack or adjust your search query."
        />
      ) : (
        <>
          {/* Mobile card list (<768px) */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((row) => (
              <div
                key={row.sourceId}
                className="rounded-2xl border border-white/85 bg-white/75 p-3.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onManageSource(row.sourceId)}
                    className="focus-ring flex min-w-0 items-center gap-2 text-left"
                  >
                    <SourceFavicon domain={row.domain} name={row.name} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1F2125]">{row.name}</p>
                      <p className="truncate font-mono text-[10.5px] text-[#9AA0AA]">
                        {row.domain}
                      </p>
                    </div>
                  </button>
                  <StatusPill tone={healthTone(row.health, row.status)}>
                    {row.health || row.status}
                  </StatusPill>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <CategoryBadge category={row.category} />
                  <span className="tabular font-mono text-[11px] text-[#4B5058]">
                    Yield {row.yieldPct}% · {row.items} items · {row.signals} signals
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop & tablet dense table (>=768px) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#1F2125]/10 font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                  <th scope="col" aria-sort={ariaSort("name")} className="sticky left-0 bg-white/85 py-2.5 pr-3 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Source <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("category")} className="px-2.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSort("category")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Category <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold">
                    Type
                  </th>
                  <th scope="col" aria-sort={ariaSort("yieldPct")} className="px-2.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSort("yieldPct")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Signal yield <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("items")} className="px-2.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("items")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Items <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("signals")} className="px-2.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("signals")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Signals <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" aria-sort={ariaSort("lastCheckedAt")} className="px-2.5 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSort("lastCheckedAt")}
                      className="focus-ring inline-flex items-center gap-1 font-semibold hover:text-[#1F2125]"
                    >
                      Last checked <ArrowUpDown size={11} aria-hidden="true" />
                    </button>
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold">
                    Health
                  </th>
                  <th scope="col" className="py-2.5 pl-2 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#1F2125]/6">
                {filtered.map((row) => (
                  <tr
                    key={row.sourceId}
                    tabIndex={0}
                    onClick={() => onManageSource(row.sourceId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onManageSource(row.sourceId);
                      }
                    }}
                    className="group relative cursor-pointer transition-colors hover:bg-white/80 focus:bg-white/85 focus:outline-none"
                  >
                    <td className="sticky left-0 bg-white/80 py-2.5 pr-3 backdrop-blur-sm group-hover:bg-white/95">
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1 left-0 w-[3px] origin-center scale-y-0 rounded-r-full bg-[#4F46E5] transition-transform duration-150 group-hover:scale-y-100"
                      />
                      <div className="flex items-center gap-2.5 pl-1.5">
                        <SourceFavicon domain={row.domain} name={row.name} />
                        <div className="min-w-0">
                          <p className="max-w-[190px] truncate font-medium text-[#1F2125]">
                            {row.name}
                          </p>
                          <p className="max-w-[190px] truncate font-mono text-[10.5px] text-[#9AA0AA]">
                            {row.domain}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-2.5 py-2.5">
                      <CategoryBadge category={row.category} />
                    </td>

                    <td className="px-2.5 py-2.5 font-mono text-[11px] text-[#4B5058]">
                      {row.type}
                    </td>

                    <td className="px-2.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#1F2125]/10">
                          <div
                            className="h-full rounded-full bg-[#4F46E5]"
                            style={{ width: `${Math.max(4, Math.min(100, row.yieldPct))}%` }}
                          />
                        </div>
                        <span className="tabular font-mono text-[11px] text-[#1F2125]">
                          {row.yieldPct}%
                        </span>
                      </div>
                    </td>

                    <td className="tabular px-2.5 py-2.5 text-right font-mono text-[#4B5058]">
                      {row.items}
                    </td>

                    <td className="tabular px-2.5 py-2.5 text-right font-mono font-semibold text-[#1F2125]">
                      {row.signals}
                    </td>

                    <td className="px-2.5 py-2.5 font-mono text-[11px] text-[#4B5058]">
                      {row.lastCheckedAt ? formatRelativeTime(row.lastCheckedAt) : "Not yet"}
                    </td>

                    <td className="px-2.5 py-2.5">
                      <StatusPill tone={healthTone(row.health, row.status)}>
                        {row.health || row.status}
                      </StatusPill>
                    </td>

                    <td
                      className="relative py-2.5 pl-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        aria-label={`Source actions for ${row.name}`}
                        aria-expanded={openMenuId === row.sourceId}
                        onClick={() =>
                          setOpenMenuId((prev) =>
                            prev === row.sourceId ? null : row.sourceId,
                          )
                        }
                        className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {openMenuId === row.sourceId ? (
                        <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-white/90 p-1 text-left shadow-xl">
                          <a
                            href={`https://${row.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setOpenMenuId(null)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[#1F2125] no-underline hover:bg-white"
                          >
                            <ExternalLink size={12} /> Open source
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              onManageSource(row.sourceId);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[#1F2125] hover:bg-white"
                          >
                            <Settings2 size={12} /> Manage
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null);
                              onRecheckSource(row.sourceId);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[#1F2125] hover:bg-white"
                          >
                            <RefreshCw size={12} /> Re-check
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex items-center justify-between border-t border-[#1F2125]/8 pt-3 text-xs">
        <span className="font-mono text-[11px] text-[#9AA0AA]">
          Showing {filtered.length} of {rows.length} source{rows.length === 1 ? "" : "s"}
        </span>
        <Link
          href={`/company/${companyId}/signal-stack`}
          className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
        >
          View all sources →
        </Link>
      </div>
    </GlassCard>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F6FB]/90 p-4 backdrop-blur-md sm:p-6">
        <div className="mx-auto max-w-6xl">{tableContent}</div>
      </div>
    );
  }

  return tableContent;
}
