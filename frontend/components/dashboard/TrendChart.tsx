"use client";

import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import type { DashboardRange, DashboardTrendPoint } from "@/lib/types";

type TrendRow = DashboardTrendPoint & { label: string };

function formatTick(dateStr: string, range: DashboardRange): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  if (range === "week") {
    return dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function WhiteGlassTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: TrendRow }[];
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-strong rounded-2xl border border-white/95 px-3.5 py-2.5 text-xs shadow-xl">
      <p className="font-mono text-[11px] font-semibold text-[#1F2125]">{row.date}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4B5058]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4F46E5]" />
            Evidence collected
          </span>
          <span className="tabular font-mono font-semibold text-[#1F2125]">{row.evidence}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4B5058]">
            <span className="inline-block h-2 w-2 rotate-45 bg-[#059669]" />
            Signals created
          </span>
          <span className="tabular font-mono font-semibold text-[#1F2125]">{row.signals}</span>
        </div>
      </div>
      {row.topHeadline ? (
        <p className="mt-2 max-w-[230px] truncate border-t border-[#1F2125]/8 pt-1.5 text-[10.5px] text-[#4B5058]">
          Top: {row.topHeadline}
        </p>
      ) : null}
    </div>
  );
}

export function TrendChart({
  companyId,
  trend,
  range,
}: {
  companyId: number;
  trend: DashboardTrendPoint[];
  range: DashboardRange;
}) {
  const router = useRouter();
  const { reduced } = useMotionSafe();
  const totalEvidence = trend.reduce((acc, p) => acc + p.evidence, 0);
  const totalSignals = trend.reduce((acc, p) => acc + p.signals, 0);
  const hasData = totalEvidence > 0 || totalSignals > 0;

  const data: TrendRow[] = trend.map((p) => ({
    ...p,
    label: formatTick(p.date, range),
  }));

  return (
    <GlassCard spotlight className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2125]">Evidence and signals trend</h2>
          <p className="text-[11px] text-[#4B5058]">
            <span className="tabular font-mono font-semibold text-[#1F2125]">{totalEvidence}</span>{" "}
            evidence items ·{" "}
            <span className="tabular font-mono font-semibold text-[#1F2125]">{totalSignals}</span>{" "}
            signals created
          </p>
        </div>

        {/* Distinct shape + line style + color legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#4B5058]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="h-[2px] w-3 bg-[#4F46E5]" />
              <span className="-ml-1.5 h-2 w-2 rounded-full bg-[#4F46E5]" />
            </span>
            Evidence collected
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center" aria-hidden="true">
              <span className="h-0 w-3 border-t-2 border-dashed border-[#059669]" />
              <span className="-ml-1.5 h-2 w-2 rotate-45 bg-[#059669]" />
            </span>
            Signals created
          </span>
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          title="No trend activity yet"
          description="Evidence collected and signals created will plot here after your next crawl."
        />
      ) : (
        <div
          className="h-[235px] w-full"
          aria-label={`Trend chart showing ${totalEvidence} evidence items and ${totalSignals} signals`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
              onClick={(state) => {
                const idx = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : -1;
                const pt = idx >= 0 ? data[idx] : undefined;
                if (pt?.date) {
                  router.push(
                    `/company/${companyId}/signals?tab=feed&dateFrom=${pt.date}&dateTo=${pt.date}`,
                  );
                }
              }}
            >
              <defs>
                <linearGradient id="dash-ev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="dash-sig-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(31,33,37,0.07)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#9AA0AA", fontFamily: "var(--font-geist-mono)" }}
                axisLine={false}
                tickLine={false}
                minTickGap={22}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#9AA0AA", fontFamily: "var(--font-geist-mono)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={<WhiteGlassTooltip />}
                cursor={{ stroke: "#4F46E5", strokeDasharray: "4 4", strokeOpacity: 0.45 }}
              />
              <Area
                type="monotone"
                dataKey="evidence"
                stroke="#4F46E5"
                strokeWidth={2.2}
                fill="url(#dash-ev-fill)"
                dot={{ r: 3, fill: "#4F46E5", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#4F46E5", stroke: "#FFFFFF", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={400}
              />
              <Area
                type="monotone"
                dataKey="signals"
                stroke="#059669"
                strokeWidth={2.2}
                strokeDasharray="5 3"
                fill="url(#dash-sig-fill)"
                dot={{ r: 2.5, fill: "#059669", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#059669", stroke: "#FFFFFF", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={450}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="font-mono text-[10.5px] text-[#9AA0AA]">
        Click any point to open Signals filtered to that day.
      </p>

      <table className="sr-only">
        <caption>Daily evidence collected and signals created</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Evidence</th>
            <th>Signals</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{p.evidence}</td>
              <td>{p.signals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
