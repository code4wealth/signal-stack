"use client";

import { ArrowRight, Clock, Lock, Sparkles } from "lucide-react";

import { GlassCard } from "@/components/ui-shared";

export function StartCard({
  companyName,
  servicesCount,
  competitorsCount,
  isStarting,
  error,
  onStart,
}: {
  companyName: string;
  servicesCount: number;
  competitorsCount: number;
  isStarting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-1 items-center py-10">
      <GlassCard className="w-full space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4F46E5]/12 text-[#4F46E5]">
            <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.02em] text-[#1F2125]">
              Ready for a 10-question interview?
            </h1>
            <p className="text-xs text-[#4B5058]">About 5 minutes · Personalized for {companyName}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[#4B5058]">
          We analyzed {servicesCount} service{servicesCount === 1 ? "" : "s"} and {competitorsCount}{" "}
          competitor{competitorsCount === 1 ? "" : "s"} from public research. Your answers shape
          which sources Signal Stack monitors and what appears in your Monday Morning Brief.
        </p>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/80 bg-white/60 px-4 py-3 text-xs text-[#4B5058]">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} className="text-[#4F46E5]" aria-hidden="true" />
            Asked one at a time
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} className="text-[#4F46E5]" aria-hidden="true" />
            Skip anything confidential
          </span>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#B91C1C]">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          className="btn-motion focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-[#1C1D21] px-5 text-sm font-medium text-white shadow-[0_10px_24px_rgba(28,29,33,0.18)] hover:bg-[#2a2c32] disabled:opacity-55"
        >
          {isStarting ? "Generating 10 questions…" : "Start interview"}
          <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </GlassCard>
    </div>
  );
}
