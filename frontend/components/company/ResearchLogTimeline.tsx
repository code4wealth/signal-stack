"use client";

import type { LogEntry } from "@/lib/types";
import { formatRelativeTime, formatShortDate } from "@/lib/company-adapter";
import { EmptyState, GlassCard, SectionHeader, StatusPill } from "@/components/ui-shared";

export function ResearchLogTimeline({ entries }: { entries: LogEntry[] }) {
  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Research log"
        subtitle="Complete timeline of fetch, extraction, and confirmation events."
      />

      {entries.length === 0 ? (
        <EmptyState
          title="No log entries recorded"
          description="Research steps will appear here as soon as research runs."
        />
      ) : (
        <ol className="space-y-3 border-l border-[#1F2125]/12 pl-4">
          {entries.map((entry) => (
            <li key={entry.id} className="relative flex flex-wrap items-start justify-between gap-2 pb-2">
              <span
                aria-hidden="true"
                className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                  entry.status === "error"
                    ? "bg-[#DC2626]"
                    : entry.status === "running"
                      ? "bg-[#4F46E5]"
                      : entry.status === "ok"
                        ? "bg-[#059669]"
                        : "bg-[#2563EB]"
                }`}
              />
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-[#1F2125]">{entry.title}</p>
                  <StatusPill
                    tone={
                      entry.status === "error"
                        ? "threat"
                        : entry.status === "ok"
                          ? "verified"
                          : entry.status === "running"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {entry.status}
                  </StatusPill>
                </div>
                <p className="break-all font-mono text-[11px] text-[#4B5058]">{entry.detail}</p>
              </div>
              <div className="shrink-0 text-right font-mono text-[11px] text-[#9AA0AA]">
                <p>{formatRelativeTime(entry.at)}</p>
                <p className="text-[10px]">{formatShortDate(entry.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </GlassCard>
  );
}
