"use client";

import { AlertTriangle, CalendarClock, TrendingUp } from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import type { SignalItem, SignalWatchlistItem } from "@/lib/types";
import { CategoryBadge, EmptyState, GlassCard, PriorityDots } from "@/components/ui-shared";

export function TopMovers({
  topOpportunities,
  topThreats,
  watchlist,
  onSelectSignal,
}: {
  topOpportunities: SignalItem[];
  topThreats: SignalItem[];
  watchlist: SignalWatchlistItem[];
  onSelectSignal: (signalId: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#16A34A]/10 text-[#16A34A]">
              <TrendingUp size={15} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1F2125]">Top opportunities</h2>
              <p className="text-[11px] text-[#4B5058]">Highest-ranked upside signals</p>
            </div>
          </div>

          {topOpportunities.length === 0 ? (
            <EmptyState
              title="No opportunities detected yet"
              description="Opportunities appear here once source analysis identifies positive signals."
            />
          ) : (
            <div className="space-y-2">
              {topOpportunities.map((sig) => (
                <button
                  key={sig.id}
                  type="button"
                  onClick={() => onSelectSignal(sig.id)}
                  className="focus-ring block w-full rounded-2xl border border-white/80 bg-white/75 p-3 text-left transition-colors hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <CategoryBadge category={sig.category} />
                    <PriorityDots priority={sig.priority} compact showWord={false} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#1F2125]">{sig.headline}</p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-[#4B5058]">
                    {sig.recommendedAction.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#DC2626]/10 text-[#DC2626]">
              <AlertTriangle size={15} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#1F2125]">Top threats</h2>
              <p className="text-[11px] text-[#4B5058]">Risks and competitor moves to watch</p>
            </div>
          </div>

          {topThreats.length === 0 ? (
            <EmptyState
              title="No threats detected yet"
              description="Threats appear here once source analysis identifies risks or competitive pressure."
            />
          ) : (
            <div className="space-y-2">
              {topThreats.map((sig) => (
                <button
                  key={sig.id}
                  type="button"
                  onClick={() => onSelectSignal(sig.id)}
                  className="focus-ring block w-full rounded-2xl border border-white/80 bg-white/75 p-3 text-left transition-colors hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <CategoryBadge category={sig.category} />
                    <PriorityDots priority={sig.priority} compact showWord={false} />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[#1F2125]">{sig.headline}</p>
                  <p className="mt-1 line-clamp-2 text-[11.5px] text-[#4B5058]">
                    {sig.recommendedAction.text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {watchlist.length > 0 ? (
        <GlassCard className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CalendarClock size={15} className="text-[#4F46E5]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[#1F2125]">Watchlist</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {watchlist.map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="rounded-xl border border-white/85 bg-white/75 px-3 py-2.5 text-xs"
              >
                <p className="font-medium text-[#1F2125]">{item.title}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[#9AA0AA]">
                  {item.domain}
                  {item.expectedAt ? ` · ${formatShortDate(item.expectedAt)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}
