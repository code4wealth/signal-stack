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

  if (belowFold) {
    return (
      <motion.div
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        transition={{ delay: reduced ? 0 : delay }}
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
      transition={{ delay: reduced ? 0 : delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
