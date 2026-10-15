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
  /** Hoja oscura (look Night): cambia el radar, la impresión y algún detalle que se pensó para papel. */
  oscuro?: boolean;
  /** Degradado vertical de la tarjeta, de arriba abajo; sin él, el papel liso. */
  paperTop?: string;
  paperBottom?: string;
  /** Texto más apagado que muted (bajadas, notas). */
  faint?: string;
  /** Fondo de las barras y pistas. */
  track?: string;
};

/**
 * Los tres primeros son los temas de cliente: el informe sale con el color
 * del encargo, igual que la interfaz. Se aplican solos al cambiar de espacio,
 * y después se puede elegir otro a mano sin que nada los reimponga hasta el
 * siguiente cambio de espacio.
 *
 * Los acentos son los mismos que usa la interfaz (globals.css, bloque de
 * paletas): si se cambia uno, cambiar también el otro.
 */
export const CLIENT_THEMES: Record<"cavalry" | "maldonado" | "otros", ReportTheme> = {
  // Rojo sobre blanco y negro, que es como se presenta el club. El verde
  // militar quedaba de secundario y se comía la cabecera del informe: la
  // ficha salía con un panel verde y acentos rojos, que no es la imagen de
  // Cavalry. Los neutros van sin tinte cálido para que el rojo sea el único
  // color de la hoja.
  //
  // Desde el 15 de octubre de 2026, el look Night de diseno-reportes-cavalry.json:
  // tarjeta grafito con degradado y filete, rojo #FF3B30 como único acento.
  // El claro de antes sigue en la lista como "Cavalry claro".
  cavalry: {
    name: "Cavalry", canvas: "#08080a", paper: "#141418", accent: "#ff3b30", ink: "#f5f5f7", muted: "#b7b7c2", surface: "#1b1b20", line: "#2a2a32", dark: "#08080a",
    oscuro: true, paperTop: "#1b1b20", paperBottom: "#101013", faint: "#858592", track: "#27272f",
  },
  // Verdirrojo: manda el verde, que es el que lo separa de Cavalry.
  maldonado: { name: "Maldonado", canvas: "#e7efe9", paper: "#ffffff", accent: "#17804a", ink: "#12211a", muted: "#5f7067", surface: "#f4f9f6", line: "#dce9e2", dark: "#0f5c34" },
  otros: { name: "Neutro", canvas: "#ecedee", paper: "#ffffff", accent: "#6f747c", ink: "#1c1e21", muted: "#65686f", surface: "#f6f7f8", line: "#e4e6e8", dark: "#3a3d42" },
};

export const CAVALRY_CLARO: ReportTheme = { name: "Cavalry claro", canvas: "#dedede", paper: "#ffffff", accent: "#cd2b2b", ink: "#121212", muted: "#6e6e6e", surface: "#f5f5f5", line: "#e3e3e3", dark: "#101010" };

export const REPORT_THEMES: ReportTheme[] = [
  CLIENT_THEMES.cavalry,
  CAVALRY_CLARO,
  CLIENT_THEMES.maldonado,
  CLIENT_THEMES.otros,
  { name: "Ficha 01", canvas: "#e9edf4", paper: "#ffffff", accent: "#1f5fd6", ink: "#0d1b2a", muted: "#8493ab", surface: "#f7f9fc", line: "#e8ecf2", dark: "#16315f" },
  { name: "Noche", canvas: "#0b0f17", paper: "#111827", accent: "#6f95ff", ink: "#eef3ff", muted: "#93a2be", surface: "#182235", line: "#29364e", dark: "#080d17", oscuro: true },
  { name: "Arena", canvas: "#e8e0d3", paper: "#fffdf8", accent: "#c76137", ink: "#2c2a27", muted: "#857b70", surface: "#f7f0e5", line: "#e8dccb", dark: "#4b3228" },
  { name: "Editorial", canvas: "#e9e7e5", paper: "#ffffff", accent: "#a93545", ink: "#20262a", muted: "#7a8388", surface: "#f7f5f4", line: "#e6e0de", dark: "#292d33" },
  { name: "Azul", canvas: "#e6edf2", paper: "#fdfefe", accent: "#286b92", ink: "#182e3b", muted: "#748a98", surface: "#f1f6f8", line: "#dce7ec", dark: "#12364b" },
];

export const DEFAULT_REPORT_THEME = CLIENT_THEMES.cavalry;

export function reportThemeStyle(theme: ReportTheme) {
  return {
    "--report-paper": theme.paper,
    "--report-accent": theme.accent,
    "--report-ink": theme.ink,
    "--report-muted": theme.muted,
    "--report-surface": theme.surface,
    "--report-line": theme.line,
    "--report-dark": theme.dark,
    "--report-paper-top": theme.paperTop ?? theme.paper,
    "--report-paper-bottom": theme.paperBottom ?? theme.paper,
    "--report-faint": theme.faint ?? theme.muted,
    "--report-track": theme.track ?? theme.line,
    "--designer-paper": theme.paper,
    "--designer-accent": theme.accent,
    "--designer-text": theme.ink,
  } as CSSProperties;
}
