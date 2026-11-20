"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, Lock, Pencil, Quote, X } from "lucide-react";

import { founderPillEnter } from "@/lib/motion";
import type { TurnAnswer } from "@/lib/types";

export function FounderAnswer({
  turnIndex,
  answer,
  forceEditing,
  onCancelForceEdit,
  onSaveEdit,
  isSaving,
}: {
  turnIndex: number;
  answer: TurnAnswer;
  forceEditing?: boolean;
  onCancelForceEdit?: () => void;
  onSaveEdit: (turnIndex: number, text: string) => Promise<void>;
  isSaving: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer.text ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraft(answer.text ?? "");
  }, [answer.text]);

  useEffect(() => {
    if (forceEditing) {
      setEditing(true);
      setDraft(answer.text ?? "");
    }
  }, [forceEditing, answer.text]);

  async function commit() {
    const clean = draft.trim();
    if (!clean) return;
    await onSaveEdit(turnIndex, clean);
    setEditing(false);
    onCancelForceEdit?.();
  }

  function cancel() {
    setDraft(answer.text ?? "");
    setEditing(false);
    onCancelForceEdit?.();
  }

  async function handleCopy() {
    if (!answer.text) return;
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard permission denied */
    }
  }

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%] space-y-2 rounded-2xl border border-[#4F46E5]/35 bg-white/90 p-3.5 shadow-[0_8px_24px_rgba(31,33,37,0.06)]">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void commit();
              }
            }}
            aria-label={`Edit answer for question ${turnIndex + 1}`}
            placeholder="Write your updated answer…"
            className="focus-ring w-full resize-none rounded-xl border border-[#1F2125]/10 bg-white px-3 py-2 text-sm text-[#1F2125] outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl px-3 text-xs font-medium text-[#4B5058] hover:bg-[#F4F6FB]"
            >
              <X size={13} /> Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || draft.trim().length === 0}
              onClick={() => void commit()}
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-50"
            >
              <Check size={13} /> {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (answer.skipped) {
    return (
      <motion.div
        variants={founderPillEnter(reduced)}
        initial="hidden"
        animate="visible"
        className="flex justify-end"
      >
        <div className="inline-flex items-center gap-2.5 rounded-2xl border border-dashed border-[#94A3B8] bg-white/60 px-4 py-2.5 text-xs text-[#4B5058]">
          <Lock size={13} strokeWidth={1.75} className="text-[#9AA0AA]" aria-hidden="true" />
          <span>Skipped (confidential)</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="focus-ring font-medium text-[#4F46E5] hover:underline"
          >
            Answer instead
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={founderPillEnter(reduced)}
      initial="hidden"
      animate="visible"
      className="group flex flex-col items-end gap-1.5"
    >
      <div className="max-w-[85%] rounded-2xl border border-white/75 bg-white/85 px-4 py-3 text-sm leading-relaxed text-[#1F2125] shadow-[0_8px_24px_rgba(31,33,37,0.05)]">
        {answer.quotedText ? (
          <div className="mb-2 flex items-start gap-1.5 rounded-xl bg-[#EEF2FF] px-2.5 py-1.5 text-xs text-[#4338CA]">
            <Quote size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 italic">{answer.quotedText}</span>
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{answer.text}</p>
      </div>

      <div className="flex items-center gap-2 px-1">
        {answer.editedAt ? (
          <span className="font-mono text-[10px] text-[#9AA0AA]">edited</span>
        ) : null}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit answer ${turnIndex + 1}`}
            title="Edit answer"
            className="focus-ring inline-flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] text-[#4B5058] hover:bg-white/80 hover:text-[#1F2125]"
          >
            <Pencil size={11} strokeWidth={1.75} /> Edit
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={`Copy answer ${turnIndex + 1}`}
            title="Copy answer"
            className="focus-ring inline-flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] text-[#4B5058] hover:bg-white/80 hover:text-[#1F2125]"
          >
            {copied ? <Check size={11} className="text-[#059669]" /> : <Copy size={11} strokeWidth={1.75} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
