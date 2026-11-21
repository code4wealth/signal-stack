"use client";

import { useReducedMotion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SignalDailyBucket, SignalRange } from "@/lib/types";
import { EmptyState, GlassCard } from "@/components/ui-shared";

type ChartRow = SignalDailyBucket & { label: string };

function formatDay(dateStr: string, range: SignalRange): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  if (range === "week") {
    return dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function DarkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-2xl border border-white/15 bg-[#1C1D21] px-3.5 py-2.5 text-xs text-white shadow-xl">
      <p className="font-mono text-[11px] font-semibold text-white/90">{row.date}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-white/80">
            <span className="inline-block h-2 w-2 rounded-full bg-[#16A34A]" />
            Opportunities
          </span>
          <span className="tabular font-mono font-semibold">{row.opportunities}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-white/80">
            <span className="inline-block h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-[#DC2626]" />
            Threats
          </span>
          <span className="tabular font-mono font-semibold">{row.threats}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-white/80">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-[#94A3B8]" />
            Neutral
          </span>
          <span className="tabular font-mono font-semibold">{row.neutral}</span>
        </div>
      </div>
      {row.topHeadline ? (
        <p className="mt-2 max-w-[220px] truncate border-t border-white/15 pt-1.5 text-[10.5px] text-white/80">
          Top: {row.topHeadline}
        </p>
      ) : null}
    </div>
  );
}

export function SignalVolumeChart({
  daily,
  range,
  previousPeriodTotal,
  onSelectDate,
}: {
  daily: SignalDailyBucket[];
  range: SignalRange;
  previousPeriodTotal: number;
  onSelectDate: (date: string) => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const totalInRange = daily.reduce(
    (sum, d) => sum + d.opportunities + d.threats + d.neutral,
    0,
  );
  const data: ChartRow[] = daily.map((d) => ({
    ...d,
    label: formatDay(d.date, range),
  }));

  return (
    <GlassCard className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#4B5058]">Signal volume</p>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="tabular text-[28px] font-semibold leading-none tracking-[-0.03em] text-[#1F2125]">
              {totalInRange}
            </span>
            <span className="font-mono text-[11px] text-[#9AA0AA]">
              {previousPeriodTotal > 0 ? `vs ${previousPeriodTotal} prev period` : "in selected range"}
            </span>
          </div>
        </div>

        {/* Distinct line style + marker shape legend (never color alone) */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#4B5058]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="h-[2px] w-3 bg-[#16A34A]" />
              <span className="-ml-1.5 h-2 w-2 rounded-full bg-[#16A34A]" />
            </span>
            Opportunities
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="h-0 w-3 border-t-2 border-dashed border-[#DC2626]" />
              <span className="-ml-1.5 h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-[#DC2626]" />
            </span>
            Threats
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="h-0 w-3 border-t-2 border-dotted border-[#64748B]" />
              <span className="-ml-1.5 h-2 w-2 rounded-[2px] bg-[#64748B]" />
            </span>
            Neutral
          </span>
        </div>
      </div>

      {totalInRange === 0 ? (
        <EmptyState
          title="No signals in this window"
          description="Run signal analysis or switch the date range to inspect collected intelligence."
        />
      ) : (
        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
              onClick={(state) => {
                const idx = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : -1;
                const clicked = idx >= 0 ? data[idx] : undefined;
                if (clicked?.date) onSelectDate(clicked.date);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,33,37,0.07)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9AA0AA" }}
                axisLine={false}
                tickLine={false}
                minTickGap={22}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9AA0AA" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ stroke: "rgba(31,33,37,0.18)" }} />
              <Line
                type="monotone"
                dataKey="opportunities"
                stroke="#16A34A"
                strokeWidth={2}
                dot={{ r: 3, fill: "#16A34A", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={!reduced}
              />
              <Line
                type="monotone"
                dataKey="threats"
                stroke="#DC2626"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: "#DC2626", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={!reduced}
              />
              <Line
                type="monotone"
                dataKey="neutral"
                stroke="#64748B"
                strokeWidth={2}
                strokeDasharray="2 3"
                dot={{ r: 2.5, fill: "#64748B", strokeWidth: 0 }}
                activeDot={{ r: 4.5 }}
                isAnimationActive={!reduced}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="font-mono text-[10.5px] text-[#9AA0AA]">
        Click any day on the chart to filter the Feed to that date.
      </p>
    </GlassCard>
  );
}
