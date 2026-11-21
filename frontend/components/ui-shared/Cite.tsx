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
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

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

  const openFor = (n: number) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    const btn = buttonRefs.current[n];
    if (btn) {
      setAnchorRect(btn.getBoundingClientRect());
    }
    setOpenId(n);
  };

  const scheduleClose = (n: number) => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setOpenId((cur) => (cur === n ? null : cur));
    }, 160);
  };

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

  const activeSource = openId !== null ? sources.find((s) => s.n === openId) ?? null : null;

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
            onMouseEnter={() => openFor(n)}
            onMouseLeave={() => scheduleClose(n)}
          >
            <button
              ref={(el) => {
                buttonRefs.current[n] = el;
              }}
              type="button"
              aria-label={label}
              aria-expanded={isOpen}
              onFocus={() => openFor(n)}
              onClick={() => {
                if (isOpen) {
                  setOpenId(null);
                } else {
                  openFor(n);
                }
              }}
              className="focus-ring no-print inline-flex -translate-y-[1px] items-center rounded-md border border-[#4F46E5]/25 bg-[#4F46E5]/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/15"
            >
              [{n}]
            </button>
            <span className="brief-print-only font-mono text-[9.5pt] font-semibold text-[#4F46E5]">
              [{n}]{src?.url && src.url.startsWith("http") ? ` (${src.url})` : ""}
            </span>
          </span>
        );
      })}
      <AnimatePresence>
        {activeSource && openId !== null ? (
          <CitationPopover
            key={openId}
            source={activeSource}
            anchorRect={anchorRect}
            onMouseEnter={() => {
              if (hoverTimerRef.current !== null) {
                window.clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
              }
            }}
            onMouseLeave={() => scheduleClose(openId)}
            onClose={() => setOpenId(null)}
            onJumpToSource={(num) => {
              onJumpToSource?.(num);
            }}
          />
        ) : null}
      </AnimatePresence>
    </span>
  );
}
