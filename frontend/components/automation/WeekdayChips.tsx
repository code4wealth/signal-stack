"use client";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function WeekdayChips({
  activeDays,
  interactive = false,
  onToggle,
}: {
  activeDays?: number[] | null;
  interactive?: boolean;
  onToggle?: (dayIndex: number) => void;
}) {
  const activeSet = new Set(activeDays ?? []);

  return (
    <div className="flex items-center gap-1" role={interactive ? "group" : undefined} aria-label="Days of week">
      {DAY_LETTERS.map((letter, idx) => {
        const active = activeSet.has(idx);
        const cls = `inline-flex h-6 w-6 items-center justify-center rounded-lg font-mono text-[10.5px] font-semibold transition-colors ${
          active
            ? "bg-[#1C1D21] text-white"
            : "border border-[#1F2125]/10 bg-white/60 text-[#9AA0AA]"
        }`;

        if (interactive && onToggle) {
          return (
            <button
              key={idx}
              type="button"
              aria-pressed={active}
              aria-label={DAY_FULL[idx]}
              onClick={() => onToggle(idx)}
              className={`focus-ring ${cls} hover:border-[#4F46E5]/40`}
            >
              {letter}
            </button>
          );
        }

        return (
          <span
            key={idx}
            title={DAY_FULL[idx]}
            aria-label={`${DAY_FULL[idx]}: ${active ? "scheduled" : "off"}`}
            className={cls}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}
