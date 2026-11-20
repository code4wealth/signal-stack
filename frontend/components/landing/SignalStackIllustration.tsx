"use client";

import { motion, useReducedMotion } from "framer-motion";

const LAYERS = [
  {
    label: "Customers",
    detail: "Reviews & buyer signals",
    dot: "#0D9488",
    badgeBg: "rgba(13, 148, 136, 0.10)",
    offset: "translate-x-[-18px] sm:translate-x-[-28px] -rotate-2",
    delay: "0s",
    z: "z-10",
  },
  {
    label: "Competitors",
    detail: "Pricing & positioning shifts",
    dot: "#EA580C",
    badgeBg: "rgba(234, 88, 12, 0.10)",
    offset: "translate-x-[16px] sm:translate-x-[24px] rotate-1",
    delay: "1.1s",
    z: "z-20",
  },
  {
    label: "Market",
    detail: "Regulation & industry news",
    dot: "#2563EB",
    badgeBg: "rgba(37, 99, 235, 0.10)",
    offset: "translate-x-[-10px] sm:translate-x-[-14px] -rotate-1",
    delay: "2.2s",
    z: "z-30",
  },
  {
    label: "Internal",
    detail: "Founder & document context",
    dot: "#7C3AED",
    badgeBg: "rgba(124, 58, 237, 0.10)",
    offset: "translate-x-[8px] sm:translate-x-[12px] rotate-[0.75deg]",
    delay: "3.3s",
    z: "z-40",
  },
];

export function SignalStackIllustration() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id="signals"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto -mb-8 mt-6 flex w-full max-w-[540px] flex-col items-center sm:-mb-10 sm:mt-8"
    >
      {/* Decorative chat-bubble chips matching the floating accent style */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-2 top-6 z-40 hidden rounded-2xl border border-white/80 bg-white/75 px-3 py-1.5 text-[11.5px] font-medium text-[#1F2125] shadow-[0_10px_28px_rgba(31,33,37,0.07)] backdrop-blur-xl sm:flex sm:items-center sm:gap-2"
      >
        <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
        New UGC notice detected
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 top-20 z-40 hidden rounded-2xl border border-white/80 bg-white/75 px-3 py-1.5 text-[11.5px] font-medium text-[#1F2125] shadow-[0_10px_28px_rgba(31,33,37,0.07)] backdrop-blur-xl sm:flex sm:items-center sm:gap-2"
      >
        <span className="h-2 w-2 rounded-full bg-[#EA580C]" />
        Competitor changed pricing
      </div>

      {/* Layered 4-card stack (scales down to ~70% on mobile) */}
      <div className="relative flex origin-center scale-[0.72] flex-col items-center sm:scale-100">
        <div className="flex flex-col items-center -space-y-2.5">
          {LAYERS.map((layer) => (
            <div
              key={layer.label}
              style={reduceMotion ? undefined : { animationDelay: layer.delay }}
              className={`animate-float-slow glass-strong ${layer.offset} ${layer.z} flex w-[280px] items-center justify-between gap-3 rounded-2xl px-4 py-3`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg"
                  style={{ backgroundColor: layer.badgeBg }}
                  aria-hidden="true"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: layer.dot }} />
                </span>
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#1F2125]">
                  {layer.label}
                </span>
              </div>
              <span className="text-[11px] font-medium text-[#4B5058]">{layer.detail}</span>
            </div>
          ))}
        </div>

        {/* Soft blurred ground shadow under the stack */}
        <div
          aria-hidden="true"
          className="mt-2 h-6 w-[250px] rounded-full bg-[#8FA7D6]/35 blur-xl"
        />
      </div>
    </motion.div>
  );
}
