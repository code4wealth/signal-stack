"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Globe, Target, Users } from "lucide-react";

import type { CrawlerCoverageRow, SourceCategory } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";

const CAT_CONFIG: Record<
  SourceCategory,
  { label: string; Icon: typeof Users; tileClass: string; barColor: string }
> = {
  customers: {
    label: "Customers",
    Icon: Users,
    tileClass: "bg-[#0D9488]/12 text-[#0D9488]",
    barColor: "#0D9488",
  },
  competitors: {
    label: "Competitors",
    Icon: Target,
    tileClass: "bg-[#EA580C]/12 text-[#EA580C]",
    barColor: "#EA580C",
  },
  market: {
    label: "Market",
    Icon: Globe,
    tileClass: "bg-[#2563EB]/12 text-[#2563EB]",
    barColor: "#2563EB",
  },
  internal: {
    label: "Internal",
    Icon: FileText,
    tileClass: "bg-[#7C3AED]/12 text-[#7C3AED]",
    barColor: "#7C3AED",
  },
};

export function CategoryCoverage({
  companyId,
  coverage,
  allTimeCoverage,
  isMock,
}: {
  companyId: number;
  coverage: CrawlerCoverageRow[];
  allTimeCoverage?: CrawlerCoverageRow[];
  isMock?: boolean;
}) {
  const [scope, setScope] = useState<"this_run" | "all_time">("this_run");

  const rows =
    scope === "all_time" && allTimeCoverage && allTimeCoverage.length > 0
      ? allTimeCoverage
      : coverage;

  return (
    <GlassCard className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[#1F2125]">Category coverage</h2>
          {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
        </div>

        <div className="inline-flex rounded-xl border border-white/80 bg-white/75 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setScope("this_run")}
            className={`rounded-lg px-2 py-0.5 font-medium ${
              scope === "this_run" ? "bg-[#1C1D21] text-white" : "text-[#4B5058]"
            }`}
          >
            This run
          </button>
          <button
            type="button"
            onClick={() => setScope("all_time")}
            className={`rounded-lg px-2 py-0.5 font-medium ${
              scope === "all_time" ? "bg-[#1C1D21] text-white" : "text-[#4B5058]"
            }`}
          >
            All time
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          const cfg = CAT_CONFIG[row.category];
          const Icon = cfg.Icon;
          const pct =
            row.approved > 0
              ? Math.min(100, Math.round((row.checked / row.approved) * 100))
              : 0;
          const isInternal = row.category === "internal";

          return (
            <li key={row.category} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${cfg.tileClass}`}
                    aria-hidden="true"
                  >
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <span className="font-medium text-[#1F2125]">{cfg.label}</span>
                </div>
                <span className="tabular font-mono text-[11px] text-[#4B5058]">
                  {isInternal
                    ? `${row.checked}/${row.approved} analysed`
                    : `${row.checked}/${row.approved} checked`}
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: cfg.barColor }}
                />
              </div>

              <p className="text-[11px] text-[#9AA0AA]">
                {isInternal
                  ? row.approved === 0
                    ? "No internal files uploaded"
                    : `${row.newItems} extracted signals`
                  : row.checked === 0
                    ? "Not checked yet"
                    : `${row.newItems} new item${row.newItems === 1 ? "" : "s"}`}
              </p>
            </li>
          );
        })}
      </ul>

      <Link
        href={`/company/${companyId}/signal-stack`}
        className="focus-ring inline-flex h-8 w-full items-center justify-center rounded-xl border border-white/80 bg-white/75 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
      >
        Manage sources
      </Link>
    </GlassCard>
  );
}
