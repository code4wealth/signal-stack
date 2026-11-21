"use client";

import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";

import type { WorkflowStatus, WorkflowStepState } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

const STEPS: {
  key: keyof WorkflowStatus;
  title: string;
  description: string;
  hrefSuffix: string;
  cta: string;
}[] = [
  {
    key: "company",
    title: "1. Confirm company profile",
    description: "Verify live website research, core offerings, and market positioning.",
    hrefSuffix: "",
    cta: "Review profile",
  },
  {
    key: "interview",
    title: "2. Complete founder interview",
    description: "Share strategic priorities and blind spots so ranking reflects your goals.",
    hrefSuffix: "/interview",
    cta: "Continue interview",
  },
  {
    key: "sources",
    title: "3. Build your Signal Stack",
    description: "Approve customer, competitor, market, and internal sources to monitor.",
    hrefSuffix: "/signal-stack",
    cta: "Curate sources",
  },
  {
    key: "crawler",
    title: "4. Run your first source crawl",
    description: "Fetch real pages and verify robots.txt, freshness, and extraction health.",
    hrefSuffix: "/crawler",
    cta: "Open Crawler",
  },
  {
    key: "signals",
    title: "5. Analyse signals",
    description: "Score opportunities and threats backed by verbatim source quotes.",
    hrefSuffix: "/signals",
    cta: "Analyse signals",
  },
  {
    key: "briefs",
    title: "6. Generate Monday Morning Brief",
    description: "Turn top signals into an actionable weekly plan.",
    hrefSuffix: "/brief",
    cta: "Open Briefs",
  },
];

export function SetupChecklist({
  companyId,
  companyName,
  workflowStatus,
}: {
  companyId: number;
  companyName: string;
  workflowStatus: WorkflowStatus;
}) {
  const completedCount = Object.values(workflowStatus).filter((s) => s === "done").length;

  return (
    <GlassCard spotlight className="space-y-6 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F2125]/8 pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#4F46E5]">
            Workspace setup · {completedCount} of 6 complete
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#1F2125]">
            Finish setting up {companyName}
          </h2>
          <p className="mt-1 text-xs text-[#4B5058]">
            Complete onboarding and run your first source crawl to unlock live dashboard analytics.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-[#4F46E5]/25 bg-[#4F46E5]/10 px-3 py-1 font-mono text-xs font-medium text-[#4F46E5]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#4F46E5]" aria-hidden="true" />
          Setup in progress
        </span>
      </div>

      <ol className="space-y-3" aria-label="Onboarding setup steps">
        {STEPS.map((step) => {
          const state: WorkflowStepState = workflowStatus[step.key] ?? "locked";
          const isDone = state === "done";
          const isCurrent = state === "current";
          const isLocked = state === "locked";

          return (
            <li
              key={step.key}
              className={`flex flex-col justify-between gap-3 rounded-2xl border px-4 py-3.5 sm:flex-row sm:items-center ${
                isDone
                  ? "border-[#0D9488]/25 bg-[#0D9488]/5"
                  : isCurrent
                    ? "border-[#4F46E5]/35 bg-white/90 shadow-sm"
                    : "border-[#1F2125]/8 bg-white/45 opacity-75"
              }`}
            >
              <div className="flex items-start gap-3">
                {isDone ? (
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-white">
                    <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                ) : isCurrent ? (
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/15">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#4F46E5]" />
                  </span>
                ) : (
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1F2125]/12 bg-white/70 text-[#9AA0AA]">
                    <Lock size={12} aria-hidden="true" />
                  </span>
                )}

                <div>
                  <p className="text-sm font-semibold text-[#1F2125]">{step.title}</p>
                  <p className="mt-0.5 text-xs text-[#4B5058]">{step.description}</p>
                </div>
              </div>

              {!isLocked ? (
                <Link
                  href={`/company/${companyId}${step.hrefSuffix}`}
                  className={`btn-motion focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium no-underline ${
                    isCurrent
                      ? "bg-[#1C1D21] text-white hover:bg-[#2a2c32]"
                      : "border border-[#1F2125]/12 bg-white text-[#1F2125] hover:bg-[#F4F6FB]"
                  }`}
                >
                  <span>{isDone ? "Review" : step.cta}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ) : (
                <span className="shrink-0 font-mono text-[11px] text-[#9AA0AA]">
                  Locked until previous step
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
