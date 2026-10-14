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
