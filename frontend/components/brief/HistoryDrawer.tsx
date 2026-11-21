"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitCompare, History, X } from "lucide-react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { compareBriefs, listBriefs } from "@/lib/api";
import { sidePanelSlide } from "@/lib/motion";
import { formatBriefDate } from "./briefMeta";

export function HistoryDrawer({
  companyId,
  currentBriefId,
  open,
  onClose,
}: {
  companyId: number;
  currentBriefId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { reduced } = useMotionSafe();
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const listQuery = useQuery({
    queryKey: ["brief-history", companyId],
    queryFn: () => listBriefs(companyId),
    enabled: open && companyId > 0,
  });

  const compareQuery = useQuery({
    queryKey: ["brief-compare", companyId, compareTargetId, currentBriefId],
    queryFn: () => compareBriefs(companyId, compareTargetId as string, currentBriefId),
    enabled: Boolean(open && compareTargetId && compareTargetId !== currentBriefId),
  });

  const items = listQuery.data?.items ?? [];

  return (
    <AnimatePresence>
      {open ? (
        <div className="no-print fixed inset-0 z-50 flex justify-end bg-[#1F2125]/25 backdrop-blur-xs">
          <div className="flex-1" onClick={onClose} aria-hidden="true" />
          <motion.aside
            aria-label="Brief history"
            variants={sidePanelSlide(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-strong flex h-full w-full max-w-[440px] flex-col border-l border-white/80 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#1F2125]/10 pb-3.5">
              <div className="flex items-center gap-2">
                <History size={17} className="text-[#4F46E5]" aria-hidden="true" />
                <h2 className="font-serif text-lg font-medium text-[#1F2125]">
                  Brief History
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close history drawer"
                className="focus-ring rounded-xl p-1.5 text-[#4B5058] hover:bg-white/80 hover:text-[#1F2125]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
              {listQuery.isLoading ? (
                <p className="text-xs text-[#4B5058]">Loading brief archive…</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-[#4B5058]">No archived editions yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {items.map((item) => {
                    const isCurrent = item.id === currentBriefId;
                    const isComparing = compareTargetId === item.id;
                    return (
                      <li
                        key={item.id}
                        className={`rounded-2xl border p-3.5 transition-colors ${
                          isCurrent
                            ? "border-[#4F46E5]/35 bg-indigo-50/70"
                            : "border-[#1F2125]/10 bg-white/80"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-[#1F2125]">
                            v{item.version} · {formatBriefDate(item.weekStart)}
                          </span>
                          <span className="rounded-full border border-[#1F2125]/12 bg-white px-2 py-0.5 font-mono text-[10px] uppercase text-[#4B5058]">
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-[#4B5058]">
                          {item.signals} signals · {item.actionsDonePct}% actions done ·{" "}
                          {item.trigger}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          {isCurrent ? (
                            <span className="font-mono text-[11px] font-semibold text-[#4F46E5]">
                              Currently open
                            </span>
                          ) : (
                            <Link
                              href={`/company/${companyId}/brief/${item.id}`}
                              onClick={onClose}
                              className="focus-ring inline-flex items-center gap-1 text-xs font-semibold text-[#4F46E5] no-underline hover:underline"
                            >
                              Open brief <ArrowRight size={12} />
                            </Link>
                          )}

                          {!isCurrent ? (
                            <button
                              type="button"
                              onClick={() =>
                                setCompareTargetId((prev) => (prev === item.id ? null : item.id))
                              }
                              className={`focus-ring inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10.5px] font-medium ${
                                isComparing
                                  ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                                  : "border-[#1F2125]/12 bg-white text-[#4B5058] hover:text-[#1F2125]"
                              }`}
                            >
                              <GitCompare size={11} aria-hidden="true" />
                              {isComparing ? "Comparing" : "Compare"}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Compare View */}
              {compareTargetId ? (
                <div className="rounded-2xl border border-[#4F46E5]/25 bg-white/90 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5]">
                      Executive Summary Diff
                    </p>
                    <button
                      type="button"
                      onClick={() => setCompareTargetId(null)}
                      className="text-xs text-[#4B5058] hover:text-[#1F2125]"
                    >
                      Clear
                    </button>
                  </div>
                  {compareQuery.isLoading ? (
                    <p className="text-xs text-[#4B5058]">Comparing executive summaries…</p>
                  ) : compareQuery.data ? (
                    <div className="space-y-2.5 text-xs">
                      <p className="font-mono text-[11px] text-[#4B5058]">
                        v{compareQuery.data.briefA.version} → v{compareQuery.data.briefB.version}
                      </p>
                      {compareQuery.data.added.length > 0 ? (
                        <div>
                          <p className="font-semibold text-[#15803D]">Added</p>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[#1F2125]">
                            {compareQuery.data.added.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {compareQuery.data.removed.length > 0 ? (
                        <div>
                          <p className="font-semibold text-[#B91C1C]">Removed</p>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[#4B5058]">
                            {compareQuery.data.removed.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {compareQuery.data.unchanged.length > 0 ? (
                        <div>
                          <p className="font-semibold text-[#4B5058]">Unchanged</p>
                          <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[#4B5058]">
                            {compareQuery.data.unchanged.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
