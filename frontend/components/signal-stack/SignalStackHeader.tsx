"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, RefreshCw } from "lucide-react";

import { fadeUp } from "@/lib/motion";
import type { SignalStack } from "@/lib/types";

export function SignalStackHeader({
  counts,
  isDiscovering,
  onRerunDiscovery,
  onOpenAddSource,
}: {
  counts: SignalStack["counts"] | null;
  isDiscovering: boolean;
  onRerunDiscovery: () => Promise<void>;
  onOpenAddSource: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const approved = counts?.approved ?? 0;
  const pending = counts?.needs_review ?? 0;
  const rejected = counts?.rejected ?? 0;

  return (
    <>
      <motion.div
        variants={fadeUp(reduced)}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
            Signal Stack
          </h1>
          <p className="mt-1 font-mono text-xs text-[#4B5058]">
            <span className="tabular font-medium text-[#059669]">{approved} approved</span>
            {" · "}
            <span className="tabular font-medium text-[#C2410C]">{pending} to review</span>
            {" · "}
            <span className="tabular">{rejected} rejected</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isDiscovering}
            onClick={() => setConfirmOpen(true)}
            className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/80 bg-white/65 px-4 text-xs font-medium text-[#1F2125] shadow-[0_6px_18px_rgba(31,33,37,0.04)] backdrop-blur-md hover:bg-white disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              strokeWidth={1.75}
              className={isDiscovering ? "animate-spin" : ""}
              aria-hidden="true"
            />
            {isDiscovering ? "Discovering…" : "Re-run discovery"}
          </button>

          <button
            type="button"
            onClick={onOpenAddSource}
            className="btn-motion focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_10px_22px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32]"
          >
            <Plus size={14} strokeWidth={2} aria-hidden="true" />
            Add source
          </button>
        </div>
      </motion.div>

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rediscover-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2125]/25 p-4 backdrop-blur-sm"
        >
          <div className="glass-strong w-full max-w-md space-y-4 rounded-2xl p-6">
            <h2 id="rediscover-title" className="text-base font-semibold text-[#1F2125]">
              Re-run source discovery?
            </h2>
            <p className="text-xs leading-relaxed text-[#4B5058]">
              Signal Stack will search for additional public sources based on your company profile
              and founder interview. Your existing approved, rejected, and custom sources will be
              kept intact.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3.5 py-2 text-xs font-medium text-[#1F2125]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDiscovering}
                onClick={async () => {
                  setConfirmOpen(false);
                  await onRerunDiscovery();
                }}
                className="focus-ring rounded-xl bg-[#1C1D21] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#2a2c32]"
              >
                Run discovery
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
