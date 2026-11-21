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
          <CartesianGrid stroke="rgba(31, 33, 37, 0.08)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="component" tick={{ fill: "#4B5058", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#4B5058", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 1]} />
          <Tooltip
            contentStyle={{
              background: "rgba(255, 255, 255, 0.96)",
              border: "1px solid rgba(31, 33, 37, 0.12)",
              borderRadius: 12,
              color: "#1F2125",
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [value, name === "contribution" ? "points contributed" : "component"]}
          />
          <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
