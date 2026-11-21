"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { fadeUp } from "@/lib/motion";

export function Reveal({
  children,
  delay = 0,
  belowFold = false,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  belowFold?: boolean;
  className?: string;
}) {
  const { reduced } = useMotionSafe();
  const variants = fadeUp(reduced);

  const effectiveDelay = reduced ? 0 : Math.min(delay, 0.15);

  if (belowFold) {
    return (
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "80px 0px" }}
        transition={{ delay: effectiveDelay }}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      transition={{ delay: effectiveDelay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
