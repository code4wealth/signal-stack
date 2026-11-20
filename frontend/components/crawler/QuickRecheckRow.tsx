"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Clock, Loader2, ShieldAlert } from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import type { CrawlerOverview } from "@/lib/types";

export function QuickRecheckRow({
  companyId,
  items,
  recheckingIds,
  onRecheck,
}: {
  companyId: number;
  items: CrawlerOverview["quickRecheck"];
  recheckingIds: Set<number>;
  onRecheck: (sourceId: number) => void;
}) {
  const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());

  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5 pt-1">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
          Quick recheck
        </p>
        <Link
          href={`/company/${companyId}/signal-stack`}
          className="text-xs font-medium text-[#4F46E5] no-underline hover:underline"
        >
          More →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {items.map((item) => {
          const numId = Number(item.sourceId);
          const isChecking = recheckingIds.has(numId);
          const initial = (item.name || item.domain || "S").charAt(0).toUpperCase();
          const showFallback = failedIcons.has(item.sourceId) || !item.domain;

          const statusDot =
            item.status === "blocked" ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#DC2626] text-white ring-2 ring-white">
                <ShieldAlert size={9} aria-hidden="true" />
              </span>
            ) : item.status === "failing" ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#EA580C] text-white ring-2 ring-white">
                <AlertCircle size={9} aria-hidden="true" />
              </span>
            ) : !item.lastCheckedAt ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#64748B] text-white ring-2 ring-white">
                <Clock size={9} aria-hidden="true" />
              </span>
            ) : (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#059669] text-white ring-2 ring-white">
                <Check size={9} strokeWidth={2.5} aria-hidden="true" />
              </span>
            );

          return (
            <button
              key={item.sourceId}
              type="button"
              disabled={isChecking || !Number.isFinite(numId)}
              onClick={() => onRecheck(numId)}
              title={`${item.name}: last checked ${formatRelativeTime(item.lastCheckedAt)}`}
              aria-label={`Recheck ${item.name}, last checked ${formatRelativeTime(item.lastCheckedAt)}`}
              className="focus-ring group relative flex h-10 w-10 items-center justify-center rounded-full border border-white/90 bg-white/85 shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {isChecking ? (
                <Loader2 size={15} className="animate-spin text-[#4F46E5]" />
              ) : showFallback ? (
                <span className="text-xs font-semibold text-[#1F2125]">{initial}</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.domain)}&sz=64`}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded object-contain"
                  onError={() =>
                    setFailedIcons((prev) => new Set(prev).add(item.sourceId))
                  }
                />
              )}
              <span className="absolute -bottom-0.5 -right-0.5">{statusDot}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
