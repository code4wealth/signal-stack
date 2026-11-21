"use client";

import { useEffect, useRef, useState } from "react";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { countUpConfig } from "@/lib/motion";

export function CountUp({
  value,
  suffix = "",
  className = "",
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const { reduced } = useMotionSafe();
  const safeTarget = Number.isFinite(value) ? value : 0;
  const prevRef = useRef<number>(safeTarget);
  const [display, setDisplay] = useState<number>(reduced ? safeTarget : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(safeTarget);
      prevRef.current = safeTarget;
      return;
    }

    const from = prevRef.current === safeTarget ? 0 : prevRef.current;
    const start = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / countUpConfig.durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (safeTarget - from) * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        prevRef.current = safeTarget;
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [reduced, safeTarget]);

  return (
    <span className={`tabular ${className}`}>
      {display}
      {suffix}
    </span>
  );
}
