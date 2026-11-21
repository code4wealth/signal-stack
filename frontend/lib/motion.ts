import type { Transition, Variants } from "framer-motion";

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  countUp: 0.6,
} as const;

export const BASE_TRANSITION: Transition = {
  duration: DURATIONS.base,
  ease: MOTION_EASE,
};

export const FAST_TRANSITION: Transition = {
  duration: DURATIONS.fast,
  ease: MOTION_EASE,
};

export const SLOW_TRANSITION: Transition = {
  duration: DURATIONS.slow,
  ease: MOTION_EASE,
};

export const springSoft: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
};

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 32,
};

export function waveStagger(
  row: number,
  col: number,
  originRow = 3.5,
  originCol = 3,
): number {
  const dist = Math.hypot(row - originRow, col - originCol);
  return Math.min(0.4, dist * 0.018);
}

export const drawPath = (reduced = false): Variants => ({
  hidden: { pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0.4 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: reduced
      ? { duration: 0.15 }
      : {
          pathLength: { duration: DURATIONS.slow, ease: MOTION_EASE },
          opacity: { duration: 0.15 },
        },
  },
});

export const growBar = (index = 0, reduced = false): Variants => ({
  hidden: { scaleY: reduced ? 1 : 0, opacity: reduced ? 1 : 0.3 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: reduced
      ? { duration: 0.15 }
      : {
          duration: DURATIONS.slow,
          delay: Math.min(0.24, index * 0.02),
          ease: MOTION_EASE,
        },
  },
});

export const countUpConfig = {
  durationMs: 600,
} as const;

export const spotlightConfig = {
  radiusPx: 240,
  innerAlpha: 0.55,
} as const;

export const fadeUp = (reduced = false): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: BASE_TRANSITION,
  },
});

export const staggerContainer = (reduced = false, staggerMs = 60): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: reduced ? 0 : staggerMs / 1000,
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
  exit: {
    opacity: 0,
    y: reduced ? 0 : -4,
    transition: FAST_TRANSITION,
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

export const founderPillEnter = (reduced = false): Variants => ({
  hidden: { opacity: 0, x: reduced ? 0 : 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: BASE_TRANSITION,
  },
});

export const floatingReplyMotion = (reduced = false): Variants => ({
  hidden: { opacity: 0, scale: reduced ? 1 : 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: FAST_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: reduced ? 1 : 0.96,
    transition: { duration: 0.12 },
  },
});

export const sidePanelSlide = (reduced = false): Variants => ({
  hidden: { opacity: 0, x: reduced ? 0 : 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: reduced ? FAST_TRANSITION : springSoft,
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : 16,
    transition: FAST_TRANSITION,
  },
});

export const commandDialogMotion = (reduced = false): Variants => ({
  hidden: { opacity: 0, scale: reduced ? 1 : 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: FAST_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: reduced ? 1 : 0.97,
    transition: { duration: 0.12 },
  },
});

export const weekSlideVariants = (direction: number, reduced = false): Variants => ({
  hidden: { opacity: 0, x: reduced ? 0 : direction * 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: reduced ? FAST_TRANSITION : springSoft,
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : direction * -24,
    transition: FAST_TRANSITION,
  },
});

export const timelineMarkerGrow = (delaySec = 0, reduced = false): Variants => ({
  hidden: { scaleX: reduced ? 1 : 0, opacity: reduced ? 1 : 0.4 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: reduced
      ? { duration: 0.15 }
      : {
          duration: DURATIONS.base,
          delay: delaySec,
          ease: MOTION_EASE,
        },
  },
});

/** Editorial section entrance for Monday Morning Brief whileInView sections */
export const readingReveal = (reduced = false): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: reduced ? FAST_TRANSITION : BASE_TRANSITION,
  },
});

export const accentLineReveal = (reduced = false): Variants => ({
  hidden: { scaleX: reduced ? 1 : 0, opacity: reduced ? 1 : 0.6 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: reduced ? FAST_TRANSITION : BASE_TRANSITION,
  },
});


