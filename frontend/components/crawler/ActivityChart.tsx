"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, LineChart as LineChartIcon, Play } from "lucide-react";

import type { CrawlRange, CrawlerOverview } from "@/lib/types";
import { EmptyState, GlassCard, StatusPill } from "@/components/ui-shared";

type DailyPoint = CrawlerOverview["daily"][number] & { label: string };

function formatDayLabel(dateStr: string, range: CrawlRange): string {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  if (range === "7d") {
    return dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  }
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: DailyPoint }[];
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="glass-strong rounded-2xl border border-white/90 px-3.5 py-2.5 text-xs shadow-lg">
      <p className="font-mono text-[11px] font-semibold text-[#1F2125]">{row.date}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4B5058]">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-[#4F46E5]" />
            New
          </span>
          <span className="tabular font-mono font-semibold text-[#1F2125]">{row.new}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4B5058]">
            <span className="inline-block h-2 w-2 rotate-45 bg-[#EA580C]" />
            Changed
          </span>
          <span className="tabular font-mono font-semibold text-[#1F2125]">{row.changed}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4B5058]">
            <span className="inline-block h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-[#DC2626]" />
            Failed
          </span>
          <span className="tabular font-mono font-semibold text-[#1F2125]">{row.failed}</span>
        </div>
      </div>
      <p className="mt-2 border-t border-[#1F2125]/8 pt-1.5 font-mono text-[10px] text-[#9AA0AA]">
        {row.sourcesChecked} source{row.sourcesChecked === 1 ? "" : "s"} checked
      </p>
    </div>
  );
}

export function ActivityChart({
  overview,
  range,
  onRunNow,
  isRunning,
}: {
  overview: CrawlerOverview;
  range: CrawlRange;
  onRunNow: () => void;
  isRunning: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const [chartMode, setChartMode] = useState<"bar" | "line">("bar");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalCollected = overview.totals.new + overview.totals.changed;
  const [displayTotal, setDisplayTotal] = useState<number>(reduced ? totalCollected : 0);

  useEffect(() => {
    if (reduced) {
      setDisplayTotal(totalCollected);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 400);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayTotal(Math.round(totalCollected * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, totalCollected]);

  const hasAnyRuns =
    (overview.runsCount ?? 0) > 0 ||
    overview.daily.some((d) => d.new > 0 || d.changed > 0 || d.failed > 0 || d.sourcesChecked > 0);

  const chartData: DailyPoint[] = overview.daily.map((d) => ({
    ...d,
    label: formatDayLabel(d.date, range),
  }));

  return (
    <GlassCard className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="tabular text-[32px] font-semibold leading-none tracking-[-0.03em] text-[#1F2125]">
              {displayTotal}
            </span>
            {overview.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
          </div>
          <p className="mt-1 text-xs text-[#4B5058]">Items collected ({range})</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Shape + color legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#4B5058]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[#4F46E5]" aria-hidden="true" />
              New
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rotate-45 bg-[#EA580C]" aria-hidden="true" />
              Changed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-[#DC2626]"
                aria-hidden="true"
              />
              Failed pages
            </span>
          </div>

          {/* Bar / Line toggle */}
          <div
            role="group"
            aria-label="Chart mode"
            className="inline-flex rounded-xl border border-white/80 bg-white/75 p-0.5"
          >
            <button
              type="button"
              onClick={() => setChartMode("bar")}
              aria-pressed={chartMode === "bar"}
              title="Bar chart"
              className={`focus-ring rounded-lg p-1.5 ${
                chartMode === "bar" ? "bg-[#1C1D21] text-white" : "text-[#4B5058]"
              }`}
            >
              <BarChart3 size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setChartMode("line")}
              aria-pressed={chartMode === "line"}
              title="Line chart"
              className={`focus-ring rounded-lg p-1.5 ${
                chartMode === "line" ? "bg-[#1C1D21] text-white" : "text-[#4B5058]"
              }`}
            >
              <LineChartIcon size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {!hasAnyRuns ? (
        <EmptyState
          title="No crawls yet"
          description="No crawls yet. Run your first crawl to see activity."
          action={
            <button
              type="button"
              disabled={isRunning}
              onClick={onRunNow}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white disabled:opacity-60"
            >
              <Play size={13} /> Run crawl now
            </button>
          }
        />
      ) : (
        <div
          className="h-[230px] w-full"
          role="img"
          aria-label={`Daily crawl activity over the last ${range}: ${overview.totals.new} new items, ${overview.totals.changed} changed items, ${overview.totals.failed} failed fetches.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === "bar" ? (
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 6, left: -20, bottom: 0 }}
                onMouseMove={(state) => {
                  if (typeof state?.activeTooltipIndex === "number") {
                    setHoveredIdx(state.activeTooltipIndex);
                  }
                }}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9AA0AA", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                  interval={range === "90d" ? 13 : range === "30d" ? 4 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9AA0AA", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(79,70,229,0.05)" }} />
                <Bar
                  dataKey="new"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!reduced}
                  animationDuration={250}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={`n-${i}`}
                      fill={hoveredIdx === null || hoveredIdx === i ? "rgba(79,70,229,0.82)" : "rgba(79,70,229,0.32)"}
                      stroke="#4F46E5"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="changed"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!reduced}
                  animationDuration={250}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={`c-${i}`}
                      fill={hoveredIdx === null || hoveredIdx === i ? "rgba(234,88,12,0.82)" : "rgba(234,88,12,0.32)"}
                      stroke="#EA580C"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="failed"
                  stackId="a"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!reduced}
                  animationDuration={250}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={`f-${i}`}
                      fill={hoveredIdx === null || hoveredIdx === i ? "rgba(220,38,38,0.82)" : "rgba(220,38,38,0.32)"}
                      stroke="#DC2626"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9AA0AA", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                  interval={range === "90d" ? 13 : range === "30d" ? 4 : 0}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9AA0AA", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="new"
                  stroke="#4F46E5"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
                <Line
                  type="monotone"
                  dataKey="changed"
                  stroke="#EA580C"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduced}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Visually hidden accessible data table fallback */}
      <table className="sr-only">
        <caption>Daily crawl activity ({range})</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>New items</th>
            <th>Changed items</th>
            <th>Failed pages</th>
            <th>Sources checked</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.date}>
              <td>{row.date}</td>
              <td>{row.new}</td>
              <td>{row.changed}</td>
              <td>{row.failed}</td>
              <td>{row.sourcesChecked}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
