"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Hero({ onStartClick }: { onStartClick: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <section id="how-it-works" className="mx-auto mt-10 flex max-w-3xl flex-col items-center text-center sm:mt-14">
      <motion.h1
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px] lg:text-[60px]"
      >
        <span className="block font-medium text-neutral-700">Know what matters to your business,</span>
        <span className="block font-semibold text-neutral-950">before your competitors do</span>
      </motion.h1>

      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#4B5058] sm:text-[18px]"
      >
        Signal Stack researches your company, monitors customers, competitors and market changes, and delivers an
        evidence-backed Monday Morning Brief with clear actions.
      </motion.p>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="mt-7 flex flex-wrap items-center justify-center gap-3"
      >
        <Button onClick={onStartClick} className="h-11 rounded-xl px-5">
          Research my company <ArrowRight size={15} />
        </Button>
      </motion.div>
    </section>
  );
}
