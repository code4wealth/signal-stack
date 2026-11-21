"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useMotionSafe } from "@/hooks/useMotionSafe";

export function useSpotlight(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const { reduced } = useMotionSafe();
  const [isFinePointer, setIsFinePointer] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setIsFinePointer(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const active = enabled && !reduced && isFinePointer;

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!active || !ref.current) return;
      const el = ref.current;
      const clientX = e.clientX;
      const clientY = e.clientY;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${clientX - rect.left}px`);
        el.style.setProperty("--my", `${clientY - rect.top}px`);
        el.style.setProperty("--spot-o", "1");
      });
    },
    [active],
  );

  const onPointerLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty("--spot-o", "0");
  }, []);

  return {
    ref,
    active,
    handlers: active
      ? { onPointerMove, onPointerLeave }
      : {},
  };
}
