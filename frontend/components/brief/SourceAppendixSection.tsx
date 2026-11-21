"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe,
} from "lucide-react";

import { GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { readingReveal } from "@/lib/motion";
import type { BriefSourceItem } from "@/lib/types";
import { formatBriefDate } from "./briefMeta";

export function SourceAppendixSection({
  sources,
  highlightedSourceN,
  returnToOriginId,
  onClearReturn,
}: {
  sources: BriefSourceItem[];
  highlightedSourceN: number | null;
  returnToOriginId: string | null;
  onClearReturn: () => void;
}) {
  const { reduced } = useMotionSafe();
  const [copiedUrlN, setCopiedUrlN] = useState<number | null>(null);

  const handleCopyUrl = async (n: number, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrlN(n);
    window.setTimeout(() => setCopiedUrlN(null), 1600);
  };

  const handleBackToClaim = () => {
    if (!returnToOriginId) return;
    const el = document.getElementById(returnToOriginId);
    if (el) {
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }
    onClearReturn();
  };

  return (
    <motion.section
      id="sources"
      aria-labelledby="heading-sources"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-10%" }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1F2125]/10 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1F2125]/6 text-[#1F2125]"
            aria-hidden="true"
          >
            <BookOpen size={17} />
          </span>
          <div>
            <span className="font-mono text-[11px] font-semibold text-[#4B5058]">
              Section 10
            </span>
            <h2
              id="heading-sources"
              className="font-serif text-[22px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
            >
              Source Appendix
            </h2>
          </div>
        </div>
        <span className="font-mono text-xs text-[#4B5058]">
          {sources.length} cited source{sources.length === 1 ? "" : "s"}
        </span>
      </div>

      {sources.length === 0 ? (
        <GlassCard className="p-5 text-sm text-[#4B5058]">
          No external sources cited in this brief.
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-[#1F2125]/8 p-0 overflow-hidden">
          {sources.map((src) => {
            const isFlashing = highlightedSourceN === src.n;
            const isInternal = src.url.startsWith("upload://") || src.type === "Internal file";
            return (
              <div
                key={src.n}
                id={`source-${src.n}`}
                className={`p-4 sm:p-5 transition-colors ${isFlashing ? "brief-source-flash" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 min-w-[28px] shrink-0 items-center justify-center rounded-lg bg-[#4F46E5]/10 px-1.5 font-mono text-xs font-semibold text-[#4F46E5]">
                      [{src.n}]
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]">
                          {isInternal ? <FileText size={10} /> : <Globe size={10} />}
                          {src.type}
                        </span>
                        {src.verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/30 bg-white px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#047857]">
                            <CheckCircle2 size={10} aria-hidden="true" />
                            Verified
                          </span>
                        ) : null}
                        <span className="font-mono text-[11px] text-[#9AA0AA]">
                          {src.domain}
                        </span>
                      </div>

                      <p className="text-[15px] font-semibold text-[#1F2125]">{src.title}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[#4B5058]">
                        <span>Published: {formatBriefDate(src.publishedAt)}</span>
                        <span>Fetched: {formatBriefDate(src.fetchedAt)}</span>
                      </div>

                      {!isInternal ? (
                        <p className="truncate font-mono text-[11px] text-[#4B5058]">{src.url}</p>
                      ) : null}

                      {src.usedIn.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="font-mono text-[10.5px] text-[#9AA0AA]">Used in:</span>
                          {src.usedIn.map((u) => (
                            <span
                              key={`${u.section}-${u.itemId}`}
                              className="rounded-full border border-[#1F2125]/10 bg-[#F4F6FB] px-2 py-0.5 font-mono text-[10.5px] text-[#4B5058]"
                            >
                              {u.section}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="no-print flex shrink-0 items-center gap-1.5">
                    {isFlashing && returnToOriginId ? (
                      <button
                        type="button"
                        onClick={handleBackToClaim}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#4F46E5]/30 bg-[#4F46E5] px-2.5 py-1 text-xs font-medium text-white"
                      >
                        <ArrowLeft size={12} aria-hidden="true" />
                        Back to claim
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(src.n, src.url)}
                      aria-label={`Copy URL for source ${src.n}`}
                      className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 py-1 text-xs font-medium text-[#4B5058] hover:text-[#1F2125]"
                    >
                      {copiedUrlN === src.n ? <Check size={12} /> : <Copy size={12} />}
                      {copiedUrlN === src.n ? "Copied" : "Copy URL"}
                    </button>
                    {!isInternal && src.url.startsWith("http") ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 py-1 text-xs font-medium text-[#1F2125] no-underline hover:bg-[#F4F6FB]"
                      >
                        Open <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </GlassCard>
      )}
    </motion.section>
  );
}
