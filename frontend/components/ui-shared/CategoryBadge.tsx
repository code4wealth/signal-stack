"use client";

import { FileText, Globe, Swords, Users } from "lucide-react";

import type { SourceCategory } from "@/lib/types";

const CATEGORY_MAP: Record<
  SourceCategory,
  { label: string; colorClass: string; Icon: typeof Users }
> = {
  customers: {
    label: "Customers",
    colorClass: "border-[#0D9488]/25 bg-[#0D9488]/10 text-[#0F766E]",
    Icon: Users,
  },
  competitors: {
    label: "Competitors",
    colorClass: "border-[#EA580C]/25 bg-[#EA580C]/10 text-[#C2410C]",
    Icon: Swords,
  },
  market: {
    label: "Market",
    colorClass: "border-[#2563EB]/25 bg-[#2563EB]/10 text-[#1D4ED8]",
    Icon: Globe,
  },
  internal: {
    label: "Internal",
    colorClass: "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#6D28D9]",
    Icon: FileText,
  },
};

export function CategoryBadge({ category }: { category: SourceCategory }) {
  const cfg = CATEGORY_MAP[category];
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.colorClass}`}
    >
      <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
