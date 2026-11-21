"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Globe, Loader2, Lock, Paperclip, Sparkles } from "lucide-react";

import { QuoteChip } from "@/components/interview/QuoteChip";

const MAX_CHARS = 1000;

export function Composer({
  value,
  onChange,
  quotedText,
  onClearQuote,
  model,
  disabled,
  disabledReason,
  isSubmitting,
  isSkipping,
  focusTrigger,
  error,
  onRetry,
  onSubmit,
  onSkip,
  hideSkip = false,
  placeholder,
  ariaLabel = "Interview answer composer",
}: {
  value: string;
  onChange: (next: string) => void;
  quotedText: string | null;
  onClearQuote: () => void;
  model?: string;
  disabled: boolean;
  disabledReason?: string;
  isSubmitting: boolean;
  isSkipping?: boolean;
  focusTrigger: number;
  error: string | null;
  onRetry?: () => void;
  onSubmit: () => void;
  onSkip?: () => void;
  hideSkip?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [enterToSend, setEnterToSend] = useState(true);
  const [attachNotice, setAttachNotice] = useState(false);

  // Auto-grow textarea up to 6 rows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 6 * 22 + 12;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  // Move focus to composer when new question appears or quote added
  useEffect(() => {
    if (focusTrigger > 0 && !disabled) {
      textareaRef.current?.focus();
    }
  }, [focusTrigger, disabled]);

  // Inline 4-second skip confirmation timer
  useEffect(() => {
    if (!confirmingSkip) return;
    const timer = setTimeout(() => setConfirmingSkip(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingSkip]);

  const canSend = !disabled && !isSubmitting && !isSkipping && value.trim().length > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter") {
      if (event.metaKey || event.ctrlKey || (enterToSend && !event.shiftKey)) {
        event.preventDefault();
        if (canSend) onSubmit();
      }
    }
  }

  return (
    <div className="space-y-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3.5 py-2 text-xs text-[#B91C1C]"
        >
          <span>{error}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring rounded-lg bg-white px-2.5 py-1 font-medium text-[#1F2125] shadow-sm"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={`glass-strong rounded-[28px] px-4 py-3 transition-shadow focus-within:ring-2 focus-within:ring-[#4F46E5]/40 ${
          disabled ? "opacity-75" : ""
        }`}
      >
        {quotedText ? <QuoteChip text={quotedText} onRemove={onClearQuote} /> : null}

        <textarea
          ref={textareaRef}
          rows={2}
          maxLength={MAX_CHARS}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? disabledReason || "Waiting for next question…"
              : placeholder || "Type your answer..."
          }
          aria-label={ariaLabel}
          className="w-full resize-none bg-transparent text-sm leading-relaxed text-[#1F2125] placeholder:text-[#9AA0AA] focus:outline-none disabled:cursor-not-allowed"
        />

        {/* Controls row */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-2.5">
          {/* Bottom-left controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                aria-label="Attach a file (CSV, Excel, PDF, TXT) — Coming in Internal Data step"
                title="Attach a file (CSV, Excel, PDF, TXT) — Coming in Internal Data step"
                onClick={() => {
                  setAttachNotice(true);
                  setTimeout(() => setAttachNotice(false), 2600);
                }}
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#9AA0AA] transition-colors hover:bg-white/75 hover:text-[#4B5058]"
              >
                <Paperclip size={15} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {attachNotice ? (
                <span className="glass-strong absolute bottom-full left-0 z-20 mb-2 whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-medium text-[#4B5058]">
                  Coming in Internal Data step
                </span>
              ) : null}
            </div>

            <span
              role="note"
              title="Answers are private to your workspace"
              aria-label="Answers are private to your workspace"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#4B5058]"
            >
              <Globe size={15} strokeWidth={1.75} aria-hidden="true" />
            </span>

            {model ? (
              <span className="hidden items-center gap-1 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 font-mono text-[11px] text-[#4B5058] sm:inline-flex">
                <Sparkles size={11} className="text-[#4F46E5]" aria-hidden="true" />
                Groq · {model}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => setEnterToSend((prev) => !prev)}
              title="Toggle Enter key behavior"
              className="focus-ring hidden rounded-full px-2 py-0.5 font-mono text-[10px] text-[#9AA0AA] hover:bg-white/70 hover:text-[#4B5058] md:inline-flex"
            >
              {enterToSend ? "↵ sends" : "⌘↵ sends"}
            </button>
          </div>

          {/* Bottom-right: char count + Skip + Send */}
          <div className="flex items-center gap-2">
            <span className="tabular font-mono text-[11px] text-[#9AA0AA]">
              {value.length}/{MAX_CHARS}
            </span>

            {hideSkip || !onSkip ? null : confirmingSkip ? (
              <div className="flex items-center gap-1 rounded-full border border-[#EA580C]/30 bg-white px-2.5 py-1 text-xs">
                <span className="text-[#4B5058]">Skip this question?</span>
                <button
                  type="button"
                  disabled={disabled || isSkipping}
                  onClick={() => {
                    setConfirmingSkip(false);
                    onSkip();
                  }}
                  className="focus-ring font-semibold text-[#DC2626] hover:underline"
                >
                  Confirm
                </button>
                <span className="text-[#9AA0AA]">/</span>
                <button
                  type="button"
                  onClick={() => setConfirmingSkip(false)}
                  className="focus-ring text-[#4B5058] hover:text-[#1F2125]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled || isSubmitting || isSkipping}
                onClick={() => setConfirmingSkip(true)}
                className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-[#4B5058] transition-colors hover:bg-white/80 hover:text-[#1F2125] disabled:opacity-45"
              >
                <Lock size={12} strokeWidth={1.75} aria-hidden="true" />
                <span className="hidden sm:inline">Skip (confidential)</span>
                <span className="sm:hidden">Skip</span>
              </button>
            )}

            <button
              type="button"
              disabled={!canSend}
              onClick={onSubmit}
              aria-label="Send answer"
              className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 ${
                canSend
                  ? "bg-[#1C1D21] text-white shadow-[0_6px_16px_rgba(28,29,33,0.2)] hover:bg-[#2a2c32]"
                  : "bg-[#CBD5E1]/70 text-white/90 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
