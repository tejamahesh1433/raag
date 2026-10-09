export const COLORS = {
  bg: "#08080c",
  bgGradient: ["#140d1a", "#08080c", "#020204"] as const,
  surface: "#1c1c22",
  surfaceSecondary: "#2a2a34",
  glassBg: "rgba(24, 24, 30, 0.72)",
  glassSurface: "rgba(38, 38, 48, 0.58)",
  glassHighlight: "rgba(255, 255, 255, 0.35)",
  glassBorder: "rgba(255, 255, 255, 0.15)",
  glassBorderSubtle: "rgba(255, 255, 255, 0.08)",
  glossOverlay: ["rgba(255, 255, 255, 0.30)", "rgba(255, 255, 255, 0.05)", "transparent"] as const,
  separator: "rgba(255, 255, 255, 0.10)",
  accent: "#ff2d55",
  accentLight: "#ff4d73",
  accentGradient: ["#ff3b68", "#e00045"] as const,
  accentGlow: "rgba(255, 45, 85, 0.4)",
  onAccent: "#ffffff",
  label: "#ffffff",
  secondaryLabel: "#ebebf5cc",
  tertiaryLabel: "#ebebf560",
  muted: "#8e8e93",
  fill: "#787880",
};

export const FONT = {
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  callout: 16,
  subheadline: 15,
  footnote: 13,
  caption: 12,
};

export const SPACING = { xs: 4, sm: 8, md: 16, lg: 20, xl: 32 };
export const RADIUS = { xs: 4, sm: 8, md: 14, lg: 18, xl: 24, full: 9999 };

export const SHADOW = {
  gloss: {
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  floating: {
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  glow: (color = "#ff2d55") => ({
    shadowColor: color,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  }),
};
