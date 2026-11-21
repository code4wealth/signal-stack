"use client";

import { AlertTriangle, Minus, TrendingUp } from "lucide-react";

import type { SignalClassification } from "@/lib/types";

const CONFIG: Record<
  SignalClassification,
  {
    label: string;
    bg: string;
    border: string;
    text: string;
    Icon: typeof TrendingUp;
  }
> = {
  opportunity: {
    label: "Opportunity",
    bg: "bg-[#16A34A]/10",
    border: "border-[#16A34A]/25",
    text: "text-[#15803D]",
    Icon: TrendingUp,
  },
  threat: {
    label: "Threat",
    bg: "bg-[#DC2626]/10",
    border: "border-[#DC2626]/25",
    text: "text-[#B91C1C]",
    Icon: AlertTriangle,
  },
  neutral: {
    label: "Neutral",
    bg: "bg-[#64748B]/10",
    border: "border-[#64748B]/25",
    text: "text-[#475569]",
    Icon: Minus,
  },
};

export function ClassificationPill({
  classification,
  compact = false,
}: {
  classification: SignalClassification;
  compact?: boolean;
}) {
  const meta = CONFIG[classification] ?? CONFIG.neutral;
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${meta.bg} ${meta.border} ${meta.text} ${
        compact ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-0.5 text-[11px]"
      }`}
    >
      <Icon size={11} strokeWidth={2.2} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
