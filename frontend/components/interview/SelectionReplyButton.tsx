"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Quote } from "lucide-react";

import type { ActiveTextSelection } from "@/hooks/useTextSelection";
import { floatingReplyMotion } from "@/lib/motion";

export function SelectionReplyButton({
  selection,
  buttonRef,
  onReply,
}: {
  selection: ActiveTextSelection | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onReply: (text: string) => void;
}) {
  const reduced = Boolean(useReducedMotion());

  return (
    <AnimatePresence>
      {selection ? (
        <motion.button
          ref={buttonRef}
          type="button"
          variants={floatingReplyMotion(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={() => onReply(selection.text)}
          style={{
            position: "fixed",
            top: `${selection.top}px`,
            left: `${selection.left}px`,
            zIndex: 60,
          }}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-[#1C1D21] px-3 py-1.5 text-xs font-medium text-white shadow-[0_12px_28px_rgba(28,29,33,0.28)]"
        >
          <Quote size={12} strokeWidth={2} aria-hidden="true" />
          <span>Reply</span>
          <kbd className="rounded bg-white/15 px-1 font-mono text-[10px] text-white/80">R</kbd>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
