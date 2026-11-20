"use client";

import { AlertCircle, Check, RotateCcw } from "lucide-react";

import type { ResearchStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";

const STEPS: { key: ResearchStatus; label: string }[] = [
  { key: "reading_website", label: "Reading website" },
  { key: "identifying_services", label: "Identifying services" },
  { key: "finding_competitors", label: "Finding competitors" },
  { key: "building_profile", label: "Building company profile" },
];

function stepIndex(status: ResearchStatus): number {
  if (status === "completed") return STEPS.length;
  if (status === "submitting" || status === "reading_website") return 0;
  const idx = STEPS.findIndex((step) => step.key === status);
  return idx === -1 ? 0 : idx;
}

export function ResearchProgress({
  companyName,
  websiteUrl,
  status,
  error,
  onRetry,
  onEdit,
}: {
  companyName: string;
  websiteUrl: string;
  status: ResearchStatus;
  error: string | null;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const activeIdx = stepIndex(status);

  return (
    <div className="space-y-5 px-2 py-2 sm:px-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1F2125]/8 pb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-[#4B5058]">
            {status === "error" ? "Research interrupted" : status === "completed" ? "Research complete" : "Researching live site"}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#1F2125]">
            {companyName} <span className="font-normal text-[#4B5058]">· {websiteUrl}</span>
          </h2>
        </div>
        {status !== "error" && status !== "completed" ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4F46E5]/25 bg-[#4F46E5]/10 px-3 py-1 font-mono text-xs font-medium text-[#4F46E5]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#4F46E5]" aria-hidden="true" />
            Live fetch
          </span>
        ) : null}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2" aria-label="Research steps">
        {STEPS.map((step, idx) => {
          const isCompleted = status === "completed" || (status !== "error" && idx < activeIdx);
          const isActive = status !== "completed" && status !== "error" && idx === activeIdx;
          return (
            <li
              key={step.key}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors ${
                isCompleted
                  ? "border-[#0D9488]/25 bg-[#0D9488]/5 text-[#1F2125]"
                  : isActive
                    ? "border-[#4F46E5]/30 bg-white/80 text-[#1F2125] shadow-sm"
                    : "border-[#1F2125]/6 bg-white/35 text-[#9AA0AA]"
              }`}
            >
              {isCompleted ? (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0D9488] text-white"
                  aria-hidden="true"
                >
                  <Check size={14} strokeWidth={2.5} />
                </span>
              ) : isActive ? (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/15"
                  aria-hidden="true"
                >
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#4F46E5]" />
                </span>
              ) : (
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1F2125]/12 bg-white/60 text-xs font-mono text-[#9AA0AA]"
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
              )}
              <span className={isCompleted || isActive ? "font-medium" : "font-normal"}>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {status === "error" && error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-4 py-3.5 text-sm text-[#991B1B] sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#DC2626]" />
            <span>{error}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit details
            </Button>
            <Button size="sm" onClick={onRetry}>
              <RotateCcw size={13} /> Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
