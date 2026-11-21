"use client";

import { CheckCircle2, Globe, Sparkles, Swords, XCircle } from "lucide-react";

import type { LogEntry } from "@/lib/types";
import { formatRelativeTime } from "@/lib/company-adapter";
import { EmptyState, GlassCard, SectionHeader } from "@/components/ui-shared";

function ActivityIcon({ kind, status }: { kind: LogEntry["kind"]; status: LogEntry["status"] }) {
  if (status === "error") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#DC2626]/12 text-[#DC2626]">
        <XCircle size={14} strokeWidth={1.75} />
      </span>
    );
  }
  if (kind === "fetch") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#2563EB]/12 text-[#2563EB]">
        <Globe size={14} strokeWidth={1.75} />
      </span>
    );
  }
  if (kind === "competitors") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#EA580C]/12 text-[#EA580C]">
        <Swords size={14} strokeWidth={1.75} />
      </span>
    );
  }
  if (kind === "confirm") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#059669]/12 text-[#059669]">
        <CheckCircle2 size={14} strokeWidth={1.75} />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5]">
      <Sparkles size={14} strokeWidth={1.75} />
    </span>
  );
}

export function ResearchActivity({ entries }: { entries: LogEntry[] }) {
  const recent = entries.slice(0, 6);

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Recent research activity"
        subtitle="Recorded steps from live website fetches and profile extraction."
      />

      {recent.length === 0 ? (
        <EmptyState
          title="No research activity logged yet"
          description="Run company research to record fetched pages and extraction events."
        />
      ) : (
        <ul className="divide-y divide-[#1F2125]/8">
          {recent.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0.5 last:pb-0.5">
              <div className="flex min-w-0 items-start gap-3">
                <ActivityIcon kind={entry.kind} status={entry.status} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#1F2125]">{entry.title}</p>
                  <p className="truncate font-mono text-[11px] text-[#9AA0AA]">{entry.detail}</p>
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-[#9AA0AA]">
                {formatRelativeTime(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
