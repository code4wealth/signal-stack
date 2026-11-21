"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

export function useMotionSafe() {
  const reduced = Boolean(useReducedMotion());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return {
    reduced,
    isDocumentHidden: hidden,
    canAnimate: !reduced && !hidden,
  };
}
