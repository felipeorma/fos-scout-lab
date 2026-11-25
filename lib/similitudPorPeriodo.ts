import type { DataRow } from "./scouting.ts";
import {
  buildSimilaritySearch,
  MINIMO_COHORTE_POR_LIGA,
  type SimilarityFilters,
  type SimilarityMetricWeights,
  type SimilarityPlayer,
} from "./similarity.ts";

/**
 * El objetivo con unas temporadas y el comparable con otras.
 *
 * El ranking de Similitud se calcula con el período del objetivo: si se mira
 * su 2025 + 2026, todos entran con su 2025 + 2026, para que la comparación sea
 * entre iguales. Pero al abrir a un comparable puede interesar otro tramo
 * suyo —solo su última temporada, o sumarle una más antigua—, y entonces sus
 * percentiles tienen que salir de SU período, no del del objetivo: un promedio
 * de dos años medido contra jugadores de uno solo no dice lo mismo.
 *
 * Se resuelve sin tocar el motor: las dos poblaciones van juntas en una sola
 * lista y cada fila lleva la etiqueta de su período delante de su liga. Con el
 * modo "por liga" del motor, cada jugador se mide contra los de su etiqueta:
 * el objetivo contra su período y el comparable contra el suyo. Si la hoja no
 * mide por liga, la etiqueta es solo el período, y el grupo es el período
 * entero, como en el ranking.
 */
export function compararConSusTemporadas({
  objetivo,
  comparable,
  porLiga,
  filters,
  metricWeights,
  reportCohort,
  metricLabels,
}: {
  objetivo: { filas: DataRow[]; indice: number; claves: string[][] | null };
  comparable: { filas: DataRow[]; indice: number; claves: string[][] | null };
  /** Si la hoja mide a cada uno contra su liga (y año) o contra todo lo cargado. */
  porLiga: boolean;
  filters: SimilarityFilters;
  metricWeights: SimilarityMetricWeights;
  reportCohort: string;
  metricLabels: string[] | null;
}): SimilarityPlayer | null {
  if (!objetivo.filas[objetivo.indice] || !comparable.filas[comparable.indice]) return null;
  const etiquetas = (periodo: "objetivo" | "comparable", filas: DataRow[], claves: string[][] | null) =>
    filas.map((_, indice) => (porLiga
      ? (claves?.[indice] ?? []).map((clave) => `${periodo}|${clave}`)
      : [periodo]));
  const filas = [...objetivo.filas, ...comparable.filas];
  const ligasPorFila = [
    ...etiquetas("objetivo", objetivo.filas, objetivo.claves),
    ...etiquetas("comparable", comparable.filas, comparable.claves),
  ];
  // El buscador de nombre no cuenta aquí: el comparable ya se eligió.
  const busqueda = buildSimilaritySearch(filas, objetivo.indice, { ...filters, query: "" }, metricWeights, reportCohort, metricLabels, {
    ligasPorFila,
    minimoCohorte: porLiga ? MINIMO_COHORTE_POR_LIGA : 1,
  });
  const buscado = objetivo.filas.length + comparable.indice;
  return busqueda?.candidates.find((candidato) => candidato.index === buscado) ?? null;
}
