"use client";

import { motion } from "framer-motion";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { growBar } from "@/lib/motion";

export function MiniBarSparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const { reduced } = useMotionSafe();
  const safeValues = values.length === 7 ? values : [...values, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);
  const max = Math.max(1, ...safeValues);

  return (
    <div
      className="flex h-10 items-end gap-1"
      aria-hidden="true"
    >
      {safeValues.map((val, idx) => {
        const isLast = idx === safeValues.length - 1;
        const heightPct = val === 0 ? 12 : Math.max(20, Math.round((val / max) * 100));

        return (
          <motion.span
            key={idx}
            variants={growBar(idx, reduced)}
            initial="hidden"
            animate={
              isLast && !reduced
                ? { scaleY: [0, 1, 1.12, 1], opacity: 1 }
                : "visible"
            }
            transition={
              isLast && !reduced
                ? { duration: 0.6, delay: 0.14, ease: [0.22, 1, 0.36, 1] }
                : undefined
            }
            style={{
              height: `${heightPct}%`,
              backgroundColor: color,
              opacity: isLast ? 1 : 0.4,
              transformOrigin: "bottom",
            }}
            className="w-1.5 rounded-full"
          />
        );
      })}
    </div>
  );
}
