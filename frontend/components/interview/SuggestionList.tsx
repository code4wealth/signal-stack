"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CornerDownRight, X } from "lucide-react";

import { fadeUp, staggerContainer } from "@/lib/motion";

export function SuggestionList({
  suggestions,
  onSelect,
  onClose,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
  onClose: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions]);

  if (suggestions.length === 0) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      const picked = suggestions[activeIndex];
      if (picked) {
        event.preventDefault();
        onSelect(picked);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      onKeyDown={handleKeyDown}
      className="glass mb-2.5 rounded-2xl p-2.5"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1.5">
        <span className="text-[11px] font-medium text-[#4B5058]">
          Suggested answers (from your research). Edit before sending.
        </span>

        <div className="flex items-center gap-2 font-mono text-[11px] text-[#9AA0AA]">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-[#1F2125]/12 bg-white/80 px-1 py-0.5 text-[10px]">↑↓</kbd>
            to navigate
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <kbd className="rounded border border-[#1F2125]/12 bg-white/80 px-1 py-0.5 text-[10px]">↵</kbd>
            to select
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <kbd className="rounded border border-[#1F2125]/12 bg-white/80 px-1 py-0.5 text-[10px]">esc</kbd>
            to close
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suggested answers"
            className="focus-ring rounded p-0.5 text-[#9AA0AA] hover:text-[#1F2125]"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <motion.div
        role="listbox"
        aria-label="Suggested answers"
        aria-activedescendant={`suggestion-opt-${activeIndex}`}
        variants={staggerContainer(reduced)}
        initial="hidden"
        animate="visible"
        className="space-y-1"
      >
        {suggestions.map((item, idx) => {
          const highlighted = idx === activeIndex;
          return (
            <motion.button
              key={item}
              id={`suggestion-opt-${idx}`}
              role="option"
              type="button"
              aria-selected={highlighted}
              tabIndex={highlighted ? 0 : -1}
              variants={fadeUp(reduced)}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => onSelect(item)}
              className={`focus-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                highlighted
                  ? "bg-white text-[#1F2125] shadow-[0_4px_12px_rgba(31,33,37,0.05)]"
                  : "text-[#4B5058] hover:bg-white/60 hover:text-[#1F2125]"
              }`}
            >
              <CornerDownRight
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-[#4F46E5]"
                aria-hidden="true"
              />
              <span className="flex-1 leading-snug">{item}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
