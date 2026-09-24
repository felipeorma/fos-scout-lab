"use client";

import { useEffect, useState } from "react";
import { fetchSkillcornerCompetitions, fetchSkillcornerTeamStats, fetchStatsbombCompetitions, fetchStatsbombTeamStats, temporadasUtiles } from "@/lib/remoteData";
import { fusionarSkillcorner, type FilaEquipo } from "@/lib/estiloEquipo";
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
const sinTildes = (valor: unknown) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

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
      // SkillCorner es opcional: sin él, el estilo sale solo con StatsBomb.
      const [catalogo, catalogoSc] = await Promise.all([
        fetchStatsbombCompetitions(),
        fetchSkillcornerCompetitions().catch(() => []),
      ]);
      const { elegidas } = temporadasUtiles(catalogo);
      // De cuatro en cuatro: el puente ya atiende en paralelo, y una liga sin
      // caché no deja a las demás esperando detrás. El orden de las filas se
      // conserva por competición, así que el resultado no depende de cuál
      // termina antes.
      const porLiga: FilaEquipo[][] = elegidas.map(() => []);
      let fallidas = 0;
      let listas = 0;
      let siguiente = 0;
      const cargarLiga = async (i: number) => {
        const competicion = elegidas[i];
        let filas: FilaEquipo[];
        try {
          filas = await fetchStatsbombTeamStats(competicion);
        } catch {
          fallidas += 1;
          return;
        }
        // La misma liga y temporada en SkillCorner, casada igual que al cargar
        // la base de jugadores: por nombre sin tildes y temporada exacta.
        const hermana = catalogoSc.find((edicion) => (
          sinTildes(edicion.name) === sinTildes(competicion.name)
          && String(edicion.season ?? "") === String(competicion.season ?? "")
        ));
        if (hermana && filas.length) {
          try {
            filas = fusionarSkillcorner(filas, await fetchSkillcornerTeamStats(hermana));
          } catch { /* sin SkillCorner la liga sigue con StatsBomb */ }
        }
        porLiga[i] = filas;
      };
      const trabajador = async () => {
        while (siguiente < elegidas.length) {
          const i = siguiente;
          siguiente += 1;
          await cargarLiga(i);
          listas += 1;
          publicar({ mensaje: tf("{n} de {total} · {liga}", { n: listas, total: elegidas.length, liga: elegidas[i].name }) });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, elegidas.length) }, trabajador));
      const juntas = porLiga.flat();
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
