import {
  buildPlayerReport,
  cohortOf,
  detectCoreColumns,
  headersOf,
  positionColumnOf,
  temporadasDeFila,
  type DataRow,
  numeric,
  type CellValue,
} from "./scouting.ts";
import { PUNTOS_POR_RATING_INDICE, indiceANivel, nivelDeLiga, ratingDeTramos, type EntradaOpta } from "./nivelDeLiga.ts";
import { playerPassports } from "./similarity.ts";
import { encogerHaciaLaMedia } from "./cobertura.ts";

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
  /** El índice corregido por cobertura: es el que ordena la lista. */
  puntuacion: number;
  /** El índice tal cual sale del informe, sin corregir: con `porLiga`, dentro de su liga. */
  puntuacionCruda: number;
  /**
   * Con `nivel`: el índice llevado a la liga de referencia, que es lo que
   * ordena. null si su liga no tiene rating (NCAA, un Excel de Wyscout) o si
   * no se le pudo medir dentro de su liga: entonces ordena el crudo y la
   * pantalla lo marca.
   */
  aNivel: number | null;
  /** Con cuántas métricas se calculó, que es lo que sostiene el número. */
  metricas: number;
  destacadas: Array<{ label: string; percentile: number }>;
  /** Todos sus pasaportes, no solo el primero: un canadiense con doble
   *  nacionalidad tiene que aparecer al filtrar por Canadá. */
  pasaportes: string[];
};

/** Una celda como número; vacía o sin número, NaN (no 0: un hueco no es un cero). */
const numero = (value: unknown) => numeric(value as CellValue);

export type OpcionesDeRanking = {
  /** Medir a cada uno contra los de su puesto en su liga y temporada (claves de origenPorFila). */
  porLiga?: { clavesPorFila: string[][] };
  /**
   * Llevar cada índice a la liga de referencia con el nivel de Opta. Solo
   * tiene sentido junto con `porLiga`: medido contra la mezcla de todas, el
   * índice ya lleva una parte del nivel dentro.
   */
  nivel?: { feed: EntradaOpta[] | null; referencia: string };
};

export function rankingDeCohorte(rows: DataRow[], perfil: string, minutosMin: number, opciones: OpcionesDeRanking = {}): FilaRanking[] {
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
  const referencia = opciones.porLiga && opciones.nivel ? nivelDeLiga(opciones.nivel.feed, opciones.nivel.referencia) : null;
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

    const informe = buildPlayerReport(rows, indice, minutosMin, cohorteDelInforme, null, opciones.porLiga ? { porLiga: opciones.porLiga } : {});
    if (!informe || informe.metrics.length < 4) continue;
    let aNivel: number | null = null;
    if (referencia && informe.frente?.modo === "liga") {
      const tramos = temporadasDeFila(fila).flatMap((temporada) => temporada.ligas.map((liga) => ({ liga, minutos: temporada.minutos / temporada.ligas.length })));
      const rating = ratingDeTramos(tramos, opciones.nivel?.feed);
      if (rating !== null) aNivel = indiceANivel(informe.indice, rating, referencia.rating, PUNTOS_POR_RATING_INDICE);
    }
    salida.push({
      indice,
      jugador: informe.player,
      equipo: informe.team,
      edad: numero(fila.Age),
      minutos: Number.isFinite(minutos) ? minutos : 0,
      puntuacion: aNivel ?? informe.indice,
      puntuacionCruda: informe.indice,
      aNivel,
      // Las que sostienen el índice, no las que se dibujan: es lo que mide
      // la evidencia detrás del número y lo que corrige encogerHaciaLaMedia.
      metricas: informe.metricasDelIndice,
      destacadas: informe.metrics
        .filter((metrica) => metrica.percentile >= 85)
        .sort((a, b) => b.percentile - a.percentile)
        .slice(0, 3),
      pasaportes: playerPassports(informe.passport),
    });
  }
  /*
   * Corrección por cobertura, la misma que usa el buscador entre ligas.
   *
   * En un ranking con todas las ligas cargadas conviven jugadores medidos con
   * diecisiete métricas y con siete, según su liga tenga o no la capa de
   * SkillCorner. Tener menos no sube la nota —la correlación es de 0,1— pero
   * la vuelve más inestable, y como esta lista se lee por arriba, los
   * inestables asoman en la cima más de lo que les toca: en porteros ocupaban
   * el 90% del top-20 siendo el 80% de la base.
   *
   * Se ordena por el número corregido y se conserva el crudo, porque el ajuste
   * comprime el rango y sin el original se pierde la escala a la que uno está
   * acostumbrado.
   */
  const ajustados = encogerHaciaLaMedia(salida.map((f) => f.puntuacion), salida.map((f) => f.metricas));
  return salida
    .map((fila, i) => ({ ...fila, puntuacion: Math.round(ajustados[i]) }))
    .sort((a, b) => b.puntuacion - a.puntuacion || b.metricas - a.metricas);
}

// ---- Candidatos para un equipo ----------------------------------------------------------

export type Candidato = FilaRanking & {
  /**
   * Cuánto mejora al titular del equipo en el puesto, en puntos de índice y al
   * mismo nivel de liga (los dos llevados a la liga de referencia con Opta, o
   * los dos sin llevar si no hay nivel). null si el equipo no tiene a nadie en
   * el puesto con minutos.
   */
  mejora: number | null;
  /** El margen de esa diferencia por los minutos de los dos (raíz de la suma de cuadrados). */
  margen: number | null;
  /** La mejora supera su margen: no es ruido de muestra. */
  clara: boolean;
};

/** El índice con el que se compara: a nivel de la liga de referencia si lo hay; si no, dentro de su liga. */
export const nivelDeFila = (fila: FilaRanking) => fila.aNivel ?? fila.puntuacionCruda;

/**
 * Los candidatos para un equipo en un puesto, ordenados por cuánto mejoran
 * a su titular.
 *
 * El mejor jugador en abstracto no es el mejor fichaje: lo que importa es la
 * diferencia con lo que ya hay. El titular es el del equipo con más minutos
 * en ese puesto; la mejora es la diferencia de índices a un mismo nivel de
 * liga (con la regla aditiva de Opta, la diferencia no depende de qué liga se
 * tome de referencia). Y se dice si supera el margen de los minutos de los dos:
 * +5 con 600′ no se distingue de cero.
 *
 * El encaje de estilo NO entra en el orden. Validado el 15 de octubre de 2026
 * con los jugadores que cambiaron de club entre 2025 y 2026 en doce ligas
 * (252 con 900′ o más en las dos temporadas; 379 con 600′): sobre el modelo
 * de contracción más nivel de liga, el encaje entre el club de origen y el de
 * destino no predice el índice del año siguiente —efecto de 0,04 puntos por
 * punto de encaje, IC 95 % de −0,02 a 0,12; el error en validación cruzada
 * empeora un poco con él (8,66 frente a 8,60)—. Con encaje de 80 o más hay
 * un indicio a favor (+7 de residuo), pero con doce jugadores no sostiene
 * nada. Se enseña para decidir, no para ordenar; vale repetirlo con más
 * temporadas.
 */
export function candidatosParaEquipo(
  filas: FilaRanking[],
  esDelEquipo: (fila: FilaRanking) => boolean,
  margen: (minutos: number) => number | null,
) {
  const plantilla = filas.filter(esDelEquipo).sort((a, b) => b.minutos - a.minutos);
  const titular = plantilla[0] ?? null;
  const candidatos: Candidato[] = filas.filter((fila) => !esDelEquipo(fila)).map((fila) => {
    const mejora = titular ? nivelDeFila(fila) - nivelDeFila(titular) : null;
    const mc = margen(fila.minutos);
    const mt = titular ? margen(titular.minutos) : null;
    const m = mc !== null && mt !== null ? Math.round(Math.sqrt(mc ** 2 + mt ** 2)) : null;
    return { ...fila, mejora, margen: m, clara: mejora !== null && m !== null && mejora > m };
  }).sort((a, b) => (b.mejora ?? -Infinity) - (a.mejora ?? -Infinity) || nivelDeFila(b) - nivelDeFila(a) || b.minutos - a.minutos);
  return { titular, plantilla, candidatos };
}

/**
 * Los que nadie supera a la vez en todo: el frente de Pareto. Sirve para una
 * lista corta sin tener que decidir cuánto vale cada eje frente a los demás
 * (rendimiento, encaje, edad...): fuera queda solo quien tiene a otro igual o
 * mejor en todos los ejes y mejor en alguno. Un eje sin dato (NaN) no cuenta
 * para nadie.
 */
export function frenteDePareto<T>(items: T[], ejes: Array<(item: T) => number>): Set<T> {
  const valores = items.map((item) => ejes.map((eje) => eje(item)));
  const frente = new Set<T>();
  items.forEach((item, i) => {
    const vi = valores[i];
    const dominado = valores.some((vj, j) => {
      if (j === i) return false;
      let alMenosIgual = true;
      let mejorEnAlguno = false;
      for (let k = 0; k < vi.length; k += 1) {
        const a = Number.isFinite(vj[k]) ? vj[k] : -Infinity;
        const b = Number.isFinite(vi[k]) ? vi[k] : -Infinity;
        if (a < b) { alMenosIgual = false; break; }
        if (a > b) mejorEnAlguno = true;
      }
      return alMenosIgual && mejorEnAlguno;
    });
    if (!dominado) frente.add(item);
  });
  return frente;
}
