"use client";

import { useReducedMotion } from "framer-motion";

export function ThinkingState({ status }: { status?: string | null }) {
  const reduced = Boolean(useReducedMotion());
  const label = status || "Preparing the next question...";

  return (
    <div className="flex items-center gap-3 pl-11 py-1" aria-live="polite">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className={`shrink-0 text-[#4F46E5] ${reduced ? "" : "animate-spin"}`}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
      </svg>
      <span className={`text-sm font-medium ${reduced ? "text-[#4B5058]" : "text-shimmer"}`}>
        {label}
      </span>
    </div>
  );
}
