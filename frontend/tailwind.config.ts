import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F4F6FB",
        secondary: "#EDF1FA",
        surface: "#FFFFFF",
        card: "#FFFFFF",
        ink: "#1F2125",
        muted: "#4B5058",
        subtle: "#9AA0AA",
        primary: "#1C1D21",
        accent: "#4F46E5",
        brandBlue: "#2563EB",
        success: "#059669",
        opportunity: "#16A34A",
        danger: "#DC2626",
        warning: "#EA580C",
        catCustomers: "#0D9488",
        catCompetitors: "#EA580C",
        catMarket: "#2563EB",
        catInternal: "#7C3AED",
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "Inter Tight",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
        serif: [
          "var(--font-serif)",
          "Source Serif 4",
          "Georgia",
          "Cambria",
          "serif",
        ],
      },
      borderRadius: {
        card: "16px",
        button: "12px",
        panel: "28px",
      },
    },
  },
  plugins: [],
};

export default config;
