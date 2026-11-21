"use client";

import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, Pencil, X } from "lucide-react";

import type { CrawlerOverview } from "@/lib/types";
import { GlassCard, StatusPill } from "@/components/ui-shared";

export function CrawlBudgetBar({
  budget,
  isMock,
  isSaving,
  onSaveLimit,
}: {
  budget: CrawlerOverview["budget"];
  isMock?: boolean;
  isSaving: boolean;
  onSaveLimit: (maxPagesPerRun: number) => Promise<unknown>;
}) {
  const reduced = Boolean(useReducedMotion());
  const [editing, setEditing] = useState(false);
  const [draftLimit, setDraftLimit] = useState(String(budget?.pagesLimit ?? 40));

  if (!budget) return null;

  const pct =
    budget.pagesLimit > 0
      ? Math.min(100, Math.round((budget.pagesUsed / budget.pagesLimit) * 100))
      : 0;

  return (
    <GlassCard className="relative flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#1F2125]">Crawl budget</h2>
            {isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
          </div>
          <p className="mt-0.5 text-xs text-[#4B5058]">
            Pages fetched this {budget.period}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setDraftLimit(String(budget.pagesLimit));
            setEditing((e) => !e);
          }}
          aria-label="Edit max pages per run"
          className="focus-ring rounded-lg border border-white/80 bg-white/75 p-1.5 text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
        >
          <Pencil size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-[#EEF2FF]">
          <div
            className="h-full rounded-full bg-[#4F46E5]"
            style={{
              width: `${pct}%`,
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 6px, transparent 6px, transparent 12px)",
              transition: reduced ? "none" : "width 400ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="tabular font-semibold text-[#1F2125]">
            {budget.pagesUsed} <span className="font-normal text-[#9AA0AA]">used</span>
          </span>
          <span className="tabular text-[#4B5058]">{budget.pagesLimit} limit</span>
        </div>
      </div>

      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = Number(draftLimit);
            if (!Number.isFinite(parsed) || parsed < 1) return;
            await onSaveLimit(Math.min(500, Math.round(parsed)));
            setEditing(false);
          }}
          className="glass-strong flex items-center gap-2 rounded-xl p-2"
        >
          <label htmlFor="budget-limit-input" className="text-[11px] font-medium text-[#4B5058]">
            Max pages:
          </label>
          <input
            id="budget-limit-input"
            type="number"
            min={1}
            max={500}
            value={draftLimit}
            onChange={(e) => setDraftLimit(e.target.value)}
            className="focus-ring h-7 w-20 rounded-lg border border-[#1F2125]/15 bg-white px-2 font-mono text-xs text-[#1F2125] outline-none"
          />
          <button
            type="submit"
            disabled={isSaving}
            aria-label="Save budget limit"
            className="rounded-lg bg-[#1C1D21] p-1 text-white disabled:opacity-50"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel budget edit"
            className="rounded-lg p-1 text-[#9AA0AA] hover:text-[#1F2125]"
          >
            <X size={13} />
          </button>
        </form>
      ) : null}
    </GlassCard>
  );
}
