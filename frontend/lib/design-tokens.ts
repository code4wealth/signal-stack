export const DESIGN_TOKENS = {
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
    categories: {
      customers: "#0D9488",
      competitors: "#EA580C",
      market: "#2563EB",
      internal: "#7C3AED",
    },
    semantic: {
      opportunity: "#16A34A",
      threat: "#DC2626",
      neutral: "#64748B",
      verified: "#059669",
      lowConfidenceBorder: "#94A3B8",
    },
  },
  radii: {
    card: "16px",
    button: "12px",
    chip: "9999px",
    panel: "28px",
  },
  spacing: {
    unit: 8,
    sidebarWidth: 260,
    detailsPanelWidth: 320,
    topBarHeight: 56,
  },
  fonts: {
    sans: "var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
  },
} as const;
