"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { pageTransition } from "@/lib/motion";

export function PageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = Boolean(useReducedMotion());
  return (
    <motion.div
      variants={pageTransition(reduced)}
      initial="hidden"
      animate="visible"
      className={`w-full ${className}`}
    >
      {children}
    </motion.div>
  );
}
