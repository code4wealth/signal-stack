"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileEdit,
  Sparkles,
  X,
} from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import { sidePanelSlide } from "@/lib/motion";
import type { CollectedItem } from "@/lib/types";
import { CategoryBadge, StatusPill } from "@/components/ui-shared";

export function EvidenceDrawer({
  companyId,
  item,
  isLoading,
  onClose,
}: {
  companyId: number;
  item: CollectedItem | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    if (!item && !isLoading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLoading, item, onClose]);

  if (!item && !isLoading) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <motion.aside
          variants={sidePanelSlide(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Collected evidence detail"
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[480px]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-semibold text-[#1F2125]">
                {item ? item.title : "Loading evidence…"}
              </h2>
              {item ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-[#2563EB] no-underline hover:underline"
                >
                  <span className="truncate">{item.url}</span>
                  <ArrowUpRight size={11} className="shrink-0" />
                </a>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close evidence drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            {isLoading || !item ? (
              <p className="text-[#9AA0AA]">Loading collected item details…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={item.category} />
                  {item.change === "changed" ? (
                    <StatusPill tone="warning" icon={<FileEdit size={11} />}>
                      Changed
                    </StatusPill>
                  ) : (
                    <StatusPill tone="info" icon={<Sparkles size={11} />}>
                      New
                    </StatusPill>
                  )}
                </div>

                <dl className="space-y-2 rounded-2xl border border-white/85 bg-white/75 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#4B5058]">Published</dt>
                    <dd className="font-mono text-[#1F2125]">
                      {item.publishedAt ? formatShortDate(item.publishedAt) : "Not detected"}
                      {item.publishedAtMethod ? (
                        <span className="ml-1.5 text-[10px] text-[#9AA0AA]">
                          ({item.publishedAtMethod})
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#4B5058]">Fetched</dt>
                    <dd className="font-mono text-[#1F2125]">
                      {formatShortDate(item.fetchedAt)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-[#4B5058]">Content hash</dt>
                    <dd className="flex items-center gap-1.5 font-mono text-[#1F2125]">
                      <span>{item.contentHash.slice(0, 14)}…</span>
                      <button
                        type="button"
                        aria-label="Copy content hash"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(item.contentHash).catch(() => undefined);
                          setCopiedHash(true);
                          setTimeout(() => setCopiedHash(false), 1200);
                        }}
                        className="rounded p-1 text-[#4B5058] hover:bg-white"
                      >
                        {copiedHash ? (
                          <Check size={12} className="text-[#059669]" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </dd>
                  </div>
                </dl>

                {item.change === "changed" && item.diff ? (
                  <section className="space-y-2">
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                      Changed since previous fetch
                    </h3>
                    <div className="space-y-2 rounded-2xl border border-white/85 bg-white/75 p-3.5">
                      <div>
                        <p className="font-mono text-[10px] uppercase text-[#DC2626]">Before</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[#4B5058]">
                          {item.diff.before}
                        </p>
                      </div>
                      <div className="border-t border-[#1F2125]/8 pt-2">
                        <p className="font-mono text-[10px] uppercase text-[#059669]">After</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[#1F2125]">
                          {item.diff.after}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                    Extracted readable text
                  </h3>
                  <div className="rounded-2xl border border-white/85 bg-white/75 p-4 text-xs leading-relaxed text-[#1F2125]">
                    {item.excerpt || "No text excerpt returned."}
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-[#1F2125]/8 bg-white/75 px-5 py-3.5">
            {item ? (
              <Link
                href={`/company/${companyId}/intelligence?item=${item.id}`}
                className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline hover:bg-[#2a2c32]"
              >
                View in Signals →
              </Link>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={onClose}
              className="focus-ring h-9 rounded-xl border border-[#1F2125]/12 bg-white px-4 text-xs font-medium text-[#1F2125]"
            >
              Close
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
