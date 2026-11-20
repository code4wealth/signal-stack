"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Globe,
  RefreshCw,
  Swords,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { fadeUp } from "@/lib/motion";
import type { Evidence, Turn } from "@/lib/types";
import { EvidenceChip, StatusPill } from "@/components/ui-shared";

function TopicIcon({ topic }: { topic: string }) {
  const t = topic.toLowerCase();
  if (t.includes("customer")) return <Users size={12} strokeWidth={1.75} className="text-[#0D9488]" />;
  if (t.includes("competitor")) return <Swords size={12} strokeWidth={1.75} className="text-[#EA580C]" />;
  if (t.includes("market")) return <Globe size={12} strokeWidth={1.75} className="text-[#2563EB]" />;
  if (t.includes("growth")) return <TrendingUp size={12} strokeWidth={1.75} className="text-[#4F46E5]" />;
  if (t.includes("operation")) return <Activity size={12} strokeWidth={1.75} className="text-[#7C3AED]" />;
  return <Target size={12} strokeWidth={1.75} className="text-[#4F46E5]" />;
}

function renderWithHighlight(text: string, highlight?: string | null): ReactNode {
  if (!highlight) return text;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="selection-quote-highlight">{text.slice(idx, idx + highlight.length)}</span>
      {text.slice(idx + highlight.length)}
    </>
  );
}

export function AiQuestion({
  turn,
  evidenceMap,
  useContext,
  isCurrent,
  activeQuote,
}: {
  turn: Turn;
  evidenceMap: Map<string, Evidence>;
  useContext: boolean;
  isCurrent: boolean;
  activeQuote?: string | null;
}) {
  const reduced = Boolean(useReducedMotion());
  const [collapsed, setCollapsed] = useState(false);

  const citedEvidence: Evidence[] = turn.evidenceIds
    .slice(0, 2)
    .map((idOrUrl, idx) => {
      const existing = evidenceMap.get(idOrUrl);
      if (existing) return existing;
      return {
        id: `q-${turn.index}-ev-${idx}`,
        url: idOrUrl,
        type: "webpage",
        usedFor: turn.topic,
        fetchedAt: new Date().toISOString(),
        verified: true,
      };
    });

  return (
    <motion.article
      id={`interview-turn-${turn.index}`}
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="space-y-2.5 pl-11"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#1F2125]/10 bg-white/80 px-2.5 py-0.5 font-mono text-[11px] font-medium text-[#1F2125]">
            Question {turn.index + 1}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/85 bg-white/70 px-2.5 py-0.5 text-xs font-medium text-[#4B5058]">
            <TopicIcon topic={turn.topic} />
            {turn.topic}
          </span>
          {turn.isFollowup ? <StatusPill tone="info">Follow-up</StatusPill> : null}
          {turn.updatedAfterEdit ? (
            <StatusPill tone="warning" icon={<RefreshCw size={10} />}>
              Updated
            </StatusPill>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand question ${turn.index + 1}` : `Collapse question ${turn.index + 1}`}
          className="focus-ring rounded-lg p-1 text-[#9AA0AA] transition-colors hover:bg-white/75 hover:text-[#1F2125]"
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {!collapsed ? (
        <div
          data-reply-selectable="true"
          data-turn-index={turn.index}
          className="space-y-2.5 select-text"
        >
          <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-[#1F2125]">
            {renderWithHighlight(turn.question, activeQuote)}
          </h3>

          {useContext && (turn.whyAsking || citedEvidence.length > 0) ? (
            <div className="space-y-1.5">
              {turn.whyAsking ? (
                <p className="text-sm leading-relaxed text-[#4B5058]">
                  <span className="font-medium text-[#1F2125]/80">Why I&apos;m asking:</span>{" "}
                  {renderWithHighlight(turn.whyAsking, activeQuote)}
                </p>
              ) : null}
              {citedEvidence.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {citedEvidence.map((ev) => (
                    <EvidenceChip key={ev.id} evidence={ev} compact />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isCurrent ? (
            <p className="text-xs text-[#9AA0AA]">
              Answer in a sentence or two. Skip if confidential.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="truncate text-xs text-[#9AA0AA]">{turn.question}</p>
      )}
    </motion.article>
  );
}
