"use client";

import { Reply, X } from "lucide-react";

export function QuoteChip({
  text,
  onRemove,
}: {
  text: string;
  onRemove: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#EEF2FF] px-3 py-1.5 text-xs text-[#4338CA]">
      <div className="flex min-w-0 items-center gap-2">
        <Reply size={13} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        <span className="truncate italic">&ldquo;{text}&rdquo;</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove quoted text"
        className="focus-ring shrink-0 rounded-md p-0.5 text-[#4338CA]/75 hover:bg-white/70 hover:text-[#4338CA]"
      >
        <X size={13} />
      </button>
    </div>
  );
}
