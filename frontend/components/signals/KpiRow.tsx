"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Minus,
  Radar,
  TrendingUp,
} from "lucide-react";

import type { SignalsOverviewResponse } from "@/lib/types";
import { StatCard } from "@/components/ui-shared";

function DeltaIndicator({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-[#9AA0AA]">
        <Minus size={11} aria-hidden="true" />
        <span>No prior baseline</span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[10.5px] font-medium text-[#15803D]">
        <ArrowUpRight size={11} aria-hidden="true" />
        <span>Up {delta}% vs prev</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[10.5px] font-medium text-[#B91C1C]">
        <ArrowDownRight size={11} aria-hidden="true" />
        <span>Down {Math.abs(delta)}% vs prev</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10.5px] text-[#4B5058]">
      <Minus size={11} aria-hidden="true" />
      <span>Unchanged</span>
    </span>
  );
}

export function KpiRow({
  overview,
  onFilterFeed,
}: {
  overview: SignalsOverviewResponse;
  onFilterFeed: (preset: {
    classification?: "opportunity" | "threat" | "all";
    minPriority?: number;
    status?: "new" | "all";
  }) => void;
}) {
  const { kpis } = overview;

  return (
    <section
      aria-label="Signals key metrics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <StatCard
        icon={<Radar size={16} className="text-[#4F46E5]" />}
        iconBg="bg-[#4F46E5]/10"
        label="New signals"
        value={kpis.newSignals}
        badge={<DeltaIndicator delta={kpis.deltaPct.newSignals} />}
        footer={`${overview.sourcesUsed} active source${overview.sourcesUsed === 1 ? "" : "s"}`}
        onClick={() => onFilterFeed({ classification: "all", minPriority: 1, status: "all" })}
      />

      <StatCard
        icon={<TrendingUp size={16} className="text-[#16A34A]" />}
        iconBg="bg-[#16A34A]/10"
        label="Opportunities"
        value={kpis.opportunities}
        badge={<DeltaIndicator delta={kpis.deltaPct.opportunities} />}
        footer={`${kpis.highPriorityOpportunities} high-priority`}
        onClick={() => onFilterFeed({ classification: "opportunity", minPriority: 1, status: "all" })}
      />

      <StatCard
        icon={<AlertTriangle size={16} className="text-[#DC2626]" />}
        iconBg="bg-[#DC2626]/10"
        label="Threats"
        value={kpis.threats}
        badge={<DeltaIndicator delta={kpis.deltaPct.threats} />}
        footer={`${kpis.highPriorityThreats} high-priority`}
        onClick={() => onFilterFeed({ classification: "threat", minPriority: 1, status: "all" })}
      />

      <StatCard
        icon={<BellRing size={16} className="text-[#EA580C]" />}
        iconBg="bg-[#EA580C]/10"
        label="Needs attention"
        value={kpis.needsAttention}
        badge={<DeltaIndicator delta={kpis.deltaPct.needsAttention} />}
        footer="Priority 4–5 & unreviewed"
        onClick={() => onFilterFeed({ classification: "all", minPriority: 4, status: "new" })}
      />

      <StatCard
        icon={<CheckCircle2 size={16} className="text-[#059669]" />}
        iconBg="bg-[#059669]/10"
        label="Evidence coverage"
        value={`${kpis.evidenceCoveragePct}%`}
        footer="Quotes verified verbatim"
      />
    </section>
  );
}
