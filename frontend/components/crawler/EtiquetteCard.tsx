"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import type { CrawlerOverview } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";

export function EtiquetteCard({
  companyId,
  etiquette,
  isMock,
}: {
  companyId: number;
  etiquette: CrawlerOverview["etiquette"];
  isMock?: boolean;
}) {
  return (
    <GlassCard className="flex h-full items-center justify-between gap-4 p-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5]">
            <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h2 className="text-sm font-semibold text-[#1F2125]">Crawl responsibly</h2>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>

        <p className="text-xs leading-relaxed text-[#4B5058]">
          <span className="tabular font-semibold text-[#1F2125]">
            {etiquette.blockedByRobots}
          </span>{" "}
          source{etiquette.blockedByRobots === 1 ? "" : "s"} skipped by robots.txt,{" "}
          <span className="font-mono font-medium text-[#1F2125]">
            {etiquette.delaySeconds}s
          </span>{" "}
          polite delay, public pages only.
        </p>

        <Link
          href={`/company/${companyId}/automation`}
          className="inline-flex text-xs font-medium text-[#4F46E5] no-underline hover:underline"
        >
          Read crawl policy →
        </Link>
      </div>

      {/* Decorative block-pattern illustration using the four category colors at 30% opacity */}
      <svg
        width="76"
        height="76"
        viewBox="0 0 76 76"
        aria-hidden="true"
        className="hidden shrink-0 sm:block"
      >
        <rect x="4" y="6" width="28" height="28" rx="7" fill="#0D9488" fillOpacity="0.3" />
        <rect x="40" y="6" width="28" height="28" rx="7" fill="#EA580C" fillOpacity="0.3" />
        <rect x="4" y="42" width="28" height="28" rx="7" fill="#2563EB" fillOpacity="0.3" />
        <rect x="40" y="42" width="28" height="28" rx="7" fill="#7C3AED" fillOpacity="0.3" />
      </svg>
    </GlassCard>
  );
}
