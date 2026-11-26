import type { TemporadaDeJugador } from "./scouting.ts";
import { numberLocale } from "./i18n.ts";

/** "+0,96" / "−0,32": con signo y la coma del idioma. */
export const conSigno = (valor: number, decimales = 2) =>
  `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toLocaleString(numberLocale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

/**
 * La fuerza del club de un jugador, y cuánto pesa en su índice.
 *
 * La fuerza es la diferencia de xG sin penaltis por partido de su equipo en
 * esa temporada (a favor menos en contra), de StatsBomb. En una liga cerrada
 * la media de todos los equipos es ~0, así que el número ya está centrado:
 * +0,8 es un equipo que domina, −0,6 uno que sufre.
 *
 * Cuánto pesa, medido y no supuesto (noviembre 2026, 14 ligas con dos
 * temporadas seguidas): el mismo jugador, en la misma liga y el mismo puesto,
 * con ≥900′ las dos temporadas. Entre los 248 que cambiaron de club, cada
 * +1,0 de xGD por partido de su equipo le subió el índice 3,6 puntos
 * (t = 2,3; con los 1.198 pares, 5,2 y t = 6,2, pero ahí el equipo también
 * mejora porque mejora él). El corte transversal da 10, inflado porque los
 * buenos acaban en los buenos equipos: no se usa. Es un efecto moderado —entre
 * el mejor y el peor club de una liga hay unos ±3 puntos, y el ruido de una
 * temporada a otra es de 12—, pero existe: un lateral de un equipo que
 * domina sale mejor de lo que es, y uno de un equipo que sufre, peor.
 *
 * Se usa el coeficiente prudente, el de los que cambiaron de club.
 */
export const PUNTOS_POR_XGD = 3.6;

export type FuerzaDeClub = {
  /** xG sin penaltis a favor menos en contra, por partido. */
  xgd: number;
  /** Su puesto por esa diferencia en su liga y temporada (1 = el más fuerte). */
  puesto: number;
  equipos: number;
};

type FilaDeEquipo = { team_name?: unknown; team_season_np_xg_pg?: unknown; team_season_np_xg_conceded_pg?: unknown };

const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : Number.NaN);

/** La fuerza de cada equipo de una liga y temporada, por su nombre. */
export function fuerzasDeLiga(filas: FilaDeEquipo[]): Map<string, FuerzaDeClub> {
  const conDato = filas
    .map((fila) => ({ nombre: String(fila.team_name ?? ""), xgd: numero(fila.team_season_np_xg_pg) - numero(fila.team_season_np_xg_conceded_pg) }))
    .filter((equipo) => equipo.nombre && Number.isFinite(equipo.xgd))
    .sort((a, b) => b.xgd - a.xgd);
  return new Map(conDato.map((equipo, i) => [equipo.nombre, { xgd: equipo.xgd, puesto: i + 1, equipos: conDato.length }]));
}

/** Cuánto se le resta (o suma) al índice por la fuerza de su club. */
export const ajustePorClub = (xgd: number) => -PUNTOS_POR_XGD * xgd;

export type FuerzaDelJugador = {
  /** La de sus clubes en las temporadas medidas, ponderada por minutos. */
  xgd: number;
  ajuste: number;
  /** Club por club, para decirlo. */
  clubes: Array<{ equipo: string; liga: string; temporada: string; minutos: number } & FuerzaDeClub>;
};

/**
 * La fuerza de los clubes de un jugador en las temporadas que se miden,
 * ponderada por sus minutos en cada una. Con dos ligas en una temporada se
 * reparte por igual (la base no dice cuántos minutos jugó en cada una). Null
 * si no hay datos de equipo de ninguna (un Excel de Wyscout, una liga sin
 * estadísticas de equipo).
 */
export function fuerzaDelJugador(
  temporadas: TemporadaDeJugador[],
  fuerzaDe: (liga: string, temporada: string, equipo: string) => FuerzaDeClub | null,
): FuerzaDelJugador | null {
  const clubes: FuerzaDelJugador["clubes"] = [];
  for (const temporada of temporadas) {
    const ligas = temporada.ligas.length ? temporada.ligas : [""];
    for (const liga of ligas) {
      const equipo = temporada.equipoPorLiga[liga] || temporada.equipo;
      const fuerza = fuerzaDe(liga, temporada.etiqueta, equipo);
      if (fuerza) clubes.push({ equipo, liga, temporada: temporada.etiqueta, minutos: temporada.minutos / ligas.length, ...fuerza });
    }
  }
  const minutos = clubes.reduce((suma, club) => suma + club.minutos, 0);
  if (!clubes.length) return null;
  const xgd = minutos > 0
    ? clubes.reduce((suma, club) => suma + club.xgd * club.minutos, 0) / minutos
    : clubes.reduce((suma, club) => suma + club.xgd, 0) / clubes.length;
  return { xgd, ajuste: ajustePorClub(xgd), clubes };
}
