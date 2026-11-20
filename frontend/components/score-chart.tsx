"use client";

// Recharts bar chart of the six ranking components for one signal.
// Values are the stored components from ranking.py - no client-side recomputation.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const WEIGHTS: Record<string, number> = {
  relevance: 0.25,
  impact: 0.25,
  urgency: 0.15,
  credibility: 0.15,
  recency: 0.1,
  novelty: 0.1,
};

export function ScoreChart({ components }: { components: Record<string, number | undefined> }) {
  const data = Object.entries(WEIGHTS).map(([key, weight]) => ({
    component: key,
    value: components[key] ?? 0,
    contribution: Number(((components[key] ?? 0) * weight * 100).toFixed(1)),
  }));

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#1e3a52" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="component" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 1]} />
          <Tooltip
            contentStyle={{ background: "#0B1B2A", border: "1px solid #1e3a52", borderRadius: 8, color: "#e2e8f0" }}
            formatter={(value: number, name: string) => [value, name === "contribution" ? "points contributed" : "component"]}
          />
          <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
