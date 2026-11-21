"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowUpRight, Sparkles, Trash2, X } from "lucide-react";

import { Composer } from "@/components/interview/Composer";
import { SelectionReplyButton } from "@/components/interview/SelectionReplyButton";
import { ThinkingState } from "@/components/interview/ThinkingState";
import { useTextSelection } from "@/hooks/useTextSelection";
import { sidePanelSlide } from "@/lib/motion";
import type { AskMessage } from "@/lib/types";

export function AskAiPanel({
  open,
  messages,
  suggestedQuestions,
  quotedText,
  isPending,
  error,
  onSetQuote,
  onSend,
  onClear,
  onOpenCitation,
  onClose,
}: {
  open: boolean;
  messages: AskMessage[];
  suggestedQuestions: string[];
  quotedText: string | null;
  isPending: boolean;
  error: string | null;
  onSetQuote: (text: string | null) => void;
  onSend: (question: string) => void;
  onClear: () => void;
  onOpenCitation: (signalId: number) => void;
  onClose: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [draft, setDraft] = useState("");
  const [focusTrigger, setFocusTrigger] = useState(0);
  const { selection, buttonRef, clearSelection } = useTextSelection({
    onTriggerReply: (text) => {
      onSetQuote(text);
      setFocusTrigger((n) => n + 1);
    },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

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
          aria-label="Ask AI about signals"
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[440px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5]">
                <Sparkles size={16} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#1F2125]">Ask AI</h2>
                <p className="text-[11px] text-[#4B5058]">
                  Answers strictly cite collected signals
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {messages.length > 0 ? (
                <button
                  type="button"
                  onClick={onClear}
                  title="Clear session chat"
                  aria-label="Clear session chat"
                  className="focus-ring rounded-lg p-1.5 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Ask AI panel"
                className="focus-ring rounded-lg p-1.5 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="relative flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            <SelectionReplyButton
              selection={selection}
              buttonRef={buttonRef}
              onReply={(text) => {
                onSetQuote(text);
                clearSelection();
                setFocusTrigger((n) => n + 1);
              }}
            />

            {messages.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-white/85 bg-white/75 p-4">
                <p className="text-xs font-medium text-[#1F2125]">
                  Ask a question grounded in your analysed signals.
                </p>
                {suggestedQuestions.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
                      Suggested from your signals
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {suggestedQuestions.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => onSend(q)}
                          className="focus-ring rounded-xl border border-[#1F2125]/10 bg-white px-3 py-2 text-left text-xs text-[#1F2125] transition-colors hover:border-[#4F46E5]/40 hover:bg-indigo-50/40"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#4B5058]">
                    Type any question below to search and synthesize across verified evidence.
                  </p>
                )}
              </div>
            ) : null}

            {messages.map((msg) => (
              <div
                key={msg.id}
                data-reply-selectable={msg.role === "assistant" ? "true" : undefined}
                className={`rounded-2xl px-3.5 py-3 ${
                  msg.role === "user"
                    ? "ml-6 bg-[#1C1D21] text-white"
                    : msg.noEvidence
                      ? "mr-4 border border-[#EA580C]/25 bg-[#EA580C]/8 text-[#9A3412]"
                      : "mr-4 border border-white/85 bg-white/85 text-[#1F2125]"
                }`}
              >
                {msg.quotedText ? (
                  <p className="mb-1.5 border-l-2 border-white/40 pl-2 text-[11px] italic opacity-80">
                    “{msg.quotedText}”
                  </p>
                ) : null}

                {msg.noEvidence ? (
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-[#EA580C]" />
                    <p className="leading-relaxed">No supporting evidence found</p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                )}

                {msg.citations && msg.citations.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[#1F2125]/8 pt-2">
                    {msg.citations.map((cit) => (
                      <button
                        key={`${cit.signalId}-${cit.evidenceId}`}
                        type="button"
                        onClick={() => {
                          const num = Number(cit.signalId);
                          if (Number.isFinite(num)) onOpenCitation(num);
                        }}
                        className="focus-ring inline-flex items-center gap-1 rounded-full border border-[#4F46E5]/25 bg-indigo-50/80 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#4F46E5] hover:bg-indigo-100"
                      >
                        <span className="max-w-[190px] truncate">{cit.label}</span>
                        <ArrowUpRight size={10} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {isPending ? (
              <div className="mr-4">
                <ThinkingState status="Checking signal evidence..." />
              </div>
            ) : null}
          </div>

          {/* Composer */}
          <div className="border-t border-[#1F2125]/8 p-3">
            <Composer
              value={draft}
              onChange={setDraft}
              quotedText={quotedText}
              onClearQuote={() => onSetQuote(null)}
              disabled={false}
              isSubmitting={isPending}
              focusTrigger={focusTrigger}
              error={error}
              hideSkip
              placeholder="Ask about threats, opportunities, or evidence…"
              ariaLabel="Ask AI about signals"
              onSubmit={() => {
                if (!draft.trim()) return;
                onSend(draft);
                setDraft("");
              }}
            />
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
