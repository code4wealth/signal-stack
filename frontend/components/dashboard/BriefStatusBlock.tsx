"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Settings } from "lucide-react";

import { formatRelativeTime, formatShortDate } from "@/lib/company-adapter";

export function BriefStatusBlock({
  companyId,
  brief,
}: {
  companyId: number;
  brief?: {
    nextRunAt?: string | null;
    lastGeneratedAt?: string | null;
    latestBriefId?: string | null;
  } | null;
}) {
  const nextDateStr = brief?.nextRunAt
    ? new Date(brief.nextRunAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-white/90 bg-white/75 p-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#1C1D21] text-white">
            <FileText size={13} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-xs font-semibold text-[#1F2125]">Monday Brief</h3>
            <p className="font-mono text-[10.5px] text-[#9AA0AA]">Executive cadence</p>
          </div>
        </div>

        <div className="space-y-2 border-t border-[#1F2125]/8 pt-3 text-xs">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
              Next brief
            </p>
            {nextDateStr ? (
              <p className="mt-0.5 flex items-center gap-1.5 font-medium text-[#1F2125]">
                <CalendarClock size={12} className="text-[#4F46E5]" aria-hidden="true" />
                <span>{nextDateStr}</span>
              </p>
            ) : (
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="text-[#4B5058]">No schedule set</span>
                <Link
                  href={`/company/${companyId}/automation`}
                  className="inline-flex items-center gap-1 font-mono text-[10.5px] font-medium text-[#4F46E5] no-underline hover:underline"
                >
                  <Settings size={10} aria-hidden="true" />
                  Automation
                </Link>
              </div>
            )}
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
              Last generated
            </p>
            <p className="mt-0.5 text-[#4B5058]">
              {brief?.lastGeneratedAt
                ? `${formatRelativeTime(brief.lastGeneratedAt)} (${formatShortDate(brief.lastGeneratedAt)})`
                : "Not generated yet"}
            </p>
          </div>
        </div>
      </div>

      <Link
        href={
          brief?.latestBriefId
            ? `/company/${companyId}/brief/${brief.latestBriefId}`
            : `/company/${companyId}/brief`
        }
        className="focus-ring inline-flex items-center justify-between rounded-xl border border-[#1F2125]/10 bg-white px-3 py-2 text-xs font-medium text-[#1F2125] no-underline transition-colors hover:border-[#4F46E5]/30 hover:text-[#4F46E5]"
      >
        <span>{brief?.latestBriefId ? "Preview brief" : "Create first brief"}</span>
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}
