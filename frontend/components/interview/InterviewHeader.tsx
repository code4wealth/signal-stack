"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Download,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { useAppShell } from "@/components/shell/AppShell";
import type { Interview } from "@/lib/types";

export function InterviewHeader({
  companyName,
  interview,
  useContext,
  onToggleContext,
  learnedOpen,
  onToggleLearned,
  onRestart,
  isResetting,
}: {
  companyName: string;
  interview: Interview | null;
  useContext: boolean;
  onToggleContext: () => void;
  learnedOpen: boolean;
  onToggleLearned: () => void;
  onRestart: () => Promise<void>;
  isResetting: boolean;
}) {
  const { focusMode, toggleFocusMode } = useAppShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);

  const learnedCount = interview?.learned.length ?? 0;

  function handleExportJson() {
    if (!interview) return;
    const blob = new Blob([JSON.stringify(interview, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-interview.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  return (
    <>
      <div className="flex h-14 items-center justify-between gap-3 border-b border-[#1F2125]/8 px-1">
        {/* Left: Icon + title with dropdown chevron */}
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTitleMenuOpen((prev) => !prev)}
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-[#1F2125] transition-colors hover:bg-white/70"
            aria-expanded={titleMenuOpen}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#4F46E5]/12 text-[#4F46E5]">
              <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span>Founder interview</span>
            <ChevronDown size={14} className="text-[#9AA0AA]" aria-hidden="true" />
          </button>

          {titleMenuOpen ? (
            <div className="glass-strong absolute left-0 top-full z-30 mt-1 w-52 rounded-2xl p-1.5 text-xs">
              <button
                type="button"
                onClick={() => setTitleMenuOpen(false)}
                className="flex w-full items-center justify-between rounded-xl bg-white/80 px-3 py-2 text-left font-medium text-[#1F2125]"
              >
                <span>Current interview</span>
                <span className="font-mono text-[10px] text-[#4F46E5]">Active</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Center-right: Use research context toggle + action icons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={useContext}
            onClick={onToggleContext}
            title="Show research evidence and why each question is asked"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-[#4B5058] transition-colors hover:bg-white hover:text-[#1F2125]"
          >
            <span className="hidden sm:inline">Use research context</span>
            <span className="sm:hidden">Context</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                useContext ? "bg-[#4F46E5]" : "bg-[#CBD5E1]"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                  useContext ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleLearned}
            aria-label={learnedOpen ? "Hide learned panel" : "Show learned so far"}
            title="Learned so far"
            className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors ${
              learnedOpen
                ? "bg-white text-[#1F2125] shadow-sm"
                : "text-[#4B5058] hover:bg-white/70 hover:text-[#1F2125]"
            }`}
          >
            <BookOpen size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden md:inline">Learned</span>
            {learnedCount > 0 ? (
              <span className="tabular rounded-full bg-[#4F46E5]/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4F46E5]">
                {learnedCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={toggleFocusMode}
            aria-label={focusMode ? "Exit focus mode" : "Expand chat (focus mode)"}
            title={focusMode ? "Show sidebar" : "Expand chat"}
            className="focus-ring hidden h-8 w-8 items-center justify-center rounded-xl text-[#4B5058] transition-colors hover:bg-white/70 hover:text-[#1F2125] md:inline-flex"
          >
            {focusMode ? (
              <Minimize2 size={15} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="More interview options"
              title="More options"
              aria-expanded={menuOpen}
              className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#4B5058] transition-colors hover:bg-white/70 hover:text-[#1F2125]"
            >
              <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>

            {menuOpen ? (
              <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-52 space-y-1 rounded-2xl p-1.5 text-xs">
                <button
                  type="button"
                  disabled={!interview || interview.turns.length === 0}
                  onClick={handleExportJson}
                  className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#1F2125] hover:bg-white/80 disabled:opacity-45"
                >
                  <Download size={14} strokeWidth={1.75} />
                  Export answers (JSON)
                </button>
                <button
                  type="button"
                  disabled={!interview || interview.status === "not_started"}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmRestartOpen(true);
                  }}
                  className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#DC2626] hover:bg-[#DC2626]/10 disabled:opacity-45"
                >
                  <RotateCcw size={14} strokeWidth={1.75} />
                  Restart interview
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Restart confirmation dialog */}
      {confirmRestartOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2125]/25 p-4 backdrop-blur-sm"
        >
          <div className="glass-strong w-full max-w-md space-y-4 rounded-2xl p-6">
            <h2 id="restart-dialog-title" className="text-base font-semibold text-[#1F2125]">
              Restart founder interview?
            </h2>
            <p className="text-xs leading-relaxed text-[#4B5058]">
              This will permanently delete all {interview?.learned.length ?? 0} saved answers and
              generate a fresh set of 10 questions. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRestartOpen(false)}
                className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3.5 py-2 text-xs font-medium text-[#1F2125]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={async () => {
                  await onRestart();
                  setConfirmRestartOpen(false);
                }}
                className="focus-ring rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {isResetting ? "Restarting…" : "Delete answers & restart"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
