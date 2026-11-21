"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Pencil, Sparkles, X } from "lucide-react";

import type { Evidence } from "@/lib/types";
import { formatRelativeTime } from "@/lib/company-adapter";
import { EvidenceChip, GlassCard } from "@/components/ui-shared";

function renderSummaryWithBoldCompany(summary: string, companyName: string): ReactNode {
  if (!summary) return null;
  if (!companyName.trim()) return summary;
  const idx = summary.toLowerCase().indexOf(companyName.trim().toLowerCase());
  if (idx === -1) return summary;
  const before = summary.slice(0, idx);
  const match = summary.slice(idx, idx + companyName.trim().length);
  const after = summary.slice(idx + companyName.trim().length);
  return (
    <>
      {before}
      <strong className="font-semibold text-[#1F2125]">{match}</strong>
      {after}
    </>
  );
}

export function AiSummaryCard({
  companyName,
  summary,
  updatedAt,
  evidence,
  onSaveSummary,
}: {
  companyName: string;
  summary: string;
  updatedAt?: string | null;
  evidence: Evidence[];
  onSaveSummary: (nextSummary: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary);

  useEffect(() => {
    setDraft(summary);
  }, [summary]);

  function commit() {
    const cleaned = draft.trim();
    setEditing(false);
    if (cleaned && cleaned !== summary) {
      onSaveSummary(cleaned);
    }
  }

  return (
    <GlassCard interactive>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5]"
            aria-hidden="true"
          >
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#1F2125]">
            AI company summary
          </h2>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] text-[#9AA0AA]">
            Updated {formatRelativeTime(updatedAt)}
          </span>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit AI company summary"
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg border border-white/80 bg-white/70 text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
            >
              <Pencil size={13} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-2.5">
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(summary);
                setEditing(false);
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                commit();
              }
            }}
            aria-label="Edit company summary"
            className="focus-ring w-full rounded-xl border border-[#4F46E5]/35 bg-white/90 p-3 text-sm leading-relaxed text-[#1F2125] outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(summary);
                setEditing(false);
              }}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl px-3 text-xs font-medium text-[#4B5058] hover:bg-white/80"
            >
              <X size={13} /> Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white hover:bg-[#2a2c32]"
            >
              <Check size={13} /> Save summary
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3.5 max-w-[70ch] text-sm leading-relaxed text-[#4B5058]">
          {summary ? (
            renderSummaryWithBoldCompany(summary, companyName)
          ) : (
            <span className="italic text-[#9AA0AA]">
              Not found on public sources. Click the pencil icon to add a company summary manually.
            </span>
          )}
        </p>
      )}

      {evidence.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {evidence.slice(0, 6).map((item) => (
            <EvidenceChip key={item.id} evidence={item} />
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-[#9AA0AA]">
        Generated from public pages only. Review and correct anything that looks wrong.
      </p>
    </GlassCard>
  );
}
