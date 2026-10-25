/**
 * Cuánto fiarse del índice de un jugador según cuántos minutos lo sostienen.
 *
 * Medido el 14 de octubre de 2026 con StatsBomb en doce ligas: 1.661
 * jugadores con dos temporadas seguidas en la misma liga y el mismo puesto,
 * medidos contra los de su liga. Lo que se mueve su número de una temporada
 * a la siguiente, separado según los minutos de la temporada con menos (la
 * otra con 900′ o más, y descontado su propio error):
 *
 *   300–599′ → 13 · 600–899′ → 12 · 900–1.999′ → 9 · 2.000′ o más → 8
 *
 * Por debajo de 300′ no se midió: no hay margen que dar, y la ficha dice
 * que no hay minutos para un número fiable en vez de inventarlo.
 *
 * Es una cota alta: dentro va también lo que el jugador cambió de verdad de
 * un año a otro. Aun así basta para leer el número: dos jugadores a menos de
 * esa distancia no se pueden separar con estos datos.
 */

/** Por debajo de estos minutos la ficha avisa de que el índice es poco fiable. */
export const MINUTOS_FIABLES = 900;

const TRAMOS: Array<{ desde: number; margen: number }> = [
  { desde: 2000, margen: 8 },
  { desde: 900, margen: 9 },
  { desde: 600, margen: 12 },
  { desde: 300, margen: 13 },
];

/** El margen típico del índice, en puntos, para un jugador con estos minutos; null por debajo de 300′. */
export function margenDelIndice(minutos: number): number | null {
  const m = Number.isFinite(minutos) ? minutos : 0;
  return TRAMOS.find((tramo) => m >= tramo.desde)?.margen ?? null;
}

/**
 * Cuánto se repite cada métrica de una temporada a la siguiente: la
 * correlación de su percentil (dentro de liga, temporada y puesto) entre dos
 * temporadas seguidas, con 900′ o más en las dos. StatsBomb, doce ligas,
 * medido el 14 de octubre de 2026. Las que no están (Wyscout, las de juego de
 * SkillCorner) no se pudieron medir y valen PESO_SIN_MEDIR.
 *
 * Lo usa la búsqueda de similares para pesar cada métrica: lo que no se
 * repite describe cómo le fue a un jugador, no cómo juega.
 */
export const REPETIBILIDAD: Record<string, number> = {
  "Atajadas % (SB)": 0.05, "OBV defensivo (SB)": 0.10, "OBV portero (SB)": 0.16, "PSxG en contra (SB)": 0.21,
  "PSxG sin penales (SB)": 0.24, "Entradas ganadas % (SB)": 0.25, "Conversión de gol % (SB)": 0.25, "Goles /90 (SB)": 0.27,
  "Penales ganados (SB)": 0.27, "Intercepciones (SB)": 0.33, "Bloqueos por remate (SB)": 0.34, "xG asistido JA (SB)": 0.34,
  "Precisión balón largo % (SB)": 0.41, "Longitud de pase (SB)": 0.41, "Centros al área % (SB)": 0.44, "Pases clave JA (SB)": 0.44,
  "OBV regate y conducción (SB)": 0.45, "Distancia de intervención (SB)": 0.45, "Pases profundos completados (SB)": 0.46,
  "Pases al área JA (SB)": 0.46, "xG (SB)": 0.47, "Pases filtrados (SB)": 0.48, "OBV pase (SB)": 0.49,
  "Precisión bajo presión % (SB)": 0.53, "Entradas + intercepciones (SB)": 0.54, "Contrapresiones (SB)": 0.54,
  "Toques en el área (SB)": 0.55, "Aéreos ganados % (SB)": 0.55, "Recuperaciones (SB)": 0.55, "Remates (SB)": 0.57,
  "Entradas (SB)": 0.57, "Precisión de pase % (SB)": 0.59, "Progresiones profundas (SB)": 0.60, "Aéreos ganados (SB)": 0.63,
  "Balones largos (SB)": 0.65, "Conducciones (SB)": 0.66, "Faltas recibidas (SB)": 0.66, "Regates exitosos (SB)": 0.69,
  "Velocidad punta km/h (SC)": 0.72, "Pases JA (SB)": 0.74,
};

/** El peso de una métrica sin medir: el de una métrica de repetibilidad media. */
export const PESO_SIN_MEDIR = 0.5;

/** Peso de una métrica según su repetibilidad, con un suelo para no anular ninguna del todo. */
export function pesoPorRepetibilidad(etiqueta: string) {
  return Math.max(0.05, REPETIBILIDAD[etiqueta] ?? PESO_SIN_MEDIR);
}
