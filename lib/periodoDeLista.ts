import { ligaYAnioDe } from "./procedencia.ts";
import type { SourceDataset } from "./scouting.ts";
import { tf } from "./i18n.ts";

/** Con qué temporadas se mide una lista: una sola, o la media de varias. */
export type PeriodoDeLista = { modo: "una" | "media"; anios: number[] };
export type OpcionDePeriodo = { clave: string; texto: string; periodo: PeriodoDeLista };

/** "2025/2026" → "2025/26": para que el chip no se alargue. */
const corta = (temporada: string) => temporada.replace(/^(\d{4})\/\d{2}(\d{2})$/, "$1/$2");

/**
 * Las temporadas que se pueden elegir para una lista, y cuál va por defecto.
 *
 * Se cuentan por el año con que se cruzan las bases: el final (una
 * 2025/2026 es 2026, como una 2026). El texto dice cómo las escribe cada
 * archivo ("Temporada 2025/26 · 2026"). Además de cada una, la media de las
 * dos últimas (si hay tres o más) y la de todas. Por defecto, el año con más
 * competiciones —con todas las ligas cargadas, el de la temporada en curso—;
 * a igualdad, el más reciente. SkillCorner no cuenta: es una capa encima de
 * otra base, no una competición más.
 */
export function opcionesDePeriodo(bases: SourceDataset[]): { anios: number[]; opciones: OpcionDePeriodo[]; porDefecto: string } {
  const etiquetas = new Map<number, Set<string>>();
  const cuantas = new Map<number, number>();
  for (const base of bases) {
    if (!base.season || base.provider === "skillcorner") continue;
    const etiqueta = corta(ligaYAnioDe(base.fileName).temporada || String(base.season));
    etiquetas.set(base.season, (etiquetas.get(base.season) ?? new Set<string>()).add(etiqueta));
    cuantas.set(base.season, (cuantas.get(base.season) ?? 0) + 1);
  }
  const anios = [...etiquetas.keys()].sort((a, b) => b - a);
  const nombre = (anio: number) => [...(etiquetas.get(anio) ?? [])].sort().join(" · ");
  const opciones: OpcionDePeriodo[] = anios.map((anio) => ({ clave: String(anio), texto: tf("Temporada {t}", { t: nombre(anio) }), periodo: { modo: "una", anios: [anio] } }));
  if (anios.length > 2) opciones.push({ clave: "media-2", texto: tf("Media de {t}", { t: `${anios[1]} + ${anios[0]}` }), periodo: { modo: "media", anios: anios.slice(0, 2) } });
  if (anios.length > 1) opciones.push({ clave: "media", texto: tf("Media de {t}", { t: [...anios].reverse().join(" + ") }), periodo: { modo: "media", anios } });
  const porDefecto = [...anios].sort((a, b) => (cuantas.get(b) ?? 0) - (cuantas.get(a) ?? 0) || b - a)[0];
  return { anios, opciones, porDefecto: porDefecto === undefined ? "" : String(porDefecto) };
}
