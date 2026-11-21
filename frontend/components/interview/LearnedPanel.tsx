"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lock, Pencil, X } from "lucide-react";

import { fadeUp, sidePanelSlide } from "@/lib/motion";
import type { LearnedItem } from "@/lib/types";

const TOPIC_ORDER = ["Customers", "Growth", "Competitors", "Market", "Operations", "Goals"];

export function LearnedPanel({
  open,
  onClose,
  learned,
  newlyLearnedId,
  answeredCount,
  skippedCount,
  onEditTurn,
}: {
  open: boolean;
  onClose: () => void;
  learned: LearnedItem[];
  newlyLearnedId: string | null;
  answeredCount: number;
  skippedCount: number;
  onEditTurn: (turnIndex: number) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!newlyLearnedId) return;
    setHighlightId(newlyLearnedId);
    const timer = setTimeout(() => setHighlightId(null), 1200);
    return () => clearTimeout(timer);
  }, [newlyLearnedId]);

  const grouped = new Map<string, LearnedItem[]>();
  for (const item of learned) {
    const bucket = grouped.get(item.topic) ?? [];
    bucket.push(item);
    grouped.set(item.topic, bucket);
  }
  const orderedTopics = [
    ...TOPIC_ORDER.filter((t) => grouped.has(t)),
    ...Array.from(grouped.keys()).filter((t) => !TOPIC_ORDER.includes(t)),
  ];

  const panelContent = (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#1F2125]">What I&apos;ve learned</h2>
            <span className="tabular rounded-full bg-white/85 px-2 py-0.5 font-mono text-[11px] font-medium text-[#4F46E5]">
              {learned.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close learned panel"
            className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
          >
            <X size={15} />
          </button>
        </div>

        {learned.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#94A3B8]/60 bg-white/45 px-4 py-6 text-center text-xs text-[#4B5058]">
            Your answers will appear here as we talk.
          </div>
        ) : (
          <div className="space-y-5">
            {orderedTopics.map((topic) => (
              <div key={topic} className="space-y-2">
                <p className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                  {topic}
                </p>
                <ul className="space-y-2">
                  {(grouped.get(topic) ?? []).map((item) => {
                    const isNew = highlightId === item.id;
                    return (
                      <motion.li
                        key={item.id}
                        variants={fadeUp(reduced)}
                        initial="hidden"
                        animate="visible"
                        data-reply-selectable="true"
                        data-turn-index={item.sourceTurnIndex}
                        className={`group rounded-2xl border p-3 text-xs transition-colors duration-300 select-text ${
                          isNew
                            ? "border-[#4F46E5]/35 bg-[#EEF2FF]"
                            : item.skipped
                              ? "border-dashed border-[#94A3B8] bg-white/45"
                              : "border-white/80 bg-white/75"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`leading-relaxed ${
                              item.skipped ? "italic text-[#4B5058]" : "text-[#1F2125]"
                            }`}
                          >
                            {item.text}
                          </p>
                          <button
                            type="button"
                            onClick={() => onEditTurn(item.sourceTurnIndex)}
                            aria-label={`Edit answer for question ${item.sourceTurnIndex + 1}`}
                            className="focus-ring shrink-0 rounded-md p-1 text-[#9AA0AA] opacity-0 transition-opacity hover:bg-white hover:text-[#1F2125] group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Pencil size={12} strokeWidth={1.75} />
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#F4F6FB] px-2 py-0.5 font-mono text-[10px] font-medium text-[#4B5058]">
                            Q{item.sourceTurnIndex + 1}
                          </span>
                          {item.skipped ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 font-mono text-[10px] text-[#64748B]">
                              <Lock size={9} /> confidential-skipped
                            </span>
                          ) : null}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#1F2125]/8 pt-3 font-mono text-[11px] text-[#4B5058]">
        {answeredCount} answered · {skippedCount} skipped
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Desktop >=1280px docked side panel */}
          <motion.aside
            variants={sidePanelSlide(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            aria-label="What I've learned"
            className="glass-strong hidden w-[320px] shrink-0 border-l border-white/70 p-5 xl:block"
          >
            {panelContent}
          </motion.aside>

          {/* Tablet 768-1279px slide-over drawer */}
          <div className="fixed inset-0 z-40 hidden justify-end md:flex xl:hidden">
            <div
              className="fixed inset-0 bg-[#1F2125]/20 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.aside
              variants={sidePanelSlide(reduced)}
              initial="hidden"
              animate="visible"
              exit="exit"
              aria-label="What I've learned"
              className="glass-strong relative z-10 h-full w-[340px] border-l border-white/80 p-5"
            >
              {panelContent}
            </motion.aside>
          </div>

          {/* Mobile <768px bottom sheet */}
          <div className="fixed inset-0 z-40 flex items-end md:hidden">
            <div
              className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.aside
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: 24 }}
              aria-label="What I've learned"
              className="glass-strong relative z-10 max-h-[75vh] w-full rounded-t-3xl border-t border-white/85 p-5"
            >
              {panelContent}
            </motion.aside>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
