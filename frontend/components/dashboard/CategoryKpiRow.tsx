"use client";

import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Globe,
  Minus,
  Swords,
  Users,
} from "lucide-react";

import { CountUp } from "@/components/motion/CountUp";
import { GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { staggerContainer } from "@/lib/motion";
import type { DashboardKpi, SourceCategory } from "@/lib/types";
import { MiniBarSparkline } from "./MiniBarSparkline";

const CATEGORY_CONFIG: Record<
  SourceCategory,
  {
    label: string;
    color: string;
    bg: string;
    Icon: typeof Users;
  }
> = {
  customers: {
    label: "Customers",
    color: "#0D9488",
    bg: "bg-[#0D9488]/10 text-[#0D9488]",
    Icon: Users,
  },
  competitors: {
    label: "Competitors",
    color: "#EA580C",
    bg: "bg-[#EA580C]/10 text-[#EA580C]",
    Icon: Swords,
  },
  market: {
    label: "Market",
    color: "#2563EB",
    bg: "bg-[#2563EB]/10 text-[#2563EB]",
    Icon: Globe,
  },
  internal: {
    label: "Internal",
    color: "#7C3AED",
    bg: "bg-[#7C3AED]/10 text-[#7C3AED]",
    Icon: FileSpreadsheet,
  },
};

function TrendLine({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#9AA0AA]">
        <Minus size={11} aria-hidden="true" />
        <span>No previous data</span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#15803D]">
        <ArrowUpRight size={12} aria-hidden="true" />
        <span>▲ {delta}% more than prior</span>
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#B91C1C]">
        <ArrowDownRight size={12} aria-hidden="true" />
        <span>▼ {Math.abs(delta)}% fewer than prior</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#4B5058]">
      <Minus size={11} aria-hidden="true" />
      <span>Same as prior period</span>
    </span>
  );
}

export function CategoryKpiRow({
  kpis,
  activeCategory,
  onSelectCategory,
}: {
  kpis: DashboardKpi[];
  activeCategory: SourceCategory | null;
  onSelectCategory: (cat: SourceCategory) => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <motion.section
      aria-label="Category KPI overview"
      variants={staggerContainer(reduced, 60)}
      initial="hidden"
      animate="visible"
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-4"
    >
      {kpis.map((kpi) => {
        const meta = CATEGORY_CONFIG[kpi.category];
        const Icon = meta.Icon;
        const isActive = activeCategory === kpi.category;

        return (
          <div key={kpi.category} className="min-w-[260px] snap-start md:min-w-0">
            <button
              type="button"
              onClick={() => onSelectCategory(kpi.category)}
              className="focus-ring block h-full w-full rounded-2xl text-left"
            >
              <GlassCard
                spotlight
                interactive
                className={`flex h-full flex-col justify-between gap-3 p-4 sm:p-5 ${
                  isActive ? "ring-2 ring-[#4F46E5]/50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}
                      aria-hidden="true"
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="text-xs font-semibold text-[#1F2125]">{meta.label}</span>
                  </div>

                  {kpi.category === "internal" &&
                  typeof kpi.filesAnalysed === "number" ? (
                    <span className="rounded-full bg-[#7C3AED]/10 px-2 py-0.5 font-mono text-[10px] font-medium text-[#7C3AED]">
                      {kpi.filesAnalysed} file{kpi.filesAnalysed === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-3xl font-semibold tracking-[-0.03em] text-[#1F2125]">
                      <CountUp value={kpi.newSignals} />
                    </p>
                    <TrendLine delta={kpi.deltaPct} />
                  </div>

                  <MiniBarSparkline values={kpi.spark} color={meta.color} />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[#1F2125]/8 pt-2.5 font-mono text-[11px] text-[#4B5058]">
                  <span className="text-[#15803D]">
                    {kpi.opportunities} opportunit{kpi.opportunities === 1 ? "y" : "ies"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#B91C1C]">
                    {kpi.threats} threat{kpi.threats === 1 ? "" : "s"}
                  </span>
                </div>
              </GlassCard>
            </button>
          </div>
        );
      })}
    </motion.section>
  );
}
