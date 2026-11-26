"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchStatsbombTeamStats, type ApiCompetition } from "@/lib/remoteData";
import { fuerzasDeLiga, type FuerzaDeClub } from "@/lib/fuerzaDelClub";
import { ligaYAnioDe } from "@/lib/procedencia";
import type { SourceDataset } from "@/lib/scouting";

/** Busca la fuerza de un club en una liga y temporada ("2026", "2025/2026"). */
export type BuscadorDeFuerza = (liga: string, temporada: string, equipo: string) => FuerzaDeClub | null;

const normal = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const claveDe = (liga: string, temporada: string, equipo: string) => `${normal(liga)}|${temporada.replace(/\s+/g, "")}|${normal(equipo)}`;

/** Lo ya bajado, por competición y temporada de StatsBomb: no se vuelve a pedir en la sesión. */
const recordadas = new Map<string, Promise<Map<string, FuerzaDeClub>>>();

/**
 * La fuerza de los clubes de cada base de StatsBomb encendida, en SU
 * temporada (no solo la actual: un jugador medido con su 2025 se ajusta por
 * su club de 2025). Una petición por competición y temporada, y el puente la
 * guarda en disco. Las bases de archivo (Wyscout) no tienen estadísticas de
 * equipo: sus jugadores quedan sin ajuste, y la pantalla lo dice.
 */
export function useFuerzaDeClubes(bases: SourceDataset[], catalogo: ApiCompetition[], activo: boolean) {
  const pedidas = useMemo(() => {
    if (!activo) return [];
    const salida: Array<{ liga: string; temporada: string; competicion: ApiCompetition }> = [];
    for (const base of bases) {
      if (base.provider !== "statsbomb") continue;
      const { liga, temporada } = ligaYAnioDe(base.fileName);
      const competicion = catalogo.find((c) => normal(c.name) === normal(liga) && String(c.season ?? "").replace(/\s+/g, "") === temporada);
      if (competicion?.competition_id && competicion.season_id) salida.push({ liga, temporada, competicion });
    }
    return salida;
  }, [bases, catalogo, activo]);
  const [mapa, setMapa] = useState<Map<string, FuerzaDeClub>>(new Map());
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!pedidas.length) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    void Promise.all(pedidas.map(async ({ liga, temporada, competicion }) => {
      const id = `${competicion.competition_id}|${competicion.season_id}`;
      if (!recordadas.has(id)) {
        const promesa = fetchStatsbombTeamStats(competicion).then((filas) => fuerzasDeLiga(filas));
        // Si falla, se olvida para poder reintentar más tarde.
        promesa.catch(() => recordadas.delete(id));
        recordadas.set(id, promesa);
      }
      try {
        return { liga, temporada, fuerzas: await recordadas.get(id)! };
      } catch {
        return null;
      }
    })).then((ligas) => {
      if (!vivo) return;
      const nuevo = new Map<string, FuerzaDeClub>();
      for (const liga of ligas) {
        if (!liga) continue;
        for (const [equipo, fuerza] of liga.fuerzas) nuevo.set(claveDe(liga.liga, liga.temporada, equipo), fuerza);
      }
      setMapa(nuevo);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [pedidas]);

  const fuerzaDe = useMemo<BuscadorDeFuerza | null>(
    () => (mapa.size ? (liga, temporada, equipo) => mapa.get(claveDe(liga, temporada, equipo)) ?? null : null),
    [mapa],
  );
  return { fuerzaDe, cargando };
}
