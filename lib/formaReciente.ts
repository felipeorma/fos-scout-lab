import type { DataRow, RadarMetric } from "./scouting.ts";

/**
 * La forma reciente de un jugador: sus últimos partidos medidos contra la
 * cohorte de la temporada.
 *
 * StatsBomb da por partido las mismas acciones que la temporada, en totales;
 * el puente las lleva a las columnas de la base (por 90 y razones rehechas
 * con sus partes). Aquí se pone esa fila en el lugar de la suya y se mide
 * igual que la temporada: mismo grupo, mismas métricas. Lo que no existe por
 * partido (los ajustados por posesión, SkillCorner) queda vacío —no se mezcla
 * con el valor de la temporada—, y la pantalla dice cuántas faltan.
 */
export function filaConLaForma(original: DataRow, forma: Record<string, number>): DataRow {
  const reciente: DataRow = { ...original };
  for (const columna of Object.keys(original)) {
    if (/\((SB|SC)\)$/.test(columna)) reciente[columna] = columna in forma ? forma[columna] : "";
  }
  return reciente;
}

export type CambioDeForma = {
  key: string;
  label: string;
  group: number;
  colorGroup?: string;
  /** Percentil en la temporada y en los últimos partidos, contra la misma cohorte. */
  temporada: number;
  reciente: number;
  valorReciente: number;
  cambio: number;
};

/** Métrica a métrica, de lo que más sube a lo que más baja; y cuántas no tienen dato por partido. */
export function compararForma(temporada: RadarMetric[], reciente: RadarMetric[]): { cambios: CambioDeForma[]; sinDato: number } {
  const porClave = new Map(reciente.map((metrica) => [metrica.key, metrica]));
  const cambios: CambioDeForma[] = [];
  let sinDato = 0;
  for (const metrica of temporada) {
    const ahora = porClave.get(metrica.key);
    if (!ahora || !Number.isFinite(ahora.value)) { sinDato += 1; continue; }
    cambios.push({
      key: metrica.key, label: metrica.label, group: metrica.group, colorGroup: metrica.colorGroup,
      temporada: metrica.percentile, reciente: ahora.percentile, valorReciente: ahora.value, cambio: ahora.percentile - metrica.percentile,
    });
  }
  cambios.sort((a, b) => b.cambio - a.cambio);
  return { cambios, sinDato };
}
