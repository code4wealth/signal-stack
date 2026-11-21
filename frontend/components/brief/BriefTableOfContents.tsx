"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckSquare,
  Copy,
  Download,
  Eye,
  FileText,
  Globe,
  Mail,
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

const NON_CAT_COLOR: Record<string, string> = {
  "executive-summary": "text-[#4F46E5]",
  opportunities: "text-[#16A34A]",
  risks: "text-[#DC2626]",
  actions: "text-[#4F46E5]",
  watch: "text-[#64748B]",
  sources: "text-[#64748B]",
};

export function BriefTableOfContents({
  brief,
  activeId,
  onSelectSection,
  onDownloadPdf,
  onCopyMarkdown,
  onOpenEmail,
  onPrint,
}: {
  brief: Brief;
  activeId: string;
  onSelectSection: (sectionId: string) => void;
  onDownloadPdf: () => void;
  onCopyMarkdown: () => void;
  onOpenEmail: () => void;
  onPrint: () => void;
}) {
  const { reduced } = useMotionSafe();

  const handleSelect = (sectionId: string) => {
    window.history.replaceState(null, "", `#${sectionId}`);
    onSelectSection(sectionId);
  };

  return (
    <>
      {/* <1280px sticky horizontal chip bar */}
      <nav
        aria-label="Brief sections"
        className="no-print sticky top-14 z-10 -mx-4 mb-4 flex snap-x items-center gap-1.5 overflow-x-auto border-b border-white/60 bg-white/75 px-4 py-2.5 backdrop-blur-xl xl:hidden"
      >
        {BRIEF_SECTION_DEFS.map((sec) => {
          const isActive = activeId === sec.id;
          const count = getSectionCount(brief, sec.id);
          return (
            <button
              key={sec.id}
              type="button"
              aria-current={isActive ? "location" : undefined}
              onClick={() => handleSelect(sec.id)}
              className={`focus-ring inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-[#4F46E5]/30 bg-[#4F46E5] text-white"
                  : "border-[#1F2125]/10 bg-white/85 text-[#4B5058] hover:text-[#1F2125]"
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
          <nav aria-label="Brief sections" className="glass rounded-2xl p-2.5">
            <p className="mb-2 px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#9AA0AA]">
              Contents
            </p>
            <ul className="space-y-0.5">
              {BRIEF_SECTION_DEFS.map((sec, idx) => {
                const isActive = activeId === sec.id;
                const count = getSectionCount(brief, sec.id);
                const Icon = ICON_FOR_SECTION[sec.id] ?? Sparkles;
                const catAccent = sec.category ? CATEGORY_ACCENTS[sec.category] : null;
                return (
                  <motion.li
                    key={sec.id}
                    initial={reduced ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={reduced ? undefined : { duration: 0.2, delay: idx * 0.03 }}
                    className="relative"
                  >
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
                      onClick={() => handleSelect(sec.id)}
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
                          <Icon
                            size={12}
                            className={`shrink-0 ${NON_CAT_COLOR[sec.id] ?? "text-[#4F46E5]"}`}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{sec.label}</span>
                      </span>
                      <span className="tabular font-mono text-[10.5px] text-[#9AA0AA]">
                        {count}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>

            <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-[#1F2125]/8 pt-2.5">
              <button
                type="button"
                onClick={onDownloadPdf}
                className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/85 px-2 py-1.5 text-[11px] font-medium text-[#1F2125] hover:bg-white"
              >
                <Download size={11} aria-hidden="true" />
                PDF
              </button>
              <button
                type="button"
                onClick={onCopyMarkdown}
                className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/85 px-2 py-1.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
              >
                <Copy size={11} aria-hidden="true" />
                Copy
              </button>
              <button
                type="button"
                onClick={onOpenEmail}
                className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/85 px-2 py-1.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
              >
                <Mail size={11} aria-hidden="true" />
                Email
              </button>
              <button
                type="button"
                onClick={onPrint}
                className="focus-ring flex items-center justify-center gap-1 rounded-lg border border-[#1F2125]/10 bg-white/85 px-2 py-1.5 text-[11px] font-medium text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
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
