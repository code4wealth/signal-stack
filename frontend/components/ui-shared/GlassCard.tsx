"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { useMotionSafe } from "@/hooks/useMotionSafe";
import { useSpotlight } from "@/hooks/useSpotlight";
import { cardHoverMotion } from "@/lib/motion";

export function GlassCard({
  children,
  className = "",
  interactive = false,
  strong = true,
  spotlight = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  strong?: boolean;
  spotlight?: boolean;
}) {
  const { reduced } = useMotionSafe();
  const spot = useSpotlight(spotlight);

  const baseClass = `${spot.active ? "relative overflow-hidden " : ""}${
    strong ? "glass-strong" : "glass"
  } rounded-2xl p-5 ${
    interactive ? "transition-shadow duration-150 hover:shadow-[0_18px_44px_rgba(31,33,37,0.08)]" : ""
  } ${className}`;

  const spotlightLayer = spot.active ? (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-2xl transition-opacity duration-150"
        style={{
          opacity: "var(--spot-o, 0)",
          background:
            "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.55), transparent 72%)",
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 rounded-2xl transition-opacity duration-150"
        style={{
          opacity: "var(--spot-o, 0)",
          padding: "1px",
          background:
            "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(79,70,229,0.28), transparent 70%)",
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
    </>
  ) : null;

  if (interactive) {
    return (
      <motion.section
        ref={(node) => {
          spot.ref.current = node;
        }}
        whileHover={cardHoverMotion(reduced)}
        className={baseClass}
        {...spot.handlers}
      >
        {spotlightLayer}
        {children}
      </motion.section>
    );
  }

  return (
    <section
      ref={(node) => {
        spot.ref.current = node;
      }}
      className={baseClass}
      {...spot.handlers}
    >
      {spotlightLayer}
      {children}
    </section>
  );
}
