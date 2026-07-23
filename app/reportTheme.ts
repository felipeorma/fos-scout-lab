import type { CSSProperties } from "react";

export type ReportTheme = {
  name: string;
  canvas: string;
  paper: string;
  accent: string;
  ink: string;
  muted: string;
  surface: string;
  line: string;
  dark: string;
};

export const REPORT_THEMES: ReportTheme[] = [
  { name: "Ficha 01", canvas: "#e9edf4", paper: "#ffffff", accent: "#1f5fd6", ink: "#0d1b2a", muted: "#8493ab", surface: "#f7f9fc", line: "#e8ecf2", dark: "#16315f" },
  { name: "Noche", canvas: "#0b0f17", paper: "#111827", accent: "#6f95ff", ink: "#eef3ff", muted: "#93a2be", surface: "#182235", line: "#29364e", dark: "#080d17" },
  { name: "Arena", canvas: "#e8e0d3", paper: "#fffdf8", accent: "#c76137", ink: "#2c2a27", muted: "#857b70", surface: "#f7f0e5", line: "#e8dccb", dark: "#4b3228" },
  { name: "Editorial", canvas: "#e9e7e5", paper: "#ffffff", accent: "#a93545", ink: "#20262a", muted: "#7a8388", surface: "#f7f5f4", line: "#e6e0de", dark: "#292d33" },
  { name: "Azul", canvas: "#e6edf2", paper: "#fdfefe", accent: "#286b92", ink: "#182e3b", muted: "#748a98", surface: "#f1f6f8", line: "#dce7ec", dark: "#12364b" },
];

export const DEFAULT_REPORT_THEME = REPORT_THEMES[0];

export function reportThemeStyle(theme: ReportTheme) {
  return {
    "--report-paper": theme.paper,
    "--report-accent": theme.accent,
    "--report-ink": theme.ink,
    "--report-muted": theme.muted,
    "--report-surface": theme.surface,
    "--report-line": theme.line,
    "--report-dark": theme.dark,
    "--designer-paper": theme.paper,
    "--designer-accent": theme.accent,
    "--designer-text": theme.ink,
  } as CSSProperties;
}
