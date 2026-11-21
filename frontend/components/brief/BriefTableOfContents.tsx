"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Copy,
  Eye,
  FileText,
  Globe,
  Printer,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { springSoft } from "@/lib/motion";
import type { Brief } from "@/lib/types";
import { BRIEF_SECTION_DEFS, CATEGORY_ACCENTS, getSectionCount } from "./briefMeta";

const ICON_FOR_SECTION: Record<string, typeof Sparkles> = {
  "executive-summary": Sparkles,
  customers: Users,
  competitors: Swords,
  market: Globe,
  internal: FileText,
  opportunities: TrendingUp,
  risks: AlertTriangle,
  actions: CheckSquare,
  watch: Eye,
  sources: BookOpen,
};

export function BriefTableOfContents({
  brief,
  activeId,
  onSelectSection,
  onCopyMarkdown,
  onPrintPdf,
}: {
  brief: Brief;
  activeId: string;
  onSelectSection: (sectionId: string) => void;
  onCopyMarkdown: () => void;
  onPrintPdf: () => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <>
      {/* <1280px sticky horizontal chip bar */}
      <nav
        aria-label="Brief sections"
        className="no-print sticky top-14 z-10 -mx-4 mb-4 flex items-center gap-1.5 overflow-x-auto border-b border-white/60 bg-white/70 px-4 py-2.5 backdrop-blur-xl xl:hidden"
      >
        {BRIEF_SECTION_DEFS.map((sec) => {
          const isActive = activeId === sec.id;
          const count = getSectionCount(brief, sec.id);
          return (
            <button
              key={sec.id}
              type="button"
              aria-current={isActive ? "location" : undefined}
              onClick={() => onSelectSection(sec.id)}
              className={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-[#4F46E5]/30 bg-[#4F46E5] text-white"
                  : "border-[#1F2125]/10 bg-white/80 text-[#4B5058] hover:text-[#1F2125]"
              }`}
            >
              <span className="font-mono text-[10px] opacity-80">{sec.num}</span>
              <span>{sec.label}</span>
              <span className="tabular font-mono text-[10px] opacity-75">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* >=1280px sticky 220px left rail */}
      <aside className="no-print hidden w-[220px] shrink-0 xl:block">
        <div className="sticky top-20 space-y-4">
          <nav
            aria-label="Brief sections"
            className="glass rounded-2xl p-2.5"
          >
            <p className="mb-2 px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
              Contents
            </p>
            <ul className="space-y-0.5">
              {BRIEF_SECTION_DEFS.map((sec) => {
                const isActive = activeId === sec.id;
                const count = getSectionCount(brief, sec.id);
                const Icon = ICON_FOR_SECTION[sec.id] ?? Sparkles;
                const catAccent = sec.category ? CATEGORY_ACCENTS[sec.category] : null;
                return (
                  <li key={sec.id} className="relative">
                    {isActive ? (
                      <motion.span
                        layoutId={reduced ? undefined : "brief-toc-active"}
                        transition={springSoft}
                        className="absolute inset-0 rounded-xl border border-[#4F46E5]/20 bg-white shadow-sm"
                      />
                    ) : null}
                    <button
                      type="button"
                      aria-current={isActive ? "location" : undefined}
                      onClick={() => onSelectSection(sec.id)}
                      className={`focus-ring relative z-10 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                        isActive
                          ? "font-semibold text-[#1F2125]"
                          : "font-medium text-[#4B5058] hover:text-[#1F2125]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[10.5px] text-[#9AA0AA]">{sec.num}</span>
                        {catAccent ? (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${catAccent.dotBg}`} aria-hidden="true" />
                        ) : (
                          <Icon size={12} className="shrink-0 text-[#4F46E5]" aria-hidden="true" />
                        )}
                        <span className="truncate">{sec.label}</span>
                      </span>
                      <span className="tabular font-mono text-[10.5px] text-[#9AA0AA]">
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center gap-1.5 border-t border-[#1F2125]/8 pt-2.5">
              <button
                type="button"
                onClick={onCopyMarkdown}
                className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/80 px-2 py-1.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
              >
                <Copy size={11} aria-hidden="true" />
                Copy
              </button>
              <button
                type="button"
                onClick={onPrintPdf}
                className="focus-ring flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/80 px-2 py-1.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
              >
                <Printer size={11} aria-hidden="true" />
                Print
              </button>
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}
