"use client";

import { AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";

import type { ConfidenceLevel } from "@/lib/types";

export function ConfidenceBadge({
  level,
  label,
}: {
  level: ConfidenceLevel;
  label?: string;
}) {
  if (level === "high") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#059669]/25 bg-[#059669]/10 px-2.5 py-0.5 text-xs font-medium text-[#059669]">
        <CheckCircle2 size={13} strokeWidth={1.75} aria-hidden="true" />
        {label ?? "High confidence"}
      </span>
    );
  }
  if (level === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EA580C]/25 bg-[#EA580C]/10 px-2.5 py-0.5 text-xs font-medium text-[#C2410C]">
        <AlertCircle size={13} strokeWidth={1.75} aria-hidden="true" />
        {label ?? "Medium confidence"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#94A3B8] bg-white/60 px-2.5 py-0.5 text-xs font-medium text-[#64748B]">
      <HelpCircle size={13} strokeWidth={1.75} aria-hidden="true" />
      {label ?? "Low confidence"}
    </span>
  );
}
