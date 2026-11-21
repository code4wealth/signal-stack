"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { BASE_TRANSITION, fadeUp } from "@/lib/motion";

export type CompanyTabKey =
  | "overview"
  | "services"
  | "customers"
  | "competitors"
  | "evidence"
  | "log";

export type CompanyTabDef = {
  key: CompanyTabKey;
  label: string;
  count?: number;
};

export function CompanyTabs({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: CompanyTabDef[];
  activeTab: CompanyTabKey;
  onSelect: (tab: CompanyTabKey) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const listRef = useRef<HTMLDivElement | null>(null);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;
    const target = tabs[nextIndex];
    if (!target) return;
    event.preventDefault();
    onSelect(target.key);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  }

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      ref={listRef}
      role="tablist"
      aria-label="Company profile sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-[#1F2125]/10 pb-0.5"
    >
      {tabs.map((tab, idx) => {
        const selected = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, idx)}
            className={`focus-ring relative shrink-0 px-3 py-2.5 text-xs font-medium transition-colors ${
              selected ? "text-[#1F2125]" : "text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? (
                <span
                  className={`tabular rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    selected
                      ? "bg-[#1F2125]/10 text-[#1F2125]"
                      : "bg-white/75 text-[#4B5058]"
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </span>

            {selected ? (
              <motion.span
                layoutId={reduced ? undefined : "company-tab-underline"}
                transition={BASE_TRANSITION}
                className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[#1C1D21]"
              />
            ) : null}
          </button>
        );
      })}
    </motion.div>
  );
}
