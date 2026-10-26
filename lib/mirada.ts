/**
 * Lo que ve un jugador: desde dónde mira, hacia dónde y quién le cae dentro.
 *
 * Mira al balón. Si lo lleva él (está a menos de dos metros), mira hacia
 * donde corre y, parado, hacia la portería que ataca: nosotros hacia +x,
 * ellos hacia −x. La cuña es su visión útil, no la periférica: lo que puede
 * leer sin girar la cabeza.
 */

import { balonEn, posicionEn, type Fase, type Jugada, type Punto } from "./abp.ts";

/** La apertura de la cuña, en grados: treinta a cada lado de la mirada. */
export const APERTURA = 60;
/** Hasta dónde llega la cuña dibujada, en metros. */
export const ALCANCE = 32;
/** A qué altura van los ojos, en metros. */
export const OJOS = 1.72;

export type Mirada = {
  /** Dónde está el jugador. */
  desde: Punto;
  /** Hacia dónde mira, en radianes sobre el césped (0 = hacia +x, π/2 = hacia +z). */
  angulo: number;
  /** El punto al que mira: el balón, o un punto delante si lo lleva él. */
  mira: Punto & { y: number };
};

/** La mirada de una ficha en el instante `t` de la fase; null si no está en el campo. */
export function miradaDe(jugada: Jugada, fase: Fase, fichaId: string, t: number, lineal = false): Mirada | null {
  const ficha = jugada.fichas.find((f) => f.id === fichaId);
  const desde = posicionEn(fase, fichaId, t, lineal);
  if (!ficha || !desde) return null;
  const balon = balonEn(fase, t);
  const dx = balon.x - desde.x, dz = balon.z - desde.z;
  if (Math.hypot(dx, dz) >= 2) return { desde, angulo: Math.atan2(dz, dx), mira: balon };
  // Con el balón: hacia donde va, y si no va a ningún sitio, hacia la portería que ataca.
  const luego = posicionEn(fase, fichaId, Math.min(1, t + 0.04), lineal) ?? desde;
  const corre = Math.hypot(luego.x - desde.x, luego.z - desde.z) > 0.05;
  const angulo = corre ? Math.atan2(luego.z - desde.z, luego.x - desde.x) : ficha.equipo === "local" ? 0 : Math.PI;
  return { desde, angulo, mira: { x: desde.x + Math.cos(angulo) * 20, z: desde.z + Math.sin(angulo) * 20, y: 0 } };
}

/** Si un punto cae dentro de la cuña de una mirada (y a no más de `alcance` metros). */
export function dentroDeLaCuna(m: Mirada, p: Punto, alcance = Infinity): boolean {
  const dx = p.x - m.desde.x, dz = p.z - m.desde.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01 || d > alcance) return false;
  let giro = Math.atan2(dz, dx) - m.angulo;
  giro = Math.atan2(Math.sin(giro), Math.cos(giro));
  return Math.abs(giro) <= (APERTURA / 2) * (Math.PI / 180);
}

/** Cuántos compañeros y rivales ve el jugador en el instante `t`. */
export function quienVe(jugada: Jugada, fase: Fase, fichaId: string, t: number, lineal = false): { companeros: number; rivales: number } | null {
  const m = miradaDe(jugada, fase, fichaId, t, lineal);
  const yo = jugada.fichas.find((f) => f.id === fichaId);
  if (!m || !yo) return null;
  let companeros = 0, rivales = 0;
  for (const f of jugada.fichas) {
    if (f.id === fichaId) continue;
    const p = posicionEn(fase, f.id, t, lineal);
    if (!p || !dentroDeLaCuna(m, p)) continue;
    if (f.equipo === yo.equipo) companeros += 1; else rivales += 1;
  }
  return { companeros, rivales };
}
