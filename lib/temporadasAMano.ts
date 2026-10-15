/**
 * Temporadas anteriores añadidas a mano.
 *
 * Cuando la temporada anterior de un jugador no está en ninguna base —jugó en
 * una liga que no tenemos, o en otro país—, se puede añadir igual: escrita a
 * mano o sacada de su fila en un Excel de Wyscout. Son solo sus números de
 * temporada (club, partidos, minutos, goles, asistencias): no traen métricas,
 * así que la ficha las enseña en la franja de temporadas pero el radar y el
 * índice no las cuentan, y se dice.
 *
 * Se guardan por jugador (nombre y fecha de nacimiento) en este navegador.
 */

import { anioDeInicio } from "./temporadas.ts";
import { extractSeason, numeric, type DataRow, type TemporadaDeJugador } from "./scouting.ts";
import { temporadaValida } from "./nombresDeBase.ts";
import { t, tf } from "./i18n.ts";

export type TemporadaAMano = {
  id: string;
  /** "2024" o "2024/2025". */
  etiqueta: string;
  liga: string;
  equipo: string;
  partidos: number;
  minutos: number;
  /** NaN si no se sabe. */
  goles: number;
  asistencias: number;
  /** De dónde salen los números. */
  origen: "mano" | "wyscout";
};

export type DatosDeTemporada = Omit<TemporadaAMano, "id">;

export const CLAVE_TEMPORADAS_A_MANO = "fos-scout-temporadas-a-mano-v1";

/** Quién es el jugador, para guardar sus temporadas: el mismo criterio que el resto de la ficha. */
export function claveDeJugador(nombre: string, nacimiento: string) {
  return `${nombre.trim()}|${nacimiento.trim()}`;
}

const limpiarTemporada = (texto: string) => texto.trim().replace(/\s+/g, "");

export function nuevaTemporadaAMano(datos: DatosDeTemporada): TemporadaAMano {
  const etiqueta = limpiarTemporada(datos.etiqueta);
  const liga = datos.liga.trim().replace(/\s+/g, " ");
  const equipo = datos.equipo.trim().replace(/\s+/g, " ");
  return { ...datos, etiqueta, liga, equipo, id: `${etiqueta}|${liga}|${equipo}`.toLowerCase() };
}

/** Qué falta o qué está mal, en una frase; "" si se puede guardar. */
export function errorDeTemporadaAMano(datos: DatosDeTemporada, inicioDeReferencia: number): string {
  const etiqueta = limpiarTemporada(datos.etiqueta);
  if (!datos.liga.trim()) return t("Escribe la liga.");
  if (!etiqueta || !temporadaValida(etiqueta)) return t("La temporada se escribe 2026 o 2025/2026.");
  if (inicioDeReferencia && anioDeInicio(etiqueta) >= inicioDeReferencia) {
    return tf("Tiene que ser anterior a la temporada que se mira ({anio}).", { anio: inicioDeReferencia });
  }
  if (!datos.equipo.trim()) return t("Escribe el equipo.");
  if (!Number.isFinite(datos.minutos) || datos.minutos < 0) return t("Escribe los minutos jugados.");
  if (!Number.isFinite(datos.partidos) || datos.partidos < 0) return t("Escribe los partidos jugados.");
  return "";
}

/** Como una temporada de las bases, para la franja de la ficha. */
export function aTemporadaDeJugador(temporada: TemporadaAMano): TemporadaDeJugador & { aMano: TemporadaAMano } {
  return {
    etiqueta: temporada.etiqueta,
    anio: extractSeason(temporada.etiqueta),
    ligas: [temporada.liga],
    equipo: temporada.equipo,
    equipoPorLiga: { [temporada.liga]: temporada.equipo },
    partidos: temporada.partidos,
    minutos: temporada.minutos,
    goles: temporada.goles,
    asistencias: temporada.asistencias,
    aMano: temporada,
  };
}

/** Las de un jugador más viejas que la temporada que se mira, de la más reciente a la más vieja. */
export function anterioresAMano(lista: TemporadaAMano[], inicioDeReferencia: number) {
  return lista
    .filter((temporada) => !inicioDeReferencia || anioDeInicio(temporada.etiqueta) < inicioDeReferencia)
    .sort((a, b) => anioDeInicio(b.etiqueta) - anioDeInicio(a.etiqueta) || a.liga.localeCompare(b.liga));
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Cuánto se parece el nombre de una fila de Wyscout al del jugador. Wyscout
 * suele escribir la inicial y el apellido ("A. Hammer Kjelsen"), así que el
 * apellido pesa más que el nombre entero.
 */
export function parecidoDeNombre(deLaFila: string, delJugador: string) {
  const a = normalizar(deLaFila);
  const b = normalizar(delJugador);
  if (!a || !b) return 0;
  if (a === b) return 4;
  const deA = a.split(" ");
  const deB = b.split(" ");
  const apellidoA = deA[deA.length - 1];
  const apellidoB = deB[deB.length - 1];
  const inicialCoincide = deA[0][0] === deB[0][0];
  if (apellidoA === apellidoB) return inicialCoincide ? 3 : 2;
  return deA.some((parte) => parte.length >= 4 && deB.includes(parte)) ? 1 : 0;
}

/** Los números de temporada de una fila de Wyscout. */
export function datosDeFilaWyscout(fila: DataRow, liga: string, etiqueta: string): DatosDeTemporada {
  const numero = (columna: string) => numeric(fila[columna]);
  return {
    etiqueta,
    liga,
    equipo: String(fila["Team within selected timeframe"] ?? fila.Team ?? "").trim(),
    partidos: numero("Matches played"),
    minutos: numero("Minutes played"),
    goles: numero("Goals"),
    asistencias: numero("Assists"),
    origen: "wyscout",
  };
}
