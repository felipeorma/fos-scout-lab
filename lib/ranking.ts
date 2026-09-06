import {
  buildPlayerReport,
  cohortOf,
  detectCoreColumns,
  headersOf,
  positionColumnOf,
  type DataRow,
} from "./scouting.ts";
import { playerPassports } from "./similarity.ts";

/**
 * El ranking de una cohorte: quién encabeza un puesto en la base cargada.
 *
 * Vive en lib y no dentro de la pantalla porque es la parte que se puede
 * equivocar sin que se note —el orden de una lista larga nadie lo audita a
 * ojo— y así se prueba sin montar React.
 */

export type FilaRanking = {
  indice: number;
  jugador: string;
  equipo: string;
  edad: number;
  minutos: number;
  puntuacion: number;
  destacadas: Array<{ label: string; percentile: number }>;
  /** Todos sus pasaportes, no solo el primero: un canadiense con doble
   *  nacionalidad tiene que aparecer al filtrar por Canadá. */
  pasaportes: string[];
};

function numero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function rankingDeCohorte(rows: DataRow[], perfil: string, minutosMin: number): FilaRanking[] {
  const salida: FilaRanking[] = [];
  const cabeceras = headersOf(rows);
  const core = detectCoreColumns(cabeceras);
  const columnaPosicion = positionColumnOf(cabeceras);

  /*
   * "Extremos directos" no sale nunca de la detección automática: es una lente
   * de lectura, no un puesto que ninguna base escriba. Buscándolo con la
   * cohorte detectada, la opción devolvía siempre cero jugadores. Se buscan
   * entre los extremos y se puntúan con su propio set de métricas, comparados
   * contra los extremos, que es lo que hace `peerCohort` con DWING.
   */
  const cohorteBuscada = perfil === "DWING" ? "WING" : perfil;
  const cohorteDelInforme = perfil === "DWING" ? "DWING" : "AUTO";

  for (let indice = 0; indice < rows.length; indice += 1) {
    const fila = rows[indice];
    /*
     * Descartar ANTES de construir el informe. Antes se le calculaba el
     * informe completo a los siete mil jugadores de la base y se tiraban nueve
     * de cada diez por posición: con todas las ligas cargadas, cambiar de
     * puesto congelaba la pestaña dieciséis segundos. La cohorte de una fila
     * se sabe leyendo su posición, que es exactamente lo que hace
     * `buildPlayerReport` cuando no se le fuerza ninguna, así que sale lo
     * mismo por mucho menos.
     */
    if (cohortOf(columnaPosicion ? fila[columnaPosicion] : "") !== cohorteBuscada) continue;
    const minutos = numero(fila[core.minutes]);
    if (Number.isFinite(minutos) && minutosMin > 0 && minutos < minutosMin) continue;

    const informe = buildPlayerReport(rows, indice, minutosMin, cohorteDelInforme);
    if (!informe || informe.metrics.length < 4) continue;
    salida.push({
      indice,
      jugador: informe.player,
      equipo: informe.team,
      edad: numero(fila.Age),
      minutos: Number.isFinite(minutos) ? minutos : 0,
      puntuacion: informe.indice,
      destacadas: informe.metrics
        .filter((metrica) => metrica.percentile >= 85)
        .sort((a, b) => b.percentile - a.percentile)
        .slice(0, 3),
      pasaportes: playerPassports(informe.passport),
    });
  }
  return salida.sort((a, b) => b.puntuacion - a.puntuacion);
}
