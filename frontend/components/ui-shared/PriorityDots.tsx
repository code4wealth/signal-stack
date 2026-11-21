"use client";

const LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "Critical",
  4: "High",
  3: "Medium",
  2: "Low",
  1: "Minor",
};

const ACTIVE_DOT: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "bg-[#DC2626]",
  4: "bg-[#EA580C]",
  3: "bg-[#4F46E5]",
  2: "bg-[#2563EB]",
  1: "bg-[#64748B]",
};

export function PriorityDots({
  priority,
  showWord = true,
  compact = false,
}: {
  priority: 1 | 2 | 3 | 4 | 5;
  showWord?: boolean;
  compact?: boolean;
}) {
  const safeLevel = (Math.max(1, Math.min(5, Math.round(priority))) as 1 | 2 | 3 | 4 | 5);
  const word = LABELS[safeLevel];
  const dotColor = ACTIVE_DOT[safeLevel];

  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Priority ${safeLevel} of 5: ${word}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {([1, 2, 3, 4, 5] as const).map((step) => (
          <span
            key={step}
            className={`rounded-full ${compact ? "h-1.5 w-1.5" : "h-2 w-2"} ${
              step <= safeLevel ? dotColor : "bg-[#1F2125]/12"
            }`}
          />
        ))}
      </span>
      <span className="tabular font-mono text-[11px] font-medium text-[#4B5058]">
        {safeLevel}
        {showWord ? ` · ${word}` : ""}
      </span>
    </span>
  );
}
