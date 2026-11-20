"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

import { GlassCard } from "@/components/ui-shared/GlassCard";

export function StatCard({
  icon,
  iconBg,
  label,
  value,
  footer,
  onClick,
  activeRingClass,
}: {
  icon: ReactNode;
  iconBg: string;
  label: string;
  value: number | string;
  footer: string;
  onClick?: () => void;
  activeRingClass?: string;
}) {
  const reduced = Boolean(useReducedMotion());
  const isNumeric = typeof value === "number" && Number.isFinite(value);
  const [displayNum, setDisplayNum] = useState<number>(isNumeric ? (reduced ? value : 0) : 0);

  useEffect(() => {
    if (!isNumeric) return;
    if (reduced) {
      setDisplayNum(value);
      return;
    }
    let frameId = 0;
    const duration = 400;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNum(Math.round(value * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isNumeric, value, reduced]);

  const cardInner = (
    <GlassCard
      interactive
      className={`flex h-full flex-col justify-between gap-3 p-4 sm:p-5 ${activeRingClass ?? ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="text-xs font-medium text-[#4B5058]">{label}</p>
      </div>
      <div>
        <p className="tabular text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
          {isNumeric ? displayNum : value}
        </p>
        <p className="mt-1 text-xs text-[#9AA0AA]">{footer}</p>
      </div>
    </GlassCard>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="focus-ring w-full rounded-2xl text-left"
      >
        {cardInner}
      </button>
    );
  }

  return cardInner;
}
