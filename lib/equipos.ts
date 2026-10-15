import { numeric, type CellValue, type DataRow } from "./scouting.ts";

/**
 * El puesto del equipo del jugador en una métrica, frente al resto de clubes
 * del marco: la mediana de cada plantilla, no la media (un solo crack no debe
 * levantar a un equipo entero). Lo usa Contexto.
 */

export function mediana(values: number[]) {
  if (!values.length) return Number.NaN;
  const orden = [...values].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export type ContextoEquipo = { rank: number; total: number; valor: number };

/** Jugadores con dato que necesita un club para tener mediana propia en el puesto del equipo. */
const MINIMO_POR_EQUIPO = 5;

/** Ranking del equipo del jugador en cada métrica, frente al resto de equipos. */
export function rankingDeEquipos(rows: DataRow[], metricKey: string, equipo: string): ContextoEquipo | null {
  const porEquipo = new Map<string, number[]>();
  for (const row of rows) {
    const club = String(row.Team ?? "").trim();
    const valor = numeric(row[metricKey] as CellValue);
    if (!club || !Number.isFinite(valor)) continue;
    porEquipo.set(club, [...(porEquipo.get(club) ?? []), valor]);
  }
  if (porEquipo.size < 2 || !porEquipo.has(equipo)) return null;
  const medias = [...porEquipo.entries()]
    // Un club con uno o dos jugadores en la base no es una plantilla: es quien
    // se fue a él después. Con la base de su liga, los que dejaron la OBOS
    // 2025 aparecían con su club de 2026 y el puesto salía "de 40".
    .filter(([club, valores]) => club === equipo || valores.length >= MINIMO_POR_EQUIPO)
    .map(([club, valores]) => ({ club, valor: mediana(valores) }))
    .filter((item) => Number.isFinite(item.valor))
    .sort((a, b) => b.valor - a.valor);
  const posicion = medias.findIndex((item) => item.club === equipo);
  if (posicion < 0 || medias.length < 2) return null;
  return { rank: posicion + 1, total: medias.length, valor: medias[posicion].valor };
}
