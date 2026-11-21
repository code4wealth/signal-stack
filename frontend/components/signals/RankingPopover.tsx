"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import type { SignalPriorityReason } from "@/lib/types";

export function RankingPopover({
  priorityValue,
  reasons,
}: {
  priorityValue: number;
  reasons: SignalPriorityReason[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Inspect priority score breakdown"
        className="focus-ring inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-[11px] text-[#4B5058] transition-colors hover:bg-white/80 hover:text-[#1F2125]"
      >
        <Info size={12} aria-hidden="true" />
        <span className="tabular">{priorityValue}/100</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Priority ranking breakdown"
          className="glass-strong absolute right-0 top-full z-30 mt-1.5 w-64 rounded-2xl border border-white/90 p-3.5 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-[#1F2125]/8 pb-2">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4B5058]">
              Priority breakdown
            </span>
            <span className="tabular font-mono text-xs font-semibold text-[#1F2125]">
              {priorityValue}/100
            </span>
          </div>
          <ul className="mt-2.5 space-y-2">
            {reasons.map((r) => (
              <li key={r.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#4B5058]">{r.label}</span>
                  <span className="tabular font-mono font-semibold text-[#1F2125]">{r.weight}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1F2125]/8">
                  <div
                    className="h-full rounded-full bg-[#4F46E5]"
                    style={{ width: `${Math.max(4, Math.min(100, r.weight))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring mt-3 w-full rounded-lg bg-[#F4F6FB] py-1 text-[11px] font-medium text-[#4B5058] hover:text-[#1F2125]"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
