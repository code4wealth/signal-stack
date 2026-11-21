"use client";

import { motion } from "framer-motion";
import { Bookmark, BookmarkCheck, Calendar, Eye, Globe } from "lucide-react";

import { ClaimText, GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { readingReveal } from "@/lib/motion";
import type { BriefSourceItem, BriefWatchItem } from "@/lib/types";
import { formatBriefDate } from "./briefMeta";

export function WatchSection({
  items,
  sources,
  isMock,
  onToggleWatch,
  onJumpToSource,
}: {
  items: BriefWatchItem[];
  sources: BriefSourceItem[];
  isMock?: boolean;
  onToggleWatch: (watchId: string) => Promise<unknown>;
  onJumpToSource: (n: number, originId?: string) => void;
}) {
  const { reduced } = useMotionSafe();

  return (
    <motion.section
      id="watch"
      aria-labelledby="heading-watch"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#1F2125]/10 pb-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#64748B]/10 text-[#475569]"
            aria-hidden="true"
          >
            <Eye size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-[#4B5058]">
                Section 09
              </span>
              {isMock ? (
                <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
                  MOCK DATA
                </span>
              ) : null}
            </div>
            <h2
              id="heading-watch"
              className="font-serif text-[22px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
            >
              What we should watch
            </h2>
          </div>
        </div>
        <span className="font-mono text-xs text-[#4B5058]">
          {items.length === 0
            ? "Nothing to watch right now."
            : `${items.length} monitor item${items.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => {
            const originId = `watch-${item.id}`;
            return (
              <div key={item.id} id={originId}>
                <GlassCard className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#4B5058]">
                      {item.sourceDomain ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white/80 px-2.5 py-0.5">
                          <Globe size={10} aria-hidden="true" />
                          {item.sourceDomain}
                        </span>
                      ) : null}
                      {item.expectedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white/80 px-2.5 py-0.5">
                          <Calendar size={10} aria-hidden="true" />
                          Expected {formatBriefDate(item.expectedAt)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="font-serif text-[17.5px] font-medium leading-snug text-[#1F2125]">
                      {item.title}
                    </h3>
                    <p className="text-[14px] leading-[1.6] text-[#4B5058]">
                      <ClaimText
                        text={item.why.text}
                        citations={item.why.citations}
                        sources={sources}
                        onJumpToSource={(n) => onJumpToSource(n, originId)}
                      />
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleWatch(item.id)}
                    aria-pressed={Boolean(item.inWatchlist)}
                    className={`no-print focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                      item.inWatchlist
                        ? "border-[#4F46E5]/35 bg-[#4F46E5] text-white"
                        : "border-[#1F2125]/12 bg-white text-[#1F2125] hover:bg-[#F4F6FB]"
                    }`}
                  >
                    {item.inWatchlist ? (
                      <>
                        <BookmarkCheck size={13} aria-hidden="true" />
                        Watching
                      </>
                    ) : (
                      <>
                        <Bookmark size={13} aria-hidden="true" />
                        Add to watchlist
                      </>
                    )}
                  </button>
                </GlassCard>
              </div>
            );
          })}
        </div>
      ) : null}
    </motion.section>
  );
}
