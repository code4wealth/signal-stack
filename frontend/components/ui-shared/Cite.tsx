"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ids || ids.length === 0) {
      console.error("Missing evidence: claim rendered without backend-assigned citation IDs.");
    }
  }, [ids]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

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
          <span
            key={n}
            className="relative inline-block"
            onMouseEnter={() => {
              if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
              setOpenId(n);
            }}
            onMouseLeave={() => {
              hoverTimerRef.current = window.setTimeout(() => {
                setOpenId((cur) => (cur === n ? null : cur));
              }, 160);
            }}
          >
            <button
              type="button"
              aria-label={label}
              aria-expanded={isOpen}
              onFocus={() => setOpenId(n)}
              onClick={() => {
                setOpenId((prev) => (prev === n ? null : n));
              }}
              className="focus-ring no-print inline-flex -translate-y-[1px] items-center rounded-md border border-[#4F46E5]/25 bg-[#4F46E5]/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/15"
            >
              [{n}]
            </button>
            <span className="brief-print-only font-mono text-[9.5pt] font-semibold text-[#4F46E5]">
              [{n}]{src?.url && src.url.startsWith("http") ? ` (${src.url})` : ""}
            </span>
            <AnimatePresence>
              {isOpen && src ? (
                <CitationPopover
                  source={src}
                  onClose={() => setOpenId(null)}
                  onJumpToSource={(num) => {
                    onJumpToSource?.(num);
                  }}
                />
              ) : null}
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
