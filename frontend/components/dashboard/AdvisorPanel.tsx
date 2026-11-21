"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowUpRight, CheckCircle2, PanelRightClose, Sparkles, Trash2, X } from "lucide-react";

import { Composer } from "@/components/interview/Composer";
import { SelectionReplyButton } from "@/components/interview/SelectionReplyButton";
import { ThinkingState } from "@/components/interview/ThinkingState";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { useTextSelection } from "@/hooks/useTextSelection";
import { fadeUp, sidePanelSlide, springSoft } from "@/lib/motion";
import type { AskMessage } from "@/lib/types";
import { AnswerCardView } from "./AnswerCardView";

export function AdvisorPanel({
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
  const { reduced } = useMotionSafe();
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

  const panelBody = (
    <div className="flex h-full flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#1F2125]/8 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5]">
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#1F2125]">AI Advisor</h2>
            <p className="text-[11px] text-[#4B5058]">Grounded in collected evidence</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear advisor chat"
              title="Clear session chat"
              className="focus-ring rounded-lg p-1.5 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Collapse AI Advisor panel"
            className="focus-ring rounded-lg p-1.5 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
          >
            <PanelRightClose size={15} className="hidden 2xl:block" aria-hidden="true" />
            <X size={15} className="2xl:hidden" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Conversation */}
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
              Ask about priorities, threats, or what changed across your Signal Stack.
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
                Every answer cites real collected signals or reports when no supporting evidence exists.
              </p>
            )}
          </div>
        ) : null}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            variants={fadeUp(reduced)}
            initial="hidden"
            animate="visible"
            data-reply-selectable={msg.role === "assistant" ? "true" : undefined}
            className={`rounded-2xl px-3.5 py-3 ${
              msg.role === "user"
                ? "ml-6 bg-[#1C1D21] text-white"
                : msg.noEvidence
                  ? "mr-2 border border-[#EA580C]/25 bg-[#EA580C]/8 text-[#9A3412]"
                  : "mr-2 border border-white/85 bg-white/85 text-[#1F2125]"
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
              <>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                <AnswerCardView
                  answerCard={msg.answerCard}
                  recommendation={msg.recommendation}
                />
              </>
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
                    className="focus-ring inline-flex max-w-full items-center gap-1 rounded-full border border-[#059669]/25 bg-[#059669]/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#047857] hover:bg-[#059669]/15"
                  >
                    <CheckCircle2 size={10} className="shrink-0" aria-hidden="true" />
                    <span className="max-w-[180px] truncate">{cit.label}</span>
                    <ArrowUpRight size={10} className="shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}
          </motion.div>
        ))}

        {isPending ? (
          <div className="mr-2">
            <ThinkingState status="Checking signal evidence..." />
          </div>
        ) : null}

        {messages.length > 0 &&
        !isPending &&
        suggestedQuestions.length > 0 &&
        !(messages[messages.length - 1]?.citations?.length) ? (
          <div className="mr-2 space-y-1.5 rounded-2xl border border-white/85 bg-white/75 p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
              Try asking about your signals
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
        ) : null}
      </div>

      {/* Follow-up composer */}
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
          placeholder="Ask AI follow-up..."
          ariaLabel="Ask AI advisor follow-up"
          onSubmit={() => {
            if (!draft.trim()) return;
            onSend(draft);
            setDraft("");
          }}
        />
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <>
      {/* >=1440px (2xl in Tailwind 1536, or custom min-[1440px]): docked right rail */}
      <aside
        aria-label="AI Advisor"
        className="glass-strong sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[360px] shrink-0 border-l border-white/80 min-[1440px]:block"
      >
        {panelBody}
      </aside>

      {/* <1440px: slide-over on tablet/laptop, bottom sheet on <768px */}
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-end justify-end md:items-stretch min-[1440px]:hidden">
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
            transition={reduced ? undefined : springSoft}
            role="dialog"
            aria-modal="true"
            aria-label="AI Advisor"
            className="glass-strong relative z-10 flex h-[82vh] w-full flex-col rounded-t-[28px] border-t border-white/85 md:h-full md:w-[360px] md:rounded-none md:border-l md:border-t-0"
          >
            {panelBody}
          </motion.aside>
        </div>
      </AnimatePresence>
    </>
  );
}
