"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

import type { SignalStackSource } from "@/lib/types";

export function ConfirmBar({
  companyId,
  sources,
  internalFilesCount,
  isConfirming,
  onStartMonitoring,
}: {
  companyId: number;
  sources: SignalStackSource[];
  internalFilesCount: number;
  isConfirming: boolean;
  onStartMonitoring: () => void;
}) {
  const approvedSources = sources.filter((s) => s.status === "approved");
  const requiredCategories = ["customers", "competitors", "market"] as const;

  const missingRequired = requiredCategories.filter(
    (cat) => !approvedSources.some((s) => s.category === cat),
  );
  const coveredCategories = new Set(approvedSources.map((s) => s.category));
  if (internalFilesCount > 0) coveredCategories.add("internal");

  const canStart = missingRequired.length === 0;

  return (
    <div className="glass-strong sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="space-y-1">
        <p className="text-xs font-medium text-[#1F2125]">
          <span className="tabular font-semibold">{approvedSources.length}</span> approved across{" "}
          <span className="tabular font-semibold">{coveredCategories.size}</span> categor
          {coveredCategories.size === 1 ? "y" : "ies"}
        </p>

        {missingRequired.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-[#C2410C]">
            <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
            <span>
              No approved{" "}
              <span className="font-medium">{missingRequired.join(", ")}</span> source
              {missingRequired.length === 1 ? "" : "s"} yet — approve at least 1 in Customers,
              Competitors, and Market to start monitoring.
            </span>
          </p>
        ) : internalFilesCount === 0 ? (
          <p className="text-[11px] text-[#4B5058]">
            Internal files are optional and can be uploaded anytime.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/company/${companyId}`}
          className="btn-motion focus-ring inline-flex h-9 items-center rounded-xl border border-white/80 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
        >
          Save and exit
        </Link>

        <button
          type="button"
          disabled={!canStart || isConfirming}
          onClick={onStartMonitoring}
          className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_8px_18px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#4B5058] disabled:shadow-none"
        >
          {isConfirming ? "Confirming…" : "Start monitoring"}
          <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
