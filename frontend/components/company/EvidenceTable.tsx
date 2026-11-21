"use client";

import { ExternalLink } from "lucide-react";

import type { Evidence } from "@/lib/types";
import { formatDomainPath, formatShortDate } from "@/lib/company-adapter";
import { EmptyState, GlassCard, SectionHeader, StatusPill } from "@/components/ui-shared";

export function EvidenceTable({ evidence }: { evidence: Evidence[] }) {
  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Evidence sources"
        subtitle="Every public page fetched during research and which claims it backs."
      />

      {evidence.length === 0 ? (
        <EmptyState
          title="No evidence pages recorded yet"
          description="Run research to fetch public pages and attach source URLs."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#1F2125]/10 font-mono text-[11px] uppercase text-[#9AA0AA]">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Source</th>
                <th className="py-2.5 pr-4 font-medium">Type</th>
                <th className="py-2.5 pr-4 font-medium">Used for</th>
                <th className="py-2.5 pr-4 font-medium">Fetched</th>
                <th className="py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2125]/6">
              {evidence.map((row) => (
                <tr key={row.id} className="align-middle text-[#1F2125]">
                  <td className="max-w-[260px] py-2.5 pr-4">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 font-mono text-[11.5px] text-[#2563EB] no-underline hover:underline"
                    >
                      <span className="truncate">{formatDomainPath(row.url)}</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  </td>
                  <td className="py-2.5 pr-4 capitalize text-[#4B5058]">{row.type}</td>
                  <td className="py-2.5 pr-4 text-[#4B5058]">{row.usedFor}</td>
                  <td className="tabular whitespace-nowrap py-2.5 pr-4 font-mono text-[11px] text-[#9AA0AA]">
                    {formatShortDate(row.fetchedAt)}
                  </td>
                  <td className="py-2.5">
                    <StatusPill tone={row.verified ? "verified" : "warning"}>
                      {row.verified ? "Verified" : "Unverified"}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
