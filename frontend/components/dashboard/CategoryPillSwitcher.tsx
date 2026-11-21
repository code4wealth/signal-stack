"use client";

import { motion } from "framer-motion";
import { FileSpreadsheet, Globe, Layers, Swords, Users } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { FAST_TRANSITION, springSoft } from "@/lib/motion";
import type { DashboardKpi, SourceCategory } from "@/lib/types";

type PillKey = "all" | SourceCategory;

const PILLS: {
  key: PillKey;
  label: string;
  Icon: typeof Layers;
  iconColor: string;
}[] = [
  { key: "all", label: "All", Icon: Layers, iconColor: "text-[#4F46E5]" },
  { key: "customers", label: "Customers", Icon: Users, iconColor: "text-[#0D9488]" },
  { key: "competitors", label: "Competitors", Icon: Swords, iconColor: "text-[#EA580C]" },
  { key: "market", label: "Market", Icon: Globe, iconColor: "text-[#2563EB]" },
  { key: "internal", label: "Internal", Icon: FileSpreadsheet, iconColor: "text-[#7C3AED]" },
];

export function CategoryPillSwitcher({
  activeCategory,
  kpis,
  totalSignals,
  onChange,
}: {
  activeCategory: SourceCategory | null;
  kpis: DashboardKpi[];
  totalSignals: number;
  onChange: (next: SourceCategory | null) => void;
}) {
  const { reduced } = useMotionSafe();
  const activeKey: PillKey = activeCategory ?? "all";

  const countFor = (key: PillKey): number => {
    if (key === "all") return totalSignals;
    return kpis.find((k) => k.category === key)?.newSignals ?? 0;
  };

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % PILLS.length
        : (idx - 1 + PILLS.length) % PILLS.length;
    const next = PILLS[nextIdx];
    if (next) onChange(next.key === "all" ? null : next.key);
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={FAST_TRANSITION}
      className="flex justify-center"
    >
      <div
        role="tablist"
        aria-label="Filter dashboard by Signal Stack category"
        className="glass-strong inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5"
      >
        {PILLS.map((pill, idx) => {
          const isActive = activeKey === pill.key;
          const Icon = pill.Icon;
          const count = countFor(pill.key);
          return (
            <button
              key={pill.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onClick={() => onChange(pill.key === "all" ? null : pill.key)}
              className={`focus-ring relative inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive ? "text-white" : "text-[#4B5058] hover:text-[#1F2125]"
              }`}
            >
              {isActive ? (
                <motion.span
                  layoutId={reduced ? undefined : "dash-cat-pill"}
                  transition={reduced ? FAST_TRANSITION : springSoft}
                  className="absolute inset-0 rounded-full bg-[#1C1D21] shadow-sm"
                />
              ) : null}

              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon
                  size={13}
                  strokeWidth={1.9}
                  className={isActive ? "text-white" : pill.iconColor}
                  aria-hidden="true"
                />
                <span>{pill.label}</span>
                <span
                  className={`tabular rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-white/80 text-[#4B5058]"
                  }`}
                >
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
