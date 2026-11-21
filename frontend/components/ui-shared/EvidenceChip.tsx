"use client";

import { ExternalLink } from "lucide-react";

import { formatDomainPath, formatShortDate } from "@/lib/company-adapter";
import type { Evidence } from "@/lib/types";

export function EvidenceChip({
  evidence,
  compact = false,
}: {
  evidence: Evidence;
  compact?: boolean;
}) {
  const label = formatDomainPath(evidence.url);
  const dateLabel = formatShortDate(evidence.fetchedAt);

  return (
    <a
      href={evidence.url}
      target="_blank"
      rel="noreferrer"
      title={`${evidence.url} (fetched ${dateLabel})`}
      className={`focus-ring inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white/75 px-2.5 py-0.5 font-mono text-[11px] text-[#4B5058] no-underline transition-colors hover:border-[#2563EB]/35 hover:bg-white hover:text-[#1F2125] ${
        evidence.verified
          ? "border-[#1F2125]/10"
          : "border-dashed border-[#94A3B8]"
      }`}
    >
      <span className="max-w-[190px] truncate">{label}</span>
      {!compact && dateLabel !== "—" ? (
        <span className="shrink-0 text-[#9AA0AA]">· {dateLabel}</span>
      ) : null}
      <ExternalLink size={10} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
    </a>
  );
}
