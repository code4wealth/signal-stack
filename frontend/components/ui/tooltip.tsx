"use client";

import { useId, useState, type ReactNode } from "react";

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <div aria-describedby={open ? tooltipId : undefined}>{children}</div>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-max max-w-[230px] -translate-x-1/2 rounded-lg border border-white/80 bg-[#1C1D21]/95 px-2.5 py-1.5 text-center text-[11px] font-medium text-white shadow-lg backdrop-blur-md"
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}
