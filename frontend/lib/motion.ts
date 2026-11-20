import type { Transition, Variants } from "framer-motion";

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
} as const;

export const BASE_TRANSITION: Transition = {
  duration: DURATIONS.base,
  ease: MOTION_EASE,
};

export const FAST_TRANSITION: Transition = {
  duration: DURATIONS.fast,
  ease: MOTION_EASE,
};

export const fadeUp = (reduced = false): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: BASE_TRANSITION,
  },
});

export const staggerContainer = (reduced = false): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: reduced ? 0 : 0.06,
      delayChildren: reduced ? 0 : 0.03,
    },
  },
});

export const pageTransition = (reduced = false): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: BASE_TRANSITION,
  },
});

export const tabCrossfade = (): Variants => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: FAST_TRANSITION },
  exit: { opacity: 0, transition: { duration: 0.12 } },
});

export const cardHoverMotion = (reduced = false) =>
  reduced
    ? undefined
    : {
        y: -2,
        transition: FAST_TRANSITION,
      };
