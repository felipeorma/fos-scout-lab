import { METRICS, buildPlayerReport, peerCohort, type DataRow } from "./scouting.ts";
import { COMPUESTAS, familiasCompuestas } from "./snapshot.ts";

/**
 * Lo que la IA lee para escribir la lectura rápida de Card & Radar.
 *
 * La ficha enseña de 7 a 12 métricas, y con solo eso la IA repetía el radar
 * con otras palabras. Para analizar de verdad necesita al jugador entero:
 * las familias (rasgos que juntan varias métricas), el resto de métricas de
 * su posición y la liga. El texto mide lo mismo que antes; lo que cambia es
 * cuánto sabe quien lo escribe.
 */

export type FamiliaParaLectura = { familia: string; percentil: number };
export type MetricaParaLectura = { label: string; value: number; percentile: number; inverse?: boolean };

// Las métricas que solo tiene el perfil de portero: en un extremo serían
// ceros en fila, ruido que la IA podría leer como carencias.
const SOLO_DE_PORTERO = (() => {
  const deCampo = new Set(Object.entries(METRICS)
    .filter(([perfil]) => perfil !== "GK")
    .flatMap(([, definiciones]) => definiciones.map((d) => d.label)));
  return new Set((METRICS.GK ?? []).map((d) => d.label).filter((label) => !deCampo.has(label)));
})();

// A un portero solo le describe la construcción: "Amenaza" o "Progresión" en
// percentil 94 frente a otros porteros es ruido, y "Asociación" mide pases en
// el último tercio, que no es su trabajo; la IA leía ahí un "pie corto" que
// contradecía una construcción en P99.
const FAMILIAS_DE_PORTERO = new Set(["construccion"]);

/** Del catálogo de la base, las métricas que dicen algo de esta posición. */
export function etiquetasParaLectura(cohorte: string, catalogo: string[]): string[] {
  if (peerCohort(cohorte) === "GK") {
    const dePortero = new Set((METRICS.GK ?? []).map((d) => d.label));
    return catalogo.filter((label) => dePortero.has(label));
  }
  return catalogo.filter((label) => !SOLO_DE_PORTERO.has(label));
}

/**
 * Las familias del jugador, de la más alta a la más baja, y el resto de sus
 * métricas (las que no están ya en la ficha), con su percentil frente a los
 * de su posición.
 */
export function contextoDeLectura(
  rows: DataRow[], indice: number, minutosMin: number, cohorte: string,
  etiquetasDeLaFicha: string[], catalogo: string[],
): { familias: FamiliaParaLectura[]; resto: MetricaParaLectura[] } {
  const valores = familiasCompuestas(rows, cohorte, minutosMin, indice).valores.get(indice) ?? {};
  const portero = peerCohort(cohorte) === "GK";
  const familias = COMPUESTAS
    .filter((familia) => !portero || FAMILIAS_DE_PORTERO.has(familia.id))
    .filter((familia) => valores[familia.id] && Number.isFinite(valores[familia.id].percentil))
    .map((familia) => ({ familia: familia.etiqueta, percentil: Math.round(valores[familia.id].percentil) }))
    .sort((a, b) => b.percentil - a.percentil);

  const enLaFicha = new Set(etiquetasDeLaFicha);
  const extra = etiquetasParaLectura(cohorte, catalogo).filter((label) => !enLaFicha.has(label));
  const informe = extra.length ? buildPlayerReport(rows, indice, minutosMin, cohorte, extra) : null;
  const resto = (informe?.metrics ?? [])
    .filter((metrica) => Number.isFinite(metrica.value) && Number.isFinite(metrica.percentile))
    .map((metrica) => ({ label: metrica.label, value: metrica.value, percentile: metrica.percentile, inverse: metrica.inverse }));
  return { familias, resto };
}
