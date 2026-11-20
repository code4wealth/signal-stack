import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#06111D",
        secondary: "#0B1B2A",
        card: "#102638",
        primary: "#3B82F6",
        accent: "#38BDF8",
        success: "#2DD4BF",
        danger: "#F87171",
        warning: "#FBBF24",
      },
      fontFamily: { sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
