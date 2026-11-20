"use client";

import { Check, ExternalLink, RefreshCw, RotateCcw, Settings, X } from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import type { SignalStackSource } from "@/lib/types";
import { CategoryBadge, GlassCard, StatusPill } from "@/components/ui-shared";

export function SourceTable({
  sources,
  onApprove,
  onReject,
  onRestore,
  onRecheck,
  onManage,
}: {
  sources: SignalStackSource[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onRestore: (id: number) => void;
  onRecheck: (id: number) => void;
  onManage: (src: SignalStackSource) => void;
}) {
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-[#1F2125]/10 bg-white/45 font-mono text-[11px] uppercase text-[#9AA0AA]">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Relevance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last checked</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1F2125]/6">
            {sources.map((src) => (
              <tr key={src.id} className="hover:bg-white/45">
                <td className="max-w-[260px] px-4 py-3">
                  <p className="truncate font-semibold text-[#1F2125]">{src.name}</p>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-[#2563EB] no-underline hover:underline"
                  >
                    <span className="truncate">{src.domain}</span>
                    <ExternalLink size={10} className="shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <CategoryBadge category={src.category} />
                </td>
                <td className="px-4 py-3 capitalize text-[#4B5058]">
                  {src.type} · {src.crawlMethod.toUpperCase()}
                </td>
                <td className="tabular px-4 py-3 font-mono font-semibold text-[#1F2125]">
                  {src.relevanceScore}/100
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    tone={
                      src.status === "approved"
                        ? "verified"
                        : src.status === "failing" || src.status === "blocked"
                          ? "threat"
                          : src.status === "rejected"
                            ? "neutral"
                            : "warning"
                    }
                  >
                    {src.status.replace("_", " ")}
                  </StatusPill>
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#9AA0AA]">
                  {src.lastCheckedAt ? formatRelativeTime(src.lastCheckedAt) : "Not checked yet"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    {src.status === "needs_review" && src.robotsAllowed ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onApprove(src.id)}
                          aria-label={`Approve ${src.name}`}
                          className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg bg-[#1C1D21] px-2.5 text-[11px] font-medium text-white"
                        >
                          <Check size={11} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onReject(src.id)}
                          aria-label={`Reject ${src.name}`}
                          className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2 text-[11px] text-[#4B5058]"
                        >
                          <X size={11} />
                        </button>
                      </>
                    ) : src.status === "failing" ? (
                      <button
                        type="button"
                        onClick={() => onRecheck(src.id)}
                        className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 text-[11px] font-medium text-[#1F2125]"
                      >
                        <RefreshCw size={11} /> Re-check
                      </button>
                    ) : src.status === "rejected" ? (
                      <button
                        type="button"
                        onClick={() => onRestore(src.id)}
                        className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 text-[11px] font-medium text-[#1F2125]"
                      >
                        <RotateCcw size={11} /> Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onManage(src)}
                        className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 text-[11px] font-medium text-[#1F2125]"
                      >
                        <Settings size={11} /> Manage
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
