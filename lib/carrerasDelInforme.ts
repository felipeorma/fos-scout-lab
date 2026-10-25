import { casarPlantilla } from "./plantilla.ts";
import { mismoEquipo } from "./estiloEquipo.ts";

/**
 * Carreras como hoja del informe: lo que hace falta para que siga al jugador
 * elegido, como la Ficha y radar y la Ficha ampliada, en vez de abrirse en la
 * liga y el equipo que tocara.
 *
 * SkillCorner nombra a su manera las competiciones, los clubes y los
 * jugadores; aquí se buscan los suyos a partir de los de la base.
 */

/** El jugador del informe, en la temporada que se mira. */
export type JugadorDelInforme = {
  jugador: string;
  /** Su club en esa temporada. */
  equipo: string;
  /** Las ligas de esa temporada (puede haber jugado dos). */
  ligas: string[];
  /** El año de la temporada; null si el archivo no lo dice. */
  anio: number | null;
};

type Edicion = { id?: number; name?: string; season?: string };

const comparable = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * La edición de SkillCorner de su liga y su temporada, o null si SkillCorner
 * no la tiene. El nombre tiene que coincidir entero: "Premier League" no es la
 * "Canadian Premier League". Sin año no se adivina la temporada.
 */
export function edicionDelInforme<T extends Edicion>(ediciones: T[], informe: JugadorDelInforme): T | null {
  if (!informe.anio) return null;
  for (const liga of informe.ligas) {
    const buscada = comparable(liga);
    const encontrada = ediciones.find((edicion) => comparable(edicion.name ?? "") === buscada
      && String(edicion.season ?? "").includes(String(informe.anio)));
    if (encontrada) return encontrada;
  }
  return null;
}

/** Su club en la lista de SkillCorner ("Cavalry" frente a "Cavalry FC"). */
export function equipoDelInforme(equipos: string[], informe: JugadorDelInforme): string | null {
  return equipos.find((nombre) => nombre === informe.equipo)
    ?? equipos.find((nombre) => mismoEquipo(nombre, informe.equipo))
    ?? null;
}

/**
 * Su nombre entre los que tienen carreras: con el mismo emparejamiento que
 * el plantel, así que "S. Young" casa con "Sean Young" si es el único Young
 * del club con esa inicial.
 */
export function jugadorEnCarreras(nombres: string[], informe: JugadorDelInforme): string | null {
  const plantilla = casarPlantilla([{ Player: informe.jugador, Team: informe.equipo }], informe.equipo, nombres);
  return nombres.find((nombre) => plantilla.indice(nombre) === 0) ?? null;
}
