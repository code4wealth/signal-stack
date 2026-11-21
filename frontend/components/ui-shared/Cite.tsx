"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import type { BriefSourceItem } from "@/lib/types";
import { CitationPopover } from "./CitationPopover";

export function Cite({
  ids,
  sources = [],
  onJumpToSource,
}: {
  ids: number[];
  sources?: BriefSourceItem[];
  onJumpToSource?: (n: number, originId?: string) => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (!ids || ids.length === 0) {
      console.error("Missing evidence: claim rendered without backend-assigned citation IDs.");
    }
  }, [ids]);

  if (!ids || ids.length === 0) {
    return (
      <span
        className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-[#DC2626]/30 bg-[#DC2626]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#B91C1C]"
        role="status"
      >
        <AlertTriangle size={11} aria-hidden="true" />
        Missing evidence
      </span>
    );
  }

  return (
    <span className="relative ml-1 inline-flex flex-wrap items-center gap-1 align-baseline">
      {ids.map((n) => {
        const src = sources.find((s) => s.n === n);
        const label = src ? `Source ${n}: ${src.title}` : `Source ${n}`;
        const isOpen = openId === n;
        return (
          <span key={n} className="relative inline-block">
            <button
              type="button"
              aria-label={label}
              aria-expanded={isOpen}
              onClick={() => setOpenId((prev) => (prev === n ? null : n))}
              className="focus-ring no-print inline-flex items-center rounded-md border border-[#4F46E5]/25 bg-[#4F46E5]/8 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold leading-none text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/15"
            >
              [{n}]
            </button>
            <span className="brief-print-only font-mono text-[9.5pt] font-semibold text-[#4F46E5]">
              [{n}]{src?.url && src.url.startsWith("http") ? ` (${src.url})` : ""}
            </span>
            {isOpen && src ? (
              <CitationPopover
                source={src}
                onClose={() => setOpenId(null)}
                onJumpToSource={(num) => {
                  onJumpToSource?.(num);
                }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
