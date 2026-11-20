"use client";

import type { ReactNode } from "react";

type Tone = "neutral" | "verified" | "opportunity" | "threat" | "warning" | "info";

const TONE_MAP: Record<Tone, string> = {
  neutral: "border-[#1F2125]/12 bg-white/75 text-[#4B5058]",
  verified: "border-[#059669]/25 bg-[#059669]/10 text-[#059669]",
  opportunity: "border-[#16A34A]/25 bg-[#16A34A]/10 text-[#15803D]",
  threat: "border-[#DC2626]/25 bg-[#DC2626]/10 text-[#B91C1C]",
  warning: "border-[#EA580C]/25 bg-[#EA580C]/10 text-[#C2410C]",
  info: "border-[#2563EB]/25 bg-[#2563EB]/10 text-[#1D4ED8]",
};

export function StatusPill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_MAP[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
