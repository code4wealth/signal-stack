"use client";

import { ResearchProgress } from "@/components/landing/ResearchProgress";
import type { ResearchStatus } from "@/lib/api";
import type { SignalAnalysisStep } from "@/lib/types";
import { GlassCard } from "@/components/ui-shared";

function mapToResearchStatus(steps: SignalAnalysisStep[], status: "running" | "failed"): ResearchStatus {
  if (status === "failed") return "error";
  const runningIdx = steps.findIndex((s) => s.status === "running");
  if (runningIdx <= 0) return "reading_website";
  if (runningIdx === 1) return "identifying_services";
  if (runningIdx === 2) return "finding_competitors";
  return "building_profile";
}

export function AnalysisProgress({
  companyName,
  websiteUrl,
  status,
  steps,
  error,
  onRetry,
  onDismissError,
}: {
  companyName: string;
  websiteUrl: string;
  status: "idle" | "running" | "failed";
  steps: SignalAnalysisStep[];
  error?: string | null;
  onRetry: () => void;
  onDismissError: () => void;
}) {
  if (status === "idle") return null;

  return (
    <GlassCard className="p-4">
      <ResearchProgress
        companyName={companyName}
        websiteUrl={websiteUrl}
        status={mapToResearchStatus(steps, status)}
        error={error ?? null}
        onRetry={onRetry}
        onEdit={onDismissError}
      />
      {steps.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 px-2">
          {steps.map((step) => (
            <span
              key={step.label}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[10.5px] ${
                step.status === "done"
                  ? "border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0F766E]"
                  : step.status === "running"
                    ? "border-[#4F46E5]/30 bg-[#4F46E5]/10 text-[#4F46E5]"
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
