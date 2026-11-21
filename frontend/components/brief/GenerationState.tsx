"use client";

import { ResearchProgress } from "@/components/landing/ResearchProgress";
import { GlassCard } from "@/components/ui-shared";
import type { ResearchStatus } from "@/lib/api";
import type { BriefGenerationState } from "@/lib/types";

function mapBriefStatusToResearch(gen: BriefGenerationState): ResearchStatus {
  if (gen.status === "failed") return "error";
  const runningIdx = gen.steps.findIndex((s) => s.status === "running");
  if (runningIdx <= 0) return "reading_website";
  if (runningIdx === 1) return "identifying_services";
  if (runningIdx === 2) return "finding_competitors";
  return "building_profile";
}

export function GenerationState({
  companyName,
  websiteUrl,
  generation,
  onRetry,
  onCancelView,
}: {
  companyName: string;
  websiteUrl: string;
  generation: BriefGenerationState;
  onRetry: () => void;
  onCancelView: () => void;
}) {
  return (
    <GlassCard className="mx-auto max-w-[820px] p-5 sm:p-6">
      <ResearchProgress
        companyName={companyName}
        websiteUrl={websiteUrl}
        status={mapBriefStatusToResearch(generation)}
        error={generation.error ?? null}
        onRetry={onRetry}
        onEdit={onCancelView}
      />

      {generation.steps.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 px-2">
          {generation.steps.map((step) => (
            <span
              key={step.label}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                step.status === "done"
                  ? "border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0F766E]"
                  : step.status === "running"
                    ? "border-[#4F46E5]/30 bg-[#4F46E5]/10 text-[#4F46E5]"
                    : step.status === "failed"
                      ? "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#B91C1C]"
                      : "border-[#1F2125]/10 bg-white/70 text-[#9AA0AA]"
              }`}
            >
              {step.label}
            </span>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}
