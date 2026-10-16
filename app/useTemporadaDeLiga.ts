"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  fetchFormaDeLiga,
  fetchSkillcornerCompetitions,
  fetchSkillcornerTeamStats,
  fetchStatsbombCompetitions,
  fetchStatsbombDataset,
  fetchStatsbombTeamStats,
  type ApiCompetition,
} from "@/lib/remoteData";
import { fusionarSkillcorner, type FilaEquipo } from "@/lib/estiloEquipo";
import { aggregateDatasets, buildPlayerReport, numeric, type CellValue } from "@/lib/scouting";
import type { LigaForma } from "@/lib/fases";

/*
 * Lo que necesita Estilo de juego de CUALQUIER liga y temporada de StatsBomb,
 * no solo de las cargadas: el catálogo, las estadísticas de sus equipos, la
 * forma partido a partido y el plantel con su índice. Cada cosa se pide una
 * vez por sesión y se reparte entre quien la pida (los dos lados de un
 * partido pueden ser la misma liga).
 */

const guardados = new Map<string, unknown>();
const enCamino = new Map<string, Promise<unknown>>();

function mensajeDeFallo(fallo: unknown) {
  return fallo instanceof TypeError
    ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
    : fallo instanceof Error ? fallo.message : String(fallo);
}

/** Un recurso por clave, pedido una vez y compartido. Sin clave, nada. */
export function useRecurso<T>(clave: string | null, cargar: () => Promise<T>) {
  const [estado, setEstado] = useState<{ clave: string; datos?: T; error?: string }>({ clave: "" });
  const guardado = clave ? guardados.get(clave) as T | undefined : undefined;
  useEffect(() => {
    if (!clave || guardados.has(clave)) return;
    let vivo = true;
    let promesa = enCamino.get(clave) as Promise<T> | undefined;
    if (!promesa) {
      promesa = cargar()
        .then((datos) => { guardados.set(clave, datos); return datos; })
        .finally(() => enCamino.delete(clave));
      enCamino.set(clave, promesa);
    }
    promesa
      .then((datos) => { if (vivo) setEstado({ clave, datos }); })
      .catch((fallo) => { if (vivo) setEstado({ clave, error: mensajeDeFallo(fallo) }); });
    return () => { vivo = false; };
    // La clave identifica lo que se carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const vigente = estado.clave === clave ? estado : null;
  return { datos: guardado ?? vigente?.datos ?? null, error: guardado ? "" : vigente?.error ?? "", cargando: Boolean(clave) && !guardado && !vigente };
}

/** El catálogo de StatsBomb: todas las ligas y temporadas con partidos. */
export function useCatalogo() {
  return useRecurso<ApiCompetition[]>("catalogo-sb", async () => (await fetchStatsbombCompetitions()).filter((c) => c.hasMatches !== false));
}

const sinTildes = (valor: unknown) => String(valor ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Las estadísticas de temporada de los equipos de una liga, con SkillCorner encima si existe esa liga y temporada. */
export function useEquiposDeTemporada(competicion: ApiCompetition | null) {
  const clave = competicion ? `equipos:${competicion.competition_id}:${competicion.season_id}` : null;
  return useRecurso<FilaEquipo[]>(clave, async () => {
    const filas = await fetchStatsbombTeamStats(competicion!);
    try {
      const catalogoSc = await fetchSkillcornerCompetitions();
      const hermana = catalogoSc.find((edicion) => sinTildes(edicion.name) === sinTildes(competicion!.name) && String(edicion.season ?? "") === String(competicion!.season ?? ""));
      return hermana && filas.length ? fusionarSkillcorner(filas, await fetchSkillcornerTeamStats(hermana)) : filas;
    } catch {
      return filas;
    }
  });
}

/** La forma de cada equipo en cada partido de una liga y temporada. */
export function useFormaDeLiga(competicion: number | null, temporada: number | null) {
  const clave = competicion !== null && temporada !== null ? `forma:${competicion}:${temporada}` : null;
  return useRecurso<LigaForma>(clave, () => fetchFormaDeLiga(competicion!, temporada!));
}

export type JugadorDePlantel = { nombre: string; equipo: string; posicion: string; minutos: number; indice: number | null; perfil: string };

export const normalizarNombre = (nombre: string) => sinTildes(nombre).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Los jugadores de una liga y temporada con su índice, medido dentro de esa
 * liga (como la ficha cuando mide contra su liga). El índice necesita 500′
 * para su grupo de pares; con menos, se calcula igual pero se marca.
 */
export function usePlantelDeLiga(competicion: ApiCompetition | null) {
  const clave = competicion ? `plantel:${competicion.competition_id}:${competicion.season_id}` : null;
  return useRecurso<JugadorDePlantel[]>(clave, async () => {
    const base = await fetchStatsbombDataset(competicion!);
    const { rows } = aggregateDatasets([base]);
    return rows.map((fila, indice) => {
      const informe = buildPlayerReport(rows, indice, 500, "AUTO", null, { rescate: true });
      return {
        nombre: String(fila.Player ?? ""),
        equipo: String(fila.Team ?? ""),
        posicion: String(fila.Position ?? ""),
        minutos: numeric(fila["Minutes played"] as CellValue) || 0,
        indice: informe?.metrics.length ? informe.indice : null,
        perfil: informe?.cohort ?? "",
      };
    });
  });
}
