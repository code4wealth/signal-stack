"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw } from "lucide-react";

import type { Brief } from "@/lib/types";

export function BriefFooterBar({
  brief,
  onMarkReady,
  isPatching,
  onRegenerate,
  isRegenerating,
  onOpenEmail,
}: {
  brief: Brief;
  onMarkReady: () => void;
  isPatching: boolean;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onOpenEmail: () => void;
}) {
  const [confirmRegen, setConfirmRegen] = useState(false);

  return (
    <footer className="brief-sticky-footer no-print sticky bottom-3 z-20 mx-auto mt-8 max-w-[1160px]">
      <div className="glass-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(31,33,37,0.1)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/company/${brief.companyId}/dashboard`}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs font-medium text-[#4B5058] no-underline hover:text-[#1F2125]"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            Back to dashboard
          </Link>
          <span className="rounded-full border border-[#1F2125]/10 bg-white/80 px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase text-[#4B5058]">
            v{brief.version} · {brief.status}
          </span>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          {brief.status === "draft" && !brief.isArchived ? (
            <button
              type="button"
              disabled={isPatching}
              onClick={onMarkReady}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-[#059669]/30 bg-[#059669]/10 px-3 py-1.5 text-xs font-semibold text-[#047857] hover:bg-[#059669]/15 disabled:opacity-50"
            >
              <CheckCircle2 size={13} aria-hidden="true" />
              Mark as ready
            </button>
          ) : null}

          <button
            type="button"
            onClick={onOpenEmail}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs font-medium text-[#1F2125] hover:bg-[#F4F6FB]"
          >
            <Mail size={13} aria-hidden="true" />
            Email me this
          </button>

          <div className="relative">
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => setConfirmRegen((v) => !v)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-[#1C1D21] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1C1D21]/90 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isRegenerating ? "animate-spin" : ""} aria-hidden="true" />
              Regenerate
            </button>

            {confirmRegen ? (
              <div
                role="dialog"
                aria-label="Confirm regenerate brief"
                className="glass-strong absolute bottom-full right-0 mb-2 w-64 rounded-2xl p-3.5 shadow-xl"
              >
                <p className="text-xs font-semibold text-[#1F2125]">
                  Regenerate Monday Brief?
                </p>
                <p className="mt-1 text-[11.5px] text-[#4B5058]">
                  Creates a new version while preserving this edition in History.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRegen(false)}
                    className="focus-ring rounded-lg border border-[#1F2125]/15 bg-white px-2.5 py-1 text-xs font-medium text-[#4B5058]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRegen(false);
                      onRegenerate();
                    }}
                    className="focus-ring rounded-lg bg-[#1C1D21] px-2.5 py-1 text-xs font-medium text-white"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
