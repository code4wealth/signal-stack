"use client";

import { motion, useReducedMotion } from "framer-motion";
import { FileText, Globe, Target, Users } from "lucide-react";

import { fadeUp } from "@/lib/motion";
import type { SignalStackSource, SourceCategory, UploadedFile } from "@/lib/types";
import { StatCard } from "@/components/ui-shared";

const CATEGORY_CARDS: {
  key: SourceCategory;
  label: string;
  Icon: typeof Users;
  iconColor: string;
  iconBg: string;
  ringClass: string;
}[] = [
  {
    key: "customers",
    label: "Customers",
    Icon: Users,
    iconColor: "text-[#0D9488]",
    iconBg: "bg-[#0D9488]/12",
    ringClass: "ring-2 ring-[#0D9488]",
  },
  {
    key: "competitors",
    label: "Competitors",
    Icon: Target,
    iconColor: "text-[#EA580C]",
    iconBg: "bg-[#EA580C]/12",
    ringClass: "ring-2 ring-[#EA580C]",
  },
  {
    key: "market",
    label: "Market",
    Icon: Globe,
    iconColor: "text-[#2563EB]",
    iconBg: "bg-[#2563EB]/12",
    ringClass: "ring-2 ring-[#2563EB]",
  },
  {
    key: "internal",
    label: "Internal",
    Icon: FileText,
    iconColor: "text-[#7C3AED]",
    iconBg: "bg-[#7C3AED]/12",
    ringClass: "ring-2 ring-[#7C3AED]",
  },
];

export function CategorySummaryRow({
  sources,
  internalFiles,
  activeCategory,
  onSelectCategory,
}: {
  sources: SignalStackSource[];
  internalFiles: UploadedFile[];
  activeCategory: SourceCategory | "all";
  onSelectCategory: (cat: SourceCategory | "all") => void;
}) {
  const reduced = Boolean(useReducedMotion());

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {CATEGORY_CARDS.map((card) => {
        const Icon = card.Icon;
        const isInternal = card.key === "internal";
        const catSources = sources.filter((s) => s.category === card.key);
        const total = isInternal ? internalFiles.length : catSources.length;
        const approvedCount = isInternal
          ? internalFiles.filter((f) => f.status !== "failed").length
          : catSources.filter((s) => s.status === "approved").length;
        const isActive = activeCategory === card.key;

        return (
          <StatCard
            key={card.key}
            icon={<Icon size={17} strokeWidth={1.75} className={card.iconColor} />}
            iconBg={card.iconBg}
            label={card.label}
            value={total}
            footer={isInternal ? `${approvedCount} uploaded` : `${approvedCount} approved`}
            activeRingClass={isActive ? card.ringClass : undefined}
            onClick={() => onSelectCategory(isActive ? "all" : card.key)}
          />
        );
      })}
    </motion.div>
  );
}
