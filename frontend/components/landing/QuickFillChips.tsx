"use client";

import { motion, useReducedMotion } from "framer-motion";

const SAMPLES = [
  { label: "Try with MeetUniversity", name: "MeetUniversity", website: "meetuniversity.com" },
  { label: "Razorpay", name: "Razorpay", website: "razorpay.com" },
  { label: "Zomato", name: "Zomato", website: "zomato.com" },
] as const;

export function QuickFillChips({
  onSelect,
}: {
  onSelect: (sample: { name: string; website: string }) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-4 flex w-full max-w-4xl flex-col items-center gap-3"
    >
      <p className="text-center text-xs text-[#4B5058]">
        We only use publicly available information. Your data stays private.
      </p>

      <div className="flex w-full items-center justify-start gap-2 overflow-x-auto pb-1 sm:justify-center">
        <span className="shrink-0 text-xs text-[#9AA0AA]">Quick examples:</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.name}
            type="button"
            onClick={() => onSelect({ name: sample.name, website: sample.website })}
            className="btn-motion focus-ring shrink-0 rounded-full border border-white/80 bg-white/60 px-3.5 py-1.5 text-xs font-medium text-[#1F2125] shadow-[0_4px_14px_rgba(31,33,37,0.04)] backdrop-blur-md hover:bg-white/90"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
