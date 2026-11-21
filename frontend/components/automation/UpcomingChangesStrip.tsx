"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import {
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Clock,
  PauseCircle,
  ShieldCheck,
  SkipForward,
} from "lucide-react";

import { GlassCard } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { BASE_TRANSITION } from "@/lib/motion";
import type { UpcomingChange } from "@/lib/types";

function chipStyle(kind: UpcomingChange["kind"]) {
  switch (kind) {
    case "pause":
      return {
        border: "border-[#EA580C]/35 bg-[#EA580C]/8",
        dateBg: "bg-[#EA580C]/12 text-[#C2410C]",
        Icon: PauseCircle,
        iconColor: "text-[#EA580C]",
      };
    case "skip":
      return {
        border: "border-[#EA580C]/35 bg-[#EA580C]/8",
        dateBg: "bg-[#EA580C]/12 text-[#C2410C]",
        Icon: SkipForward,
        iconColor: "text-[#EA580C]",
      };
    case "blackout":
      return {
        border: "border-[#EA580C]/35 bg-[#EA580C]/8",
        dateBg: "bg-[#EA580C]/12 text-[#C2410C]",
        Icon: CalendarOff,
        iconColor: "text-[#EA580C]",
      };
    case "reschedule":
      return {
        border: "border-[#4F46E5]/30 bg-[#EEF2FF]/70",
        dateBg: "bg-[#4F46E5]/12 text-[#4338CA]",
        Icon: Clock,
        iconColor: "text-[#4F46E5]",
      };
    default:
      return {
        border: "border-slate-300/80 bg-white/75",
        dateBg: "bg-slate-100 text-slate-700",
        Icon: ShieldCheck,
        iconColor: "text-slate-600",
      };
  }
}

export function UpcomingChangesStrip({
  changes,
  isMock,
  onSelectDate,
}: {
  changes: UpcomingChange[];
  isMock?: boolean;
  onSelectDate: (isoDate: string) => void;
}) {
  const { reduced } = useMotionSafe();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <GlassCard className="relative overflow-hidden p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="shrink-0 space-y-0.5 md:pr-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#1F2125]">Upcoming changes</h2>
            {isMock ? (
              <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#C2410C]">
                MOCK DATA
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[11px] text-[#9AA0AA]">Next 30 days</p>
        </div>

        <div className="relative flex min-w-0 flex-1 items-center gap-1.5">
          {changes.length > 2 ? (
            <button
              type="button"
              onClick={() => scrollBy(-220)}
              aria-label="Scroll upcoming changes left"
              className="focus-ring hidden h-8 w-7 shrink-0 items-center justify-center rounded-lg border border-white/80 bg-white/80 text-[#4B5058] hover:bg-white sm:inline-flex"
            >
              <ChevronLeft size={14} />
            </button>
          ) : null}

          <div
            ref={scrollRef}
            className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {changes.length === 0 ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white/60 px-3.5 py-2 text-xs text-[#9AA0AA]">
                No upcoming changes
              </span>
            ) : (
              changes.map((c, idx) => {
                const dt = new Date(c.date);
                const dayNum = Number.isNaN(dt.getTime()) ? "--" : String(dt.getUTCDate());
                const monthShort = Number.isNaN(dt.getTime())
                  ? ""
                  : dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
                const style = chipStyle(c.kind);
                const Icon = style.Icon;
                const delay = reduced ? 0 : Math.min(10, idx) * 0.04;

                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...BASE_TRANSITION, delay }}
                    onClick={() => onSelectDate(c.date.slice(0, 10))}
                    className={`focus-ring btn-motion flex shrink-0 items-stretch overflow-hidden rounded-xl border text-left shadow-sm ${style.border}`}
                  >
                    <div
                      className={`flex w-11 flex-col items-center justify-center px-2 py-1.5 font-mono ${style.dateBg}`}
                    >
                      <span className="tabular text-sm font-semibold leading-none">{dayNum}</span>
                      <span className="mt-0.5 text-[9.5px] font-medium tracking-wider">
                        {monthShort}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/75 px-3 py-1.5">
                      <Icon size={13} className={`shrink-0 ${style.iconColor}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-xs font-medium text-[#1F2125]">
                          {c.label}
                        </p>
                        <p className="whitespace-nowrap font-mono text-[10.5px] text-[#4B5058]">
                          {c.subLabel}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>

          {changes.length > 2 ? (
            <button
              type="button"
              onClick={() => scrollBy(220)}
              aria-label="Scroll upcoming changes right"
              className="focus-ring hidden h-8 w-7 shrink-0 items-center justify-center rounded-lg border border-white/80 bg-white/80 text-[#4B5058] hover:bg-white sm:inline-flex"
            >
              <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
