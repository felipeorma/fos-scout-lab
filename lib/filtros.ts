import { cohortOf, detectCoreColumns, headersOf, positionColumnOf, type DataRow } from "./scouting.ts";
import { playerPassports } from "./similarity.ts";

/**
 * La red de filtros: qué se guarda de cada jugador y quién pasa.
 *
 * Vive aquí y no dentro del hook que la reparte porque dentro no se podía
 * probar, y eso salió caro: al montarla, los filtros dejaron de aplicarse en
 * el ranking por unas dependencias que faltaban en un memo, y no se descubrió
 * hasta mirarlo en el navegador. Una prueba de tres líneas lo habría dicho.
 *
 * La regla que ordena el conjunto: estos filtros acotan a QUIÉN ves, nunca
 * CÓMO se le mide. El mínimo de minutos es la excepción y no está aquí: entra
 * en el grupo de referencia, así que lo aplica cada pantalla al construir su
 * informe, no este predicado.
 */

export type FiltrosGlobales = {
  /** "TODAS" o el nombre de la liga. */
  liga: string;
  /** 0 = todos los años. */
  anio: number;
  /** "TODOS" o el nombre del club. */
  equipo: string;
  /** "TODOS" o el pasaporte; cuenta también el secundario. */
  pasaporte: string;
  /** "" = sin filtrar por puesto; si no, la cohorte (CB, WING…). */
  puesto: string;
  /** Entra en el grupo de referencia, no solo en la vista. */
  minutosMin: number;
  /** 0 = sin tope. */
  edadMax: number;
};

export const FILTROS_VACIOS: FiltrosGlobales = {
  liga: "TODAS",
  anio: 0,
  equipo: "TODOS",
  pasaporte: "TODOS",
  puesto: "",
  minutosMin: 500,
  edadMax: 0,
};

/** Lo que hace falta de cada fila para decidir, ya extraído y normalizado. */
export type ResumenDeFila = {
  equipo: string;
  /** En minúsculas: el desplegable ofrece la grafía original y aquí se compara. */
  pasaportes: string[];
  puesto: string;
  edad: number;
};

/**
 * La edad de una celda, o NaN si no la hay.
 *
 * `Number("")` vale CERO y es finito, así que sin esto un jugador sin edad
 * pasaba como si tuviera cero años y colaba en cualquier búsqueda de sub-23.
 * Es el mismo cuidado que ya tenía el motor al comparar identidades, y que
 * aquí faltaba: lo encontró la primera prueba que se escribió de esto.
 */
function edadDeCelda(valor: unknown): number {
  const texto = String(valor ?? "").trim();
  if (!texto) return Number.NaN;
  const numero = Number(texto.replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : Number.NaN;
}

/**
 * Prepara las filas una vez.
 *
 * Sin esto, cada comprobación volvería a leer la fila entera y a partir la
 * lista de pasaportes: con siete mil jugadores y siete filtros, eso es medio
 * millón de operaciones por tecla pulsada.
 */
export function resumirFilas(rows: DataRow[]): ResumenDeFila[] {
  const headers = headersOf(rows);
  const columnaPuesto = positionColumnOf(headers);
  void detectCoreColumns(headers);
  return rows.map((fila) => ({
    equipo: String(fila.Team ?? "").trim(),
    pasaportes: playerPassports(fila["Passport country"]).map((x) => x.trim().toLowerCase()),
    puesto: cohortOf(columnaPuesto ? fila[columnaPuesto] : ""),
    edad: edadDeCelda(fila.Age),
  }));
}

/** La procedencia de una fila: de qué ligas y años viene. */
export type OrigenDeFila = { ligas: string[]; anios: number[] };

/**
 * Solo los filtros que describen al JUGADOR, no dónde juega.
 *
 * Está aparte porque la pantalla de carreras no puede usar el resto: trabaja
 * contra la API por competición y equipo, así que la liga y el club ya los
 * decide ella y preguntárselos otra vez a la barra sería mandar dos veces la
 * misma cosa, con dos respuestas posibles. El puesto, el pasaporte y la edad
 * sí los puede honrar, en cuanto sabe qué fila de la base es cada nombre.
 */
export function pasaLosFiltrosDeJugador(fila: ResumenDeFila | undefined, filtros: FiltrosGlobales): boolean {
  if (!fila) return false;
  if (filtros.puesto && fila.puesto !== filtros.puesto) return false;
  if (filtros.pasaporte !== "TODOS" && !fila.pasaportes.includes(filtros.pasaporte.toLowerCase())) return false;
  // Sin edad conocida no se puede afirmar que cumpla un tope de edad, así que
  // queda fuera: es más honesto perder a uno que colar a un veterano.
  if (filtros.edadMax > 0 && !(Number.isFinite(fila.edad) && fila.edad <= filtros.edadMax)) return false;
  return true;
}

/** Cuántos de los de jugador están puestos. Sirve para decidir si un nombre
 *  sin ficha en la base se muestra o se calla. */
export function cuantosFiltrosDeJugador(filtros: FiltrosGlobales): number {
  return (filtros.puesto ? 1 : 0)
    + (filtros.pasaporte !== "TODOS" ? 1 : 0)
    + (filtros.edadMax > 0 ? 1 : 0);
}

/**
 * ¿Pasa esta fila los filtros de mercado?
 *
 * Un jugador con dos ligas —traspaso dentro del año, o subida desde el
 * filial— pasa el filtro de liga si CUALQUIERA de las suyas coincide: sigue
 * siendo un jugador de esa competición aunque no sea el único sitio donde
 * jugó.
 */
export function pasaLosFiltros(
  fila: ResumenDeFila | undefined,
  origen: OrigenDeFila | undefined,
  filtros: FiltrosGlobales,
): boolean {
  if (!fila) return false;
  if (filtros.equipo !== "TODOS" && fila.equipo !== filtros.equipo) return false;
  if (!pasaLosFiltrosDeJugador(fila, filtros)) return false;
  if (filtros.liga !== "TODAS" || filtros.anio) {
    if (!origen) return false;
    if (filtros.liga !== "TODAS" && !origen.ligas.includes(filtros.liga)) return false;
    if (filtros.anio && !origen.anios.includes(filtros.anio)) return false;
  }
  return true;
}

/** Cuántos filtros de mercado están puestos, para poder decirlo y quitarlos. */
export function cuantosFiltrosActivos(filtros: FiltrosGlobales): number {
  return (filtros.liga !== "TODAS" ? 1 : 0)
    + (filtros.anio ? 1 : 0)
    + (filtros.equipo !== "TODOS" ? 1 : 0)
    + (filtros.pasaporte !== "TODOS" ? 1 : 0)
    + (filtros.puesto ? 1 : 0)
    + (filtros.edadMax > 0 ? 1 : 0);
}
