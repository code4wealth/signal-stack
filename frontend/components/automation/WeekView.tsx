"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { SkeletonBlock } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { FAST_TRANSITION, weekSlideVariants } from "@/lib/motion";
import type { CalendarDay } from "@/lib/types";
import { DayCard } from "./DayCard";

export function WeekView({
  weekOffset,
  direction,
  label,
  rangeLabel,
  days,
  isLoading,
  nextWeekHasOverrides,
  timezone,
  showLocalTime,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddOverride,
  onEditFutureWeek,
  onSelectDay,
}: {
  weekOffset: number;
  direction: number;
  label: string;
  rangeLabel: string;
  days: CalendarDay[];
  isLoading: boolean;
  nextWeekHasOverrides: boolean;
  timezone: string;
  showLocalTime: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddOverride: () => void;
  onEditFutureWeek: () => void;
  onSelectDay: (dateIso: string) => void;
}) {
  const { reduced } = useMotionSafe();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);

  const handleKeyNav = (idx: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const cells = gridRef.current?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]');
    if (!cells || cells.length === 0) return;
    const nextIdx =
      e.key === "ArrowRight"
        ? Math.min(cells.length - 1, idx + 1)
        : Math.max(0, idx - 1);
    cells[nextIdx]?.focus();
  };

  return (
    <section aria-label="Weekly schedule calendar" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/80 bg-white/75 p-1 shadow-sm">
            <button
              type="button"
              onClick={onPrevWeek}
              aria-label="Previous week"
              className="focus-ring flex h-7 w-7 items-center justify-center rounded-lg text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={onNextWeek}
              aria-label="Next week"
              className="focus-ring relative flex h-7 w-7 items-center justify-center rounded-lg text-[#4B5058] hover:bg-white hover:text-[#1F2125]"
            >
              <ChevronRight size={15} />
              {nextWeekHasOverrides ? (
                <span
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#4F46E5]"
                  title="Next week has overrides"
                />
              ) : null}
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${weekOffset}-${rangeLabel}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FAST_TRANSITION}
              className="flex flex-wrap items-baseline gap-2"
            >
              <h2 className="text-base font-semibold text-[#1F2125]">{label}</h2>
              <span className="font-mono text-xs text-[#4B5058]">{rangeLabel}</span>
            </motion.div>
          </AnimatePresence>

          {weekOffset !== 0 ? (
            <button
              type="button"
              onClick={onToday}
              className="focus-ring rounded-lg px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-white/75"
            >
              Today
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddOverride}
            className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white"
          >
            <Plus size={13} aria-hidden="true" />
            Add override
          </button>
          <button
            type="button"
            onClick={onEditFutureWeek}
            className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white"
          >
            <Calendar size={13} aria-hidden="true" />
            Edit future week
          </button>
        </div>
      </div>

      {isLoading && days.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={weekOffset}
            ref={gridRef}
            role="grid"
            aria-label={rangeLabel}
            variants={weekSlideVariants(direction, reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-3 md:flex-row md:snap-x md:overflow-x-auto md:pb-1 xl:grid xl:grid-cols-7 xl:overflow-visible xl:pb-0"
          >
            {days.map((day, idx) => (
              <DayCard
                key={day.date}
                day={day}
                isToday={day.date === todayIso}
                timezone={timezone}
                showLocalTime={showLocalTime}
                onSelect={() => onSelectDay(day.date)}
                onKeyNav={(e) => handleKeyNav(idx, e)}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  );
}
