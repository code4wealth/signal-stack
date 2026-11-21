"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileText } from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import type { CollectedItem } from "@/lib/types";

export function EvidenceBlock({
  signalId,
  evidenceItem,
  verified,
  onOpenEvidence,
}: {
  signalId: number;
  evidenceItem?: CollectedItem | null;
  verified: boolean;
  onOpenEvidence?: (item: CollectedItem) => void;
}) {
  const isMissing = !evidenceItem || !evidenceItem.url;

  useEffect(() => {
    if (isMissing) {
      console.error(`[SignalStack] Missing verified evidence for signal #${signalId}`);
    }
  }, [isMissing, signalId]);

  if (isMissing) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[#DC2626]/30 bg-[#DC2626]/6 px-4 py-3 text-xs text-[#991B1B]"
      >
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={14} className="shrink-0 text-[#DC2626]" aria-hidden="true" />
          <span>Missing evidence</span>
        </div>
        <p className="mt-1 text-[11px] text-[#B91C1C]">
          No real source item was linked to this signal. Verify the crawler record before acting on it.
        </p>
      </div>
    );
  }

  const quote = evidenceItem.excerpt?.trim() || evidenceItem.title;

  return (
    <div
      data-reply-selectable="true"
      className="rounded-2xl border border-[#1F2125]/10 bg-[#F8FAFC]/90 px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4B5058]">
            <FileText size={11} aria-hidden="true" />
            Fact · Source record
          </span>
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/25 bg-[#059669]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#047857]">
              <CheckCircle2 size={10} aria-hidden="true" />
              Verified evidence
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#EA580C]/25 bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#C2410C]">
              <AlertTriangle size={10} aria-hidden="true" />
              Unverified quote
            </span>
          )}
        </div>

        <span className="font-mono text-[11px] text-[#9AA0AA]">
          {evidenceItem.domain ?? evidenceItem.sourceName ?? "Source"} ·{" "}
          {formatShortDate(evidenceItem.publishedAt || evidenceItem.fetchedAt)}
        </span>
      </div>

      <blockquote className="mt-2 border-l-2 border-[#1F2125]/15 pl-3 text-[12.5px] leading-relaxed text-[#1F2125]">
        “{quote}”
      </blockquote>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <a
          href={evidenceItem.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[75%] items-center gap-1 truncate font-mono text-[#2563EB] no-underline hover:underline"
        >
          <span className="truncate">{evidenceItem.url}</span>
          <ArrowUpRight size={11} className="shrink-0" aria-hidden="true" />
        </a>

        {onOpenEvidence ? (
          <button
            type="button"
            onClick={() => onOpenEvidence(evidenceItem)}
            className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] hover:underline"
          >
            Inspect source text
          </button>
        ) : null}
      </div>
    </div>
  );
}
