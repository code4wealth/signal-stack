"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cardHoverMotion } from "@/lib/motion";

export function GlassCard({
  children,
  className = "",
  interactive = false,
  strong = true,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  strong?: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const baseClass = `${strong ? "glass-strong" : "glass"} rounded-2xl p-5 ${
    interactive ? "transition-shadow duration-150 hover:shadow-[0_18px_44px_rgba(31,33,37,0.08)]" : ""
  } ${className}`;

  if (interactive) {
    return (
      <motion.section whileHover={cardHoverMotion(reduced)} className={baseClass}>
        {children}
      </motion.section>
    );
  }

  return <section className={baseClass}>{children}</section>;
}
