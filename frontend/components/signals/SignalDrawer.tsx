"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bookmark, Check, EyeOff, FilePlus2, Link2, X } from "lucide-react";

import { getSignalDetail } from "@/lib/api";
import { sidePanelSlide } from "@/lib/motion";
import type { CollectedItem, SignalPatchPayload } from "@/lib/types";
import {
  ActionBox,
  CategoryBadge,
  ClassificationPill,
  ConfidenceBadge,
  EvidenceBlock,
  PriorityDots,
  StatusPill,
} from "@/components/ui-shared";
import { InterpretationBlock } from "./InterpretationBlock";

export function SignalDrawer({
  companyId,
  signalId,
  onClose,
  onSelectSignal,
  onOpenEvidence,
  onPatch,
}: {
  companyId: number;
  signalId: number | null;
  onClose: () => void;
  onSelectSignal: (nextId: number) => void;
  onOpenEvidence: (item: CollectedItem) => void;
  onPatch: (signalId: number, patch: SignalPatchPayload) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [comment, setComment] = useState("");

  const detailQuery = useQuery({
    queryKey: ["signal-detail", companyId, signalId],
    queryFn: () => getSignalDetail(companyId, signalId as number),
    enabled: Boolean(signalId),
  });

  useEffect(() => {
    if (!signalId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signalId, onClose]);

  if (!signalId) return null;

  const data = detailQuery.data;
  const sig = data?.signal;
  const primaryEvidence = data?.evidenceItems?.[0] ?? null;

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
          aria-label="Signal detail"
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[520px]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {sig ? (
                  <>
                    <CategoryBadge category={sig.category} />
                    <ClassificationPill classification={sig.classification} compact />
                    {sig.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
                  </>
                ) : null}
              </div>
              <h2 className="text-sm font-semibold text-[#1F2125]">
                {sig ? sig.headline : "Loading signal…"}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close signal drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
            {detailQuery.isLoading || !sig ? (
              <p className="text-[#9AA0AA]">Loading signal details and verified evidence…</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/85 bg-white/75 px-3.5 py-2.5">
                  <PriorityDots priority={sig.priority} />
                  <ConfidenceBadge level={sig.confidence} />
                </div>

                <EvidenceBlock
                  signalId={sig.id}
                  evidenceItem={primaryEvidence}
                  verified={sig.verified}
                  onOpenEvidence={onOpenEvidence}
                />

                {primaryEvidence?.change === "changed" && primaryEvidence.diff ? (
                  <div className="rounded-2xl border border-white/85 bg-white/75 p-3.5 space-y-2">
                    <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                      Page change diff
                    </p>
                    <div>
                      <p className="font-mono text-[10px] uppercase text-[#DC2626]">Before</p>
                      <p className="mt-0.5 text-[11px] text-[#4B5058]">{primaryEvidence.diff.before}</p>
                    </div>
                    <div className="border-t border-[#1F2125]/8 pt-2">
                      <p className="font-mono text-[10px] uppercase text-[#059669]">After</p>
                      <p className="mt-0.5 text-[11px] text-[#1F2125]">{primaryEvidence.diff.after}</p>
                    </div>
                  </div>
                ) : null}

                <InterpretationBlock
                  whyItMatters={sig.whyItMatters}
                  potentialImpact={sig.potentialImpact}
                  impactLevel={sig.impactLevel}
                  assumptionRefs={sig.assumptionRefs}
                  limitations={sig.limitations}
                />

                <ActionBox action={sig.recommendedAction} />

                {/* Ranking factors */}
                <div className="rounded-2xl border border-white/85 bg-white/75 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                      Ranking factors
                    </span>
                    <span className="tabular font-mono font-semibold text-[#1F2125]">
                      {sig.priorityValue}/100
                    </span>
                  </div>
                  {sig.priorityReasons.map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-[11px]">
                      <span className="text-[#4B5058]">{r.label}</span>
                      <span className="tabular font-mono font-semibold text-[#1F2125]">
                        {r.weight}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Corroborated signals */}
                {data.relatedSignals.length > 0 ? (
                  <div className="space-y-2">
                    <p className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
                      <Link2 size={11} aria-hidden="true" />
                      Corroborated across sources
                    </p>
                    <div className="space-y-1.5">
                      {data.relatedSignals.map((rel) => (
                        <button
                          key={rel.id}
                          type="button"
                          onClick={() => onSelectSignal(rel.id)}
                          className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl border border-white/85 bg-white/75 px-3 py-2 text-left hover:bg-white"
                        >
                          <span className="truncate font-medium text-[#1F2125]">{rel.headline}</span>
                          <ClassificationPill classification={rel.classification} compact />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Founder feedback note */}
                <div className="space-y-2 rounded-2xl border border-white/85 bg-white/75 p-3.5">
                  <label
                    htmlFor="signal-feedback-comment"
                    className="block font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]"
                  >
                    Founder note / feedback
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="signal-feedback-comment"
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Optional note for ranking feedback…"
                      className="focus-ring h-8 flex-1 rounded-xl border border-[#1F2125]/10 bg-white px-2.5 text-xs text-[#1F2125] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onPatch(sig.id, {
                          feedback: sig.feedback ?? "useful",
                          feedbackComment: comment,
                        });
                        setComment("");
                      }}
                      className="focus-ring h-8 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white"
                    >
                      Save note
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {sig ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 bg-white/75 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onPatch(sig.id, {
                      status: sig.status === "in_brief" ? "new" : "in_brief",
                    })
                  }
                  className={`focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium ${
                    sig.status === "in_brief"
                      ? "bg-[#1C1D21] text-white"
                      : "bg-[#1C1D21] text-white hover:bg-[#2a2c32]"
                  }`}
                >
                  {sig.status === "in_brief" ? <Check size={13} /> : <FilePlus2 size={13} />}
                  <span>{sig.status === "in_brief" ? "In Monday Brief" : "Add to Monday Brief"}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onPatch(sig.id, {
                      status: sig.status === "saved" ? "new" : "saved",
                    })
                  }
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs font-medium text-[#1F2125]"
                >
                  <Bookmark size={13} />
                  <span>{sig.status === "saved" ? "Saved" : "Save"}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  onPatch(sig.id, {
                    status: sig.status === "dismissed" ? "new" : "dismissed",
                  })
                }
                className="focus-ring inline-flex h-9 items-center gap-1 rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs font-medium text-[#4B5058] hover:text-[#DC2626]"
              >
                <EyeOff size={13} />
                <span>{sig.status === "dismissed" ? "Restore" : "Dismiss"}</span>
              </button>
            </div>
          ) : null}
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
