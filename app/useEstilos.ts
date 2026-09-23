"use client";

import { useEffect, useState } from "react";
import { fetchStatsbombCompetitions, fetchStatsbombTeamStats, temporadasUtiles } from "@/lib/remoteData";
import type { FilaEquipo } from "@/lib/estiloEquipo";
import { t, tf } from "@/lib/i18n";

/**
 * Las estadísticas de equipo, una sola vez para toda la plataforma.
 *
 * Estilo de juego, Ranking y Entre ligas las necesitan, y cada una bajándolas
 * por su cuenta serían tres veces dieciséis peticiones. Aquí se piden una vez
 * por sesión y se reparten: la primera página que las pida las carga y las
 * demás se suscriben. Si el puente no está, se queda en un aviso y las
 * pantallas siguen funcionando sin el encaje.
 */

type Estado = { filas: FilaEquipo[] | null; cargando: boolean; mensaje: string };

let estado: Estado = { filas: null, cargando: false, mensaje: "" };
const oyentes = new Set<(nuevo: Estado) => void>();
let enCurso: Promise<void> | null = null;

function publicar(cambio: Partial<Estado>) {
  estado = { ...estado, ...cambio };
  for (const oyente of oyentes) oyente(estado);
}

export function cargarEstilos(forzar = false): Promise<void> {
  if (enCurso) return enCurso;
  if (estado.filas && !forzar) return Promise.resolve();
  enCurso = (async () => {
    publicar({ cargando: true, mensaje: t("Leyendo el catálogo de StatsBomb…") });
    try {
      const catalogo = await fetchStatsbombCompetitions();
      const { elegidas } = temporadasUtiles(catalogo);
      const juntas: FilaEquipo[] = [];
      let fallidas = 0;
      for (const [i, competicion] of elegidas.entries()) {
        publicar({ mensaje: tf("{n} de {total} · {liga}", { n: i + 1, total: elegidas.length, liga: competicion.name }) });
        try {
          juntas.push(...await fetchStatsbombTeamStats(competicion));
        } catch {
          fallidas += 1;
        }
      }
      if (!juntas.length) throw new Error(t("StatsBomb no devolvió equipos."));
      publicar({ filas: juntas, mensaje: fallidas ? tf("{n} competiciones sin datos de equipo.", { n: fallidas }) : "" });
    } catch (error) {
      publicar({
        mensaje: error instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : error instanceof Error ? error.message : String(error),
      });
    } finally {
      publicar({ cargando: false });
    }
  })().finally(() => { enCurso = null; });
  return enCurso;
}

export function useEstilos() {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    setActual(estado);
    if (!estado.filas && !estado.cargando) void cargarEstilos();
    return () => { oyentes.delete(setActual); };
  }, []);
  return { ...actual, recargar: () => cargarEstilos(true) };
}
