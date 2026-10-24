/**
 * Las superficies del estudio, compartidas por el tablero 2D y el campo 3D.
 * Viven aparte para que el 2D no tenga que cargar three.js.
 */

import type { Superficie } from "@/lib/abp";

/**
 * Las cuatro superficies. Noche es la de la plataforma: casi negro, el
 * césped apenas verde, para que manden las fichas y el color del espacio.
 */
export const SUPERFICIE: Record<Superficie, {
  fondo: string; base: string; franjas: [string, string]; fuera: string; lineas: string; zonas: string; aro: string; tinta: string;
  cielo: number; suelo: number; luz: number; sol: number; asiento: string; muro: string; techo: string;
}> = {
  noche: {
    fondo: "#08080a", base: "#0c1511", franjas: ["#0d1712", "#0f1b15"], fuera: "#0a0f0c", lineas: "rgba(255,255,255,.82)", zonas: "rgba(255,255,255,.2)",
    aro: "#ffffff", tinta: "#ffffff", cielo: 0xffffff, suelo: 0x1a221d, luz: 1.25, sol: 1.5, asiento: "#101014", muro: "#131317", techo: "#0b0b0e",
  },
  retransmision: {
    fondo: "#0a0d0b", base: "#2b6339", franjas: ["#2c6a3b", "#347845"], fuera: "#214a2c", lineas: "rgba(255,255,255,.93)", zonas: "rgba(255,255,255,.3)",
    aro: "#ffffff", tinta: "#ffffff", cielo: 0xffffff, suelo: 0x2a3a2e, luz: 1.15, sol: 1.7, asiento: "#16181c", muro: "#1b1d22", techo: "#101114",
  },
  papel: {
    fondo: "#f2f2ef", base: "#e9e9e4", franjas: ["#ebebe6", "#e5e5df"], fuera: "#deded8", lineas: "rgba(38,38,44,.78)", zonas: "rgba(38,38,44,.24)",
    aro: "#1d1d1f", tinta: "#1d1d1f", cielo: 0xffffff, suelo: 0xd8d8d2, luz: 1.6, sol: 0.75, asiento: "#d6d6d1", muro: "#cacac4", techo: "#bdbdb7",
  },
  tiza: {
    fondo: "#0e1311", base: "#1b2922", franjas: ["#1c2a23", "#19261f"], fuera: "#141e19", lineas: "rgba(238,238,228,.8)", zonas: "rgba(238,238,228,.24)",
    aro: "#eeeee4", tinta: "#f0f0e8", cielo: 0xffffff, suelo: 0x1d2a23, luz: 1.3, sol: 1.2, asiento: "#121915", muro: "#152019", techo: "#0e1411",
  },
};


/** "#ff3b30" con transparencia, para el lienzo 2D. */
export function rgba(hex: string, alfa: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Luminancia relativa de 0 (negro) a 1 (blanco). */
export function luz(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Blanco o casi negro, lo que se lea mejor sobre `fondo`. */
export const tintaSobre = (fondo: string) => (luz(fondo) > 0.55 ? "#0b0b0e" : "#ffffff");
