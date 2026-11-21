"use client";

import { ArrowRight, CheckCircle2, Pencil } from "lucide-react";

export function ConfirmBar({
  confirmedAt,
  confirming,
  onEditDetails,
  onConfirm,
}: {
  confirmedAt?: string | null;
  confirming: boolean;
  onEditDetails: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="glass-strong sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        {confirmedAt ? (
          <CheckCircle2 size={16} className="shrink-0 text-[#059669]" aria-hidden="true" />
        ) : null}
        <p className="text-xs font-medium text-[#1F2125]">
          {confirmedAt
            ? "Profile confirmed. Ready for your adaptive founder interview."
            : "Does this look right?"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEditDetails}
          className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] hover:bg-white"
        >
          <Pencil size={13} strokeWidth={1.75} /> Edit details
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_8px_18px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32] disabled:opacity-50"
        >
          {confirming ? "Saving…" : "Looks right, start interview"}
          <ArrowRight size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
