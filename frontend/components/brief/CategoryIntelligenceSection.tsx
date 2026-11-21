"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  FileText,
  Globe,
  Paperclip,
  Sparkles,
  Swords,
  Trash2,
  Users,
} from "lucide-react";

import {
  ActionBox,
  ClaimText,
  ClassificationPill,
  ConfidenceBadge,
  GlassCard,
  PriorityDots,
} from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { accentLineReveal, readingReveal } from "@/lib/motion";
import type { BriefCategorySection, BriefSourceItem, SourceCategory } from "@/lib/types";
import { CATEGORY_ACCENTS } from "./briefMeta";

const CAT_ICONS: Record<SourceCategory, typeof Users> = {
  customers: Users,
  competitors: Swords,
  market: Globe,
  internal: FileText,
};

const GUIDING_QUESTION: Record<SourceCategory, string> = {
  customers: "What do customers need?",
  competitors: "What are competitors doing?",
  market: "What is changing in the industry?",
  internal: "What is happening inside the company?",
};

const EMPTY_CATEGORY_NOUN: Record<SourceCategory, string> = {
  customers: "customer",
  competitors: "competitor",
  market: "market",
  internal: "internal",
};

export function CategoryIntelligenceSection({
  sectionNumber,
  companyName,
  section,
  sources,
  isDraftEditable,
  isMock,
  noteText,
  onSaveNote,
  onRemoveItem,
  onJumpToSource,
  onInspectSignal,
}: {
  sectionNumber: string;
  companyName: string;
  section: BriefCategorySection;
  sources: BriefSourceItem[];
  isDraftEditable: boolean;
  isMock?: boolean;
  noteText: string;
  onSaveNote: (sectionKey: string, text: string) => void;
  onRemoveItem: (itemId: string) => void;
  onJumpToSource: (n: number, originId?: string) => void;
  onInspectSignal: (signalId: number) => void;
}) {
  const { reduced } = useMotionSafe();
  const [noteDraft, setNoteDraft] = useState(noteText);
  const [noteDirty, setNoteDirty] = useState(false);

  const accent = CATEGORY_ACCENTS[section.key];
  const Icon = CAT_ICONS[section.key];
  const headingId = `heading-${section.key}`;

  return (
    <motion.section
      id={section.key}
      aria-labelledby={headingId}
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className="space-y-4"
    >
      {/* Category Header Strip with 3px animated accent line & 5% tint */}
      <div className={`overflow-hidden rounded-2xl border border-[#1F2125]/8 ${accent.tintBg}`}>
        <motion.div
          variants={accentLineReveal(reduced)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className={`h-[3px] w-full origin-left ${accent.lineBg}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent.iconBg} ${accent.iconText}`}
              aria-hidden="true"
            >
              <Icon size={17} strokeWidth={1.85} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#4B5058]">
                  Section {sectionNumber}
                </span>
                {isMock ? (
                  <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
                    MOCK DATA
                  </span>
                ) : null}
              </div>
              <h2
                id={headingId}
                className="font-serif text-[22px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
              >
                {accent.label}
              </h2>
              <p className="text-xs text-[#4B5058]">{GUIDING_QUESTION[section.key]}</p>
            </div>
          </div>
          <span className="rounded-full border border-[#1F2125]/10 bg-white/80 px-3 py-1 font-mono text-[11px] text-[#4B5058]">
            {section.items.length} signal{section.items.length === 1 ? "" : "s"} ·{" "}
            {section.sourcesChecked} source{section.sourcesChecked === 1 ? "" : "s"} checked
          </span>
        </div>
      </div>

      {/* Category AI Interpretation Summary */}
      {section.summary ? (
        <div className="rounded-2xl border border-[#4F46E5]/15 bg-indigo-50/75 px-4 py-3.5">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4F46E5]">
            <Sparkles size={11} aria-hidden="true" />
            AI interpretation · Section summary
          </span>
          <p className="mt-1.5 text-[15px] leading-[1.6] text-[#1F2125]">
            <ClaimText
              text={section.summary.text}
              citations={section.summary.citations}
              sources={sources}
              onJumpToSource={(n) => onJumpToSource(n, `${section.key}-summary`)}
            />
          </p>
        </div>
      ) : null}

      {/* Signal items or honest empty state */}
      {section.items.length === 0 ? (
        <GlassCard className="p-5">
          <p className="text-sm font-medium text-[#1F2125]">
            No {EMPTY_CATEGORY_NOUN[section.key]} developments detected this week.
          </p>
          <p className="mt-1 font-mono text-xs text-[#4B5058]">
            {section.sourcesChecked} approved source{section.sourcesChecked === 1 ? "" : "s"} checked.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-3.5">
          {section.items.map((item) => {
            const originId = `signal-${section.key}-${item.signalId}`;
            const firstCite = item.fact.citations[0]
              ? sources.find((s) => s.n === item.fact.citations[0])
              : null;
            const isInternalDoc =
              section.key === "internal" || firstCite?.type === "Internal file";

            return (
              <div key={item.id} id={originId}>
                <GlassCard className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassificationPill classification={item.classification} />
                      <PriorityDots priority={item.priority} />
                      <ConfidenceBadge level={item.confidence} />
                      {isInternalDoc && firstCite ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#6D28D9]">
                          <Paperclip size={10} aria-hidden="true" />
                          file: {firstCite.title}
                        </span>
                      ) : null}
                    </div>

                    <div className="no-print flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onInspectSignal(Number(item.signalId))}
                        className="focus-ring rounded-lg border border-[#1F2125]/12 bg-white px-2.5 py-1 text-xs font-medium text-[#4B5058] hover:text-[#1F2125]"
                      >
                        Open evidence
                      </button>
                      {isDraftEditable ? (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.id)}
                          aria-label={`Remove ${item.headline} from brief`}
                          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#DC2626]/25 bg-white px-2 py-1 text-xs font-medium text-[#B91C1C] hover:bg-[#DC2626]/5"
                        >
                          <Trash2 size={12} aria-hidden="true" />
                          Remove from brief
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <h3 className="font-serif text-[18px] font-medium leading-snug text-[#1F2125]">
                    {item.headline}
                  </h3>

                  {/* Fact / What the source says */}
                  <div className="rounded-xl border border-[#059669]/20 bg-white/80 px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4B5058]">
                        What the source says
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/30 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-[#047857]">
                        <CheckCircle2 size={10} aria-hidden="true" />
                        Verified
                      </span>
                    </div>
                    <p className="mt-1.5 text-[14.5px] leading-[1.6] text-[#1F2125]">
                      <ClaimText
                        text={item.fact.text}
                        citations={item.fact.citations}
                        sources={sources}
                        onJumpToSource={(n) => onJumpToSource(n, originId)}
                      />
                    </p>
                  </div>

                  {/* AI Interpretation */}
                  <div className="rounded-xl border border-[#4F46E5]/15 bg-indigo-50/75 px-3.5 py-2.5">
                    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#4F46E5]">
                      <Sparkles size={11} aria-hidden="true" />
                      AI interpretation · Why it matters to {companyName}
                    </span>
                    <p className="mt-1 text-[14px] leading-[1.6] text-[#1F2125]">
                      <ClaimText
                        text={item.whyItMatters.text}
                        citations={item.whyItMatters.citations}
                        sources={sources}
                        onJumpToSource={(n) => onJumpToSource(n, originId)}
                      />
                    </p>
                  </div>

                  {item.action?.text ? (
                    <ActionBox
                      action={{
                        text: item.action.text,
                        effort: item.impactLevel === "high" ? "high" : "medium",
                      }}
                    />
                  ) : null}
                </GlassCard>
              </div>
            );
          })}
        </div>
      )}

      {/* Your note (draft editing or existing note) */}
      {isDraftEditable || noteText.trim() ? (
        <div className="rounded-2xl border border-[#1F2125]/10 bg-white/65 p-4">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`note-${section.key}`}
              className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4B5058]"
            >
              Your note
            </label>
            {isDraftEditable && noteDirty ? (
              <button
                type="button"
                onClick={() => {
                  onSaveNote(section.key, noteDraft);
                  setNoteDirty(false);
                }}
                className="focus-ring rounded-lg bg-[#1C1D21] px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Save note
              </button>
            ) : null}
          </div>
          {isDraftEditable ? (
            <textarea
              id={`note-${section.key}`}
              rows={2}
              value={noteDraft}
              onChange={(e) => {
                setNoteDraft(e.target.value);
                setNoteDirty(true);
              }}
              placeholder="Add team context or follow-up framing before marking ready..."
              className="focus-ring mt-2 w-full rounded-xl border border-[#1F2125]/10 bg-white/90 px-3 py-2 text-sm text-[#1F2125] placeholder:text-[#9AA0AA]"
            />
          ) : (
            <p className="mt-1.5 text-sm text-[#1F2125]">{noteText}</p>
          )}
        </div>
      ) : null}
    </motion.section>
  );
}
