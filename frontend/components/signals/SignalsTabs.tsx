"use client";

import type { SignalsOverviewResponse, SignalTab } from "@/lib/types";

export function SignalsTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: SignalTab;
  counts?: SignalsOverviewResponse["countsByStatus"] | null;
  onChange: (next: SignalTab) => void;
}) {
  const tabs: { key: SignalTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "feed", label: "Feed", count: counts ? counts.all - counts.dismissed : undefined },
    { key: "opportunities", label: "Opportunities", count: counts?.opportunities },
    { key: "threats", label: "Threats", count: counts?.threats },
    { key: "saved", label: "Saved", count: counts?.saved },
    { key: "dismissed", label: "Dismissed", count: counts?.dismissed },
  ];

  return (
    <div
      role="tablist"
      aria-label="Signals views"
      className="flex items-center gap-1 overflow-x-auto border-b border-[#1F2125]/10 pb-px"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`focus-ring relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${
              isActive
                ? "border-[#1C1D21] text-[#1F2125]"
                : "border-transparent text-[#4B5058] hover:text-[#1F2125]"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={`tabular rounded-full px-1.5 py-0.5 font-mono text-[10.5px] ${
                  isActive
                    ? "bg-[#1C1D21] text-white"
                    : "bg-white/80 text-[#4B5058]"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
