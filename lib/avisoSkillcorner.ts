/**
 * Qué dice SkillCorner de la liga y temporada de un jugador.
 *
 * Dos huecos que antes no se veían y parecían un fallo de la ficha:
 *  - la suscripción no trae esa liga en esa temporada (USL Championship
 *    2026: SkillCorner llega hasta 2025), así que nadie de ella tiene físicos
 *    ni desmarques;
 *  - la trae, pero solo con los físicos: el "game intelligence" (desmarques,
 *    juego bajo presión, presión sin balón) solo viene en CPL y MLS Next Pro
 *    2026. Ahí el radar va sin esas métricas.
 *
 * Además, de qué temporadas son los físicos que sí trae la fila: un jugador
 * que cambió de liga puede llevar los de la anterior.
 */

import { tf } from "./i18n.ts";
import { ligaYAnioDe } from "./procedencia.ts";
import type { SourceDataset } from "./scouting.ts";

/** Las columnas de game intelligence: si ninguna fila de la base las trae, la liga solo tiene físicos. */
const DE_JUEGO = ["Runs in behind P30 (SC)", "Off ball runs P30 (SC)", "Retention under pressure % (SC)", "Receptions under pressure P30 (SC)"];

export type AvisoSkillcorner = {
  tipo: "sin_liga" | "solo_fisico";
  liga: string;
  temporada: string;
  /** Las bases de SkillCorner de otras temporadas que sí trae su fila ("USL Championship 2025"). */
  fisicosDe: string[];
};

const normal = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const conDato = (valor: unknown) => valor !== undefined && valor !== null && valor !== "" && Number.isFinite(Number(valor));

/**
 * `ligas` y `temporada`: las de la temporada que se mira ("USL Championship",
 * "2026"). `fuentes`: la columna "Data sources" de su fila. Null si no hay
 * nada que avisar o si la liga no viene de una plataforma (un Excel de
 * Wyscout no tiene capa de SkillCorner que buscar).
 */
export function avisoSkillcorner(datasets: SourceDataset[], ligas: string[], temporada: string, fuentes: string): AvisoSkillcorner | null {
  const deLaTemporada = (dataset: SourceDataset, liga: string) => {
    const leida = ligaYAnioDe(dataset.fileName);
    return normal(leida.liga) === normal(liga) && leida.temporada === temporada.replace(/\s+/g, "");
  };
  for (const liga of ligas) {
    const statsbomb = datasets.find((dataset) => dataset.provider === "statsbomb" && deLaTemporada(dataset, liga));
    if (!statsbomb) continue;
    const skillcorner = datasets.find((dataset) => dataset.provider === "skillcorner" && deLaTemporada(dataset, liga));
    const fisicosDe = String(fuentes ?? "").split(",").map((fuente) => fuente.trim())
      .filter((fuente) => /^SkillCorner\s*·/i.test(fuente))
      .map((fuente) => fuente.replace(/^SkillCorner\s*·\s*/i, ""))
      .filter((fuente) => {
        const leida = ligaYAnioDe(fuente);
        return !(normal(leida.liga) === normal(liga) && leida.temporada === temporada.replace(/\s+/g, ""));
      });
    if (!skillcorner) return { tipo: "sin_liga", liga, temporada, fisicosDe };
    const traeJuego = skillcorner.rows.some((fila) => DE_JUEGO.some((columna) => conDato(fila[columna])));
    if (!traeJuego) return { tipo: "solo_fisico", liga, temporada, fisicosDe };
  }
  return null;
}

/** El aviso en una frase, para la ficha y la ficha ampliada. */
export function textoDeAvisoSkillcorner(aviso: AvisoSkillcorner): string {
  const cual = `${aviso.liga} ${aviso.temporada}`;
  const otros = aviso.fisicosDe.length ? ` ${tf("Los físicos que sí trae son de {fuentes}.", { fuentes: aviso.fisicosDe.join(", ") })}` : "";
  return aviso.tipo === "sin_liga"
    ? `${tf("SkillCorner no publica {liga} en tu suscripción: sin datos físicos ni de desmarques en esta temporada.", { liga: cual })}${otros}`
    : `${tf("SkillCorner solo publica los físicos de {liga}: sin desmarques, juego bajo presión ni presión sin balón, y el radar va sin esas métricas.", { liga: cual })}${otros}`;
}
