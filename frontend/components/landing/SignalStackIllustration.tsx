"use client";

import { motion, useReducedMotion } from "framer-motion";

const SIGNAL_CARDS = [
  {
    label: "Customers",
    detail: "Reviews & buyer signals",
    dot: "#0D9488",
    badgeBg: "rgba(13, 148, 136, 0.12)",
    position: "sm:left-2 sm:top-4",
    delay: "0s",
  },
  {
    label: "Competitors",
    detail: "Pricing & positioning shifts",
    dot: "#EA580C",
    badgeBg: "rgba(234, 88, 12, 0.12)",
    position: "sm:right-0 sm:top-0",
    delay: "1.4s",
  },
  {
    label: "Market",
    detail: "Regulation & industry news",
    dot: "#2563EB",
    badgeBg: "rgba(37, 99, 235, 0.12)",
    position: "sm:left-0 sm:top-[106px]",
    delay: "2.4s",
  },
  {
    label: "Internal",
    detail: "Founder & document context",
    dot: "#7C3AED",
    badgeBg: "rgba(124, 58, 237, 0.12)",
    position: "sm:right-2 sm:top-[102px]",
    delay: "3.2s",
  },
] as const;

export function SignalStackIllustration() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id="signals"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-20 mx-auto -mb-10 mt-6 flex w-full max-w-[700px] flex-col items-center sm:-mb-12 sm:mt-8"
    >
      <div className="relative flex w-full flex-col items-center sm:h-[236px]">
        {/* Center friendly 3D-shaded SVG robot, tucked behind the glass input panel */}
        <div
          style={reduceMotion ? undefined : { animationDelay: "0.4s" }}
          className="animate-float-slow relative z-10 origin-bottom scale-[0.82] sm:mt-2 sm:scale-100"
          aria-hidden="true"
        >
          <svg
            width="176"
            height="216"
            viewBox="0 0 176 216"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_18px_28px_rgba(31,33,37,0.12)]"
          >
            <defs>
              <radialGradient id="robotHeadGrad" cx="38%" cy="30%" r="72%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="62%" stopColor="#EEF2FA" />
                <stop offset="100%" stopColor="#CFD8EA" />
              </radialGradient>
              <radialGradient id="robotBodyGrad" cx="36%" cy="25%" r="75%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="65%" stopColor="#E9EEF8" />
                <stop offset="100%" stopColor="#C4CFE4" />
              </radialGradient>
              <linearGradient id="visorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2B303A" />
                <stop offset="100%" stopColor="#161920" />
              </linearGradient>
              <linearGradient id="visorShine" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
                <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.02" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F8FAFF" />
                <stop offset="100%" stopColor="#BCC7DC" />
              </linearGradient>
            </defs>

            {/* Left & Right ear pods */}
            <rect x="24" y="47" width="14" height="32" rx="7" fill="url(#earGrad)" />
            <rect x="138" y="47" width="14" height="32" rx="7" fill="url(#earGrad)" />
            <rect x="26" y="54" width="4" height="18" rx="2" fill="#9AA6BD" opacity="0.55" />
            <rect x="146" y="54" width="4" height="18" rx="2" fill="#9AA6BD" opacity="0.55" />

            {/* Rounded Helmet Head */}
            <rect x="33" y="18" width="110" height="86" rx="43" fill="url(#robotHeadGrad)" />
            {/* Soft top specular highlight */}
            <ellipse cx="74" cy="30" rx="26" ry="7" fill="#FFFFFF" opacity="0.7" />

            {/* Dark Glossy Visor */}
            <rect x="46" y="37" width="84" height="52" rx="26" fill="url(#visorGrad)" />
            <rect x="48" y="39" width="80" height="24" rx="18" fill="url(#visorShine)" />

            {/* Happy arched eyes */}
            <path
              d="M66 64C68.5 58.5 75.5 58.5 78 64"
              stroke="#E9EFFA"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              d="M98 64C100.5 58.5 107.5 58.5 110 64"
              stroke="#E9EFFA"
              strokeWidth="4.2"
              strokeLinecap="round"
            />

            {/* Subtle neck shadow */}
            <ellipse cx="88" cy="108" rx="20" ry="5" fill="#9AA6BD" opacity="0.45" />

            {/* Left & Right floating arms */}
            <rect
              x="22"
              y="122"
              width="20"
              height="48"
              rx="10"
              transform="rotate(14 22 122)"
              fill="url(#robotBodyGrad)"
            />
            <rect
              x="134"
              y="127"
              width="20"
              height="48"
              rx="10"
              transform="rotate(-14 134 127)"
              fill="url(#robotBodyGrad)"
            />

            {/* Torso */}
            <path
              d="M48 128C48 115.85 57.85 106 70 106H106C118.15 106 128 115.85 128 128V166C128 190.3 108.3 206 88 206C67.7 206 48 190.3 48 166V128Z"
              fill="url(#robotBodyGrad)"
            />

            {/* Dark rounded AI chest badge */}
            <rect x="69" y="132" width="38" height="28" rx="9" fill="#2A2F39" />
            <rect x="70.5" y="133.5" width="35" height="25" rx="7.5" stroke="#FFFFFF" strokeOpacity="0.16" />
            <text
              x="88"
              y="151"
              textAnchor="middle"
              fill="#F4F6FB"
              fontSize="13.5"
              fontWeight="700"
              fontFamily="var(--font-geist-sans), Inter, sans-serif"
              letterSpacing="0.04em"
            >
              AI
            </text>
          </svg>
        </div>

        {/* Four floating Signal Stack category cards orbiting the robot */}
        <div className="mt-2 grid w-full max-w-[440px] grid-cols-2 gap-2.5 sm:pointer-events-none sm:mt-0 sm:block sm:max-w-none">
          {SIGNAL_CARDS.map((card) => (
            <div
              key={card.label}
              style={reduceMotion ? undefined : { animationDelay: card.delay }}
              className={`animate-float-slow glass-strong sm:pointer-events-auto sm:absolute ${card.position} z-20 flex flex-col gap-0.5 rounded-2xl px-3.5 py-2.5 sm:w-[216px]`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: card.badgeBg }}
                  aria-hidden="true"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: card.dot }} />
                </span>
                <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#1F2125]">
                  {card.label}
                </span>
              </div>
              <p className="pl-7 text-[11.5px] leading-snug text-[#4B5058]">{card.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
