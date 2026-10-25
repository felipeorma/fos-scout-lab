/**
 * Lo que la hoja de Similitud dice además del porcentaje: dónde coinciden los
 * dos jugadores y dónde se separan, las claves en viñetas (máximo cinco) y
 * los duelos del encabezado. Se calcula al montar la comparación y viaja con
 * ella, así que una hoja guardada en Visuales se lee igual después.
 */

import { numberLocale, t, tf } from "./i18n.ts";
import { margenDelIndice } from "./fiabilidad.ts";
import { nivelDeLiga, type EntradaOpta } from "./nivelDeLiga.ts";
import type { SimilarityMetricComparison } from "./similarity.ts";

export type DueloDeSimilitud = { etiqueta: string; objetivo: number; comparable: number; decimales?: number };
export type OtroParecido = { nombre: string; equipo: string; detalle: string; parecido: number };

export type ExtraDeSimilitud = {
  duelos: DueloDeSimilitud[];
  /** Claves de métrica, de la más cercana a la más lejana. */
  coinciden: string[];
  separan: string[];
  claves: string[];
  otros: OtroParecido[];
};

type Jugador = { nombre: string; minutos: number; liga: string | null };

/** Números en el idioma de la hoja, con separador de miles también en cuatro cifras. */
const cifra = (valor: number, decimales = 0) => valor.toLocaleString(numberLocale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: "always" } as Intl.NumberFormatOptions);

const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;
const diferencia = (m: SimilarityMetricComparison) => m.candidatePercentile - m.targetPercentile;

/** Las métricas más parecidas y las más distintas entre los dos, sin repetir ninguna. */
export function coincidenciasYDiferencias(metricas: SimilarityMetricComparison[], cuantas = 5) {
  const ordenadas = [...metricas].sort((a, b) => Math.abs(diferencia(a)) - Math.abs(diferencia(b)) || b.weight - a.weight);
  const n = Math.min(cuantas, Math.floor(ordenadas.length / 2));
  return {
    coinciden: ordenadas.slice(0, n).map((m) => m.key),
    separan: ordenadas.slice(-n).reverse().map((m) => m.key),
  };
}

const media = (valores: number[]) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0);

/** Los duelos del encabezado: percentil medio, edad y minutos. */
export function duelosDeSimilitud(metricas: SimilarityMetricComparison[], objetivo: { edad: number; minutos: number }, comparable: { edad: number; minutos: number }): DueloDeSimilitud[] {
  return [
    { etiqueta: "Percentil medio", objetivo: Math.round(media(metricas.map((m) => m.targetPercentile))), comparable: Math.round(media(metricas.map((m) => m.candidatePercentile))) },
    { etiqueta: "Edad", objetivo: objetivo.edad, comparable: comparable.edad },
    { etiqueta: "Minutos", objetivo: objetivo.minutos, comparable: comparable.minutos },
  ].filter((duelo) => Number.isFinite(duelo.objetivo) && Number.isFinite(duelo.comparable) && duelo.objetivo + duelo.comparable > 0);
}

const lista = (partes: string[]) => partes.length > 1 ? `${partes.slice(0, -1).join(", ")} ${t("y")} ${partes[partes.length - 1]}` : partes[0] ?? "";

/**
 * Hasta cinco claves, en este orden: en qué coinciden, dónde gana cada uno,
 * el nivel de sus ligas y si los minutos dan para fiarse del número.
 */
export function clavesDeSimilitud({ metricas, objetivo, comparable, feed = null }: {
  metricas: SimilarityMetricComparison[];
  objetivo: Jugador;
  comparable: Jugador;
  feed?: EntradaOpta[] | null;
}): string[] {
  const claves: string[] = [];
  const a = apellido(objetivo.nombre), b = apellido(comparable.nombre);
  const parP = (m: SimilarityMetricComparison, primero: "objetivo" | "comparable") => primero === "objetivo"
    ? tf("{m} (P{x} frente a P{y})", { m: t(m.label), x: m.targetPercentile, y: m.candidatePercentile })
    : tf("{m} (P{x} frente a P{y})", { m: t(m.label), x: m.candidatePercentile, y: m.targetPercentile });

  const cercanas = [...metricas].sort((x, y) => Math.abs(diferencia(x)) - Math.abs(diferencia(y))).filter((m) => Math.abs(diferencia(m)) < 5).slice(0, 2);
  if (cercanas.length) {
    claves.push(tf("Coinciden en {lista}.", { lista: lista(cercanas.map((m) => tf("{m} (P{x} y P{y})", { m: t(m.label), x: m.targetPercentile, y: m.candidatePercentile }))) }));
  }
  const ganaComparable = metricas.filter((m) => diferencia(m) >= 10).sort((x, y) => diferencia(y) - diferencia(x)).slice(0, 2);
  if (ganaComparable.length) claves.push(tf("{b} supera a {a} en {lista}.", { a, b, lista: lista(ganaComparable.map((m) => parP(m, "comparable"))) }));
  const ganaObjetivo = metricas.filter((m) => diferencia(m) <= -10).sort((x, y) => diferencia(x) - diferencia(y)).slice(0, 2);
  if (ganaObjetivo.length) claves.push(tf("{a} supera a {b} en {lista}.", { a, b, lista: lista(ganaObjetivo.map((m) => parP(m, "objetivo"))) }));

  if (objetivo.liga && comparable.liga && objetivo.liga !== comparable.liga) {
    const na = nivelDeLiga(feed, objetivo.liga), nb = nivelDeLiga(feed, comparable.liga);
    if (na && nb) {
      const formato = (r: number) => cifra(r, 1);
      claves.push(tf(nb.rating < na.rating ? "La liga de {b} es más floja: {lb} (Opta {rb}) frente a {la} ({ra})." : "La liga de {b} es más fuerte: {lb} (Opta {rb}) frente a {la} ({ra}).", {
        b, lb: comparable.liga, rb: formato(nb.rating), la: objetivo.liga, ra: formato(na.rating),
      }));
    } else {
      claves.push(tf("Ligas distintas: {lb} y {la}. Sin nivel de Opta para compararlas.", { lb: comparable.liga, la: objetivo.liga }));
    }
  }

  const margen = (j: Jugador) => margenDelIndice(j.minutos);
  const mb = margen(comparable), ma = margen(objetivo);
  if (mb === null) claves.push(tf("{b} tiene {m}′: muy pocos minutos para fiarse de sus números.", { b, m: cifra(comparable.minutos) }));
  else if (mb >= 12 || (ma !== null && ma >= 12)) {
    claves.push(tf("Poca muestra: {b} con {mb}′ (margen ±{xb}) y {a} con {ma}′ (±{xa}).", {
      a, b, mb: cifra(comparable.minutos), xb: mb, ma: cifra(objetivo.minutos), xa: ma ?? "—",
    }));
  }
  return claves.slice(0, 5);
}
