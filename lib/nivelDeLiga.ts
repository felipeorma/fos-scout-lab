import type { OptaLiga } from "./maldonado.ts";
import { numberLocale } from "./i18n.ts";

/**
 * Nivel de liga: cuánto vale un índice según dónde se consiguió.
 *
 * La ficha mide a cada jugador contra los de su puesto en SU liga y
 * temporada. Ese número dice qué papel hace donde juega, pero un 60 en la MLS
 * Next Pro no es un 60 en la CPL. Para llevarlo a la liga de referencia se usa
 * el rating de los Opta Power Rankings y una regla calibrada con datos.
 *
 * Calibración (14 de octubre de 2026): 112 jugadores de campo que cambiaron de
 * liga entre la temporada 2025 y la 2026, con 900′ o más en las dos, en doce
 * ligas de StatsBomb con rating de Opta. Entre su índice dentro de la liga
 * nueva y el de la vieja:
 *
 *   índice nuevo ≈ 20,5 + 0,60 · índice viejo − 0,43 · (rating nuevo − rating viejo)
 *
 * Los 0,60 son regresión a la media y les pasa igual a los que no se mueven.
 * Los 0,43 son el nivel: por cada punto de rating que sube la liga, el índice
 * dentro de ella baja 0,43 (IC del 95 %, 0,21 a 0,62; entre 0,40 y 0,48 en
 * cada bloque de una validación cruzada en diez). Quien sube cinco puntos o
 * más de rating pierde de media 9 puntos de índice y quien baja gana 7.
 *
 * La otra versión que se probó —multiplicar el índice por el cociente de
 * ratings— corrige de más: por sí sola predice peor que no tocar nada. El
 * ajuste aditivo, en cambio, baja el error en los que cambian de liga de 9,2
 * a 8,6 puntos.
 *
 * Se aplica al índice, no a las cuñas del radar: está calibrado sobre el
 * índice y Opta mide la fuerza de los equipos, no cómo viaja cada métrica.
 */

/** Puntos de percentil medio (el número de la ficha) por punto de rating de Opta. Ver la calibración arriba. */
export const PUNTOS_POR_RATING = 0.43;

/**
 * Lo mismo para el índice que ordena el ranking, que pesa más los picos y
 * deja fuera las métricas que no se repiten: 0,39 por punto de rating (IC del
 * 95 %, 0,21 a 0,55; entre 0,32 y 0,48 por bloque), con la misma muestra. En
 * validación cruzada, el error en los que cambian de liga es 8,5 sin ajustar,
 * 8,5 con la regla de tres y 8,3 con la aditiva.
 */
export const PUNTOS_POR_RATING_INDICE = 0.39;

/** Una entrada del feed de Opta; solo lo que se usa. */
export type EntradaOpta = OptaLiga & { globalRank?: number };

type LigaConocida = {
  /** Cómo la llama Opta. El nombre solo no basta: hay "National League" en dos países. */
  opta: { leagueName: string; countryName: string };
  /** El nombre corto para la ficha. */
  corto: string;
};

/**
 * Las ligas de la aplicación, por el nombre con el que entran sus bases
 * (el de StatsBomb y SkillCorner), y su equivalente en el feed.
 * La NCAA no está: Opta no la publica.
 */
export const LIGAS_CON_NIVEL: Record<string, LigaConocida> = {
  "Canadian Premier League": { opta: { leagueName: "Canadian Premier League", countryName: "Canada" }, corto: "CPL" },
  "MLS": { opta: { leagueName: "US Major League Soccer", countryName: "USA" }, corto: "MLS" },
  "MLS Next Pro": { opta: { leagueName: "MLS Next Pro", countryName: "USA" }, corto: "MLS NP" },
  "USL Championship": { opta: { leagueName: "USL Championship", countryName: "USA" }, corto: "USL Ch." },
  "USL League One": { opta: { leagueName: "USL League One", countryName: "USA" }, corto: "USL L1" },
  "Allsvenskan": { opta: { leagueName: "Swedish Allsvenskan", countryName: "Sweden" }, corto: "Allsv." },
  "Superettan": { opta: { leagueName: "Swedish Superettan", countryName: "Sweden" }, corto: "Superettan" },
  "OBOS-ligaen": { opta: { leagueName: "Norwegian 1. divisjon", countryName: "Norway" }, corto: "OBOS" },
  "Veikkausliiga": { opta: { leagueName: "Finnish Veikkausliiga", countryName: "Finland" }, corto: "Veikkaus." },
  "Eerste Divisie": { opta: { leagueName: "Dutch Eerste Divisie", countryName: "Netherlands" }, corto: "Eerste Div." },
  "Ligue 3": { opta: { leagueName: "French Ligue 3", countryName: "France" }, corto: "Ligue 3" },
  "National League": { opta: { leagueName: "English National League", countryName: "England" }, corto: "Nat. League" },
  "Premier Division": { opta: { leagueName: "Irish Premier League", countryName: "Republic of Ireland" }, corto: "Irlanda" },
  "Segunda Liga": { opta: { leagueName: "Portuguese Segunda Liga", countryName: "Portugal" }, corto: "Liga 2 POR" },
  "A-League": { opta: { leagueName: "Australian A-League Men", countryName: "New Zealand" }, corto: "A-League" },
};

/**
 * Copia fechada del feed (2026-10-13), para cuando no responde. No son
 * valores inventados: es lo que publicaba Opta ese día, y la ficha dice que
 * está usando la copia y de qué fecha es.
 */
export const NIVEL_RESPALDO: Record<string, { rating: number; puesto: number }> = {
  "Canadian Premier League": { rating: 65.29, puesto: 135 },
  "MLS": { rating: 79.47, puesto: 17 },
  "MLS Next Pro": { rating: 55.97, puesto: 247 },
  "USL Championship": { rating: 66.07, puesto: 122 },
  "USL League One": { rating: 59.34, puesto: 213 },
  "Allsvenskan": { rating: 76.92, puesto: 34 },
  "Superettan": { rating: 66.91, puesto: 107 },
  "OBOS-ligaen": { rating: 69.6, puesto: 79 },
  "Veikkausliiga": { rating: 70.78, puesto: 70 },
  "Eerste Divisie": { rating: 66.33, puesto: 118 },
  "Ligue 3": { rating: 69.26, puesto: 81 },
  "National League": { rating: 60.23, puesto: 204 },
  "Premier Division": { rating: 69.63, puesto: 78 },
  "Segunda Liga": { rating: 73.36, puesto: 53 },
  "A-League": { rating: 70.56, puesto: 72 },
};
export const FECHA_NIVEL_RESPALDO = "2026-10-13";

/** La liga de referencia de la ficha de Cavalry: la del club. */
export const LIGA_DE_REFERENCIA = "Canadian Premier League";

export type NivelDeLiga = {
  liga: string;
  corto: string;
  rating: number;
  /** El puesto de la liga entre todas las del feed; null si no lo trae. */
  puesto: number | null;
  /** false cuando sale de la copia fechada y no del feed en vivo. */
  enVivo: boolean;
};

const sinAcentos = (valor: string) => String(valor ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * El nivel de una liga: del feed si lo hay, y si no de la copia fechada.
 * Una liga que la aplicación no conoce no tiene nivel: no se le pone uno.
 */
export function nivelDeLiga(feed: EntradaOpta[] | null | undefined, liga: string): NivelDeLiga | null {
  const conocida = LIGAS_CON_NIVEL[liga];
  if (!conocida) return null;
  const encontrada = feed?.find((entrada) => (
    sinAcentos(entrada.leagueName ?? "") === sinAcentos(conocida.opta.leagueName)
    && sinAcentos(entrada.countryName ?? "") === sinAcentos(conocida.opta.countryName)
  ));
  const rating = Number(encontrada?.seasonAverageRating);
  if (Number.isFinite(rating) && rating > 0) {
    const puesto = Number(encontrada?.globalRank);
    return { liga, corto: conocida.corto, rating, puesto: Number.isFinite(puesto) && puesto > 0 ? puesto : null, enVivo: true };
  }
  const copia = NIVEL_RESPALDO[liga];
  return copia ? { liga, corto: conocida.corto, rating: copia.rating, puesto: copia.puesto, enVivo: false } : null;
}

/**
 * El rating de donde jugó, ponderado por minutos: quien pasó media temporada
 * en cada liga se mide a medio camino. Si una de sus ligas no tiene rating no
 * se da ninguno: mezclar un tramo con nivel y otro sin él daría un número que
 * no es ni lo uno ni lo otro.
 */
export function ratingDeTramos(tramos: Array<{ liga: string; minutos: number }>, feed: EntradaOpta[] | null | undefined): number | null {
  const conMinutos = tramos.filter((tramo) => tramo.minutos > 0);
  if (!conMinutos.length) return null;
  let suma = 0;
  let minutos = 0;
  for (const tramo of conMinutos) {
    const nivel = nivelDeLiga(feed, tramo.liga);
    if (!nivel) return null;
    suma += nivel.rating * tramo.minutos;
    minutos += tramo.minutos;
  }
  return suma / minutos;
}

/**
 * Las ligas de un marco "su liga" con su nivel al lado, para decirlo junto al
 * número: "CPL 2026 · Opta 56,0". Las claves son "liga año"; con dos (cambió
 * de liga en el año) se unen con " + ". Una liga sin nivel conocido va sin él:
 * no se le inventa uno.
 */
export function marcoConNivel(claves: string[], feed: EntradaOpta[] | null | undefined): string {
  return claves.map((clave) => {
    const anio = clave.match(/\s+(\d{4})$/)?.[1] ?? "";
    const liga = anio ? clave.slice(0, clave.length - anio.length).trim() : clave;
    const nivel = nivelDeLiga(feed, liga);
    const nombre = `${nivel?.corto ?? liga}${anio ? ` ${anio}` : ""}`;
    return nivel ? `${nombre} · Opta ${nivel.rating.toLocaleString(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : nombre;
  }).join(" + ");
}

/**
 * El índice llevado a la liga de referencia: el mismo jugador, medido entre
 * los de su puesto de esa liga. Aditivo y con tope en 0 y 100.
 */
export function indiceANivel(indice: number, ratingDeSuLiga: number, ratingDeReferencia: number, puntosPorRating = PUNTOS_POR_RATING) {
  return Math.max(0, Math.min(100, Math.round(indice + puntosPorRating * (ratingDeSuLiga - ratingDeReferencia))));
}
