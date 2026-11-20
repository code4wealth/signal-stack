import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0d14",
        secondary: "#0f141f",
        surface: "#131824",
        card: "#151b28",
        ink: "#e9edf3",
        muted: "#8b95a7",
        primary: "#5ab9fc",
        accent: "#5ab9fc",
        success: "#2dd4bf",
        danger: "#f87171",
        warning: "#f59e0b",
      },
      fontFamily: {
        sans: [
          "Inter",
          "Manrope",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Geist Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
