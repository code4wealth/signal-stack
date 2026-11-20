"use client";

import { FileText, Globe, Plus, Target, Users } from "lucide-react";

export function AddSourcePromoCard({ onOpenAddSource }: { onOpenAddSource: () => void }) {
  return (
    <article className="glass-strong flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-br from-white/85 via-white/70 to-[#EEF2FF]/75 p-5">
      <div className="space-y-4">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0D9488]/12 text-[#0D9488]">
            <Users size={15} strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EA580C]/12 text-[#EA580C]">
            <Target size={15} strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563EB]/12 text-[#2563EB]">
            <Globe size={15} strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7C3AED]/12 text-[#7C3AED]">
            <FileText size={15} strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#94A3B8] bg-white/75 text-[#4B5058]">
            <Plus size={15} strokeWidth={1.75} />
          </span>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[#1F2125]">Know a source we missed?</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#4B5058]">
            Add a website, RSS feed or government page and we will check that it can be monitored.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenAddSource}
        className="btn-motion focus-ring inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_8px_18px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32]"
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        Add source
      </button>
    </article>
  );
}
