import type { TmApiPayload } from "./transfermarkt";

/**
 * La ficha de un jugador, pedida a la API de Transfermarkt.
 *
 * Desde septiembre de 2026 la web está detrás del WAF de AWS con verificación
 * humana: responde 405 a cualquier cliente que no sea un navegador con la
 * prueba resuelta, y eso deja fuera tanto a los proxies públicos como a este
 * servidor. La API que alimenta a la propia web sigue abierta y trae lo mismo
 * en JSON, repartido en cuatro piezas: el jugador, su club, la competición de
 * ese club y la selección —que ahí dentro es un club con `isNationalTeam` y es
 * de donde sale la nacionalidad—.
 *
 * Vive aparte de `transfermarkt.ts`, que solo traduce datos a la ficha y no
 * habla con la red: aquí se piden, allí se interpretan.
 */
const TMAPI = "https://tmapi-alpha.transfermarkt.technology";

type Asignacion = { type?: string; clubId?: string; shirtNumber?: number; start?: string; debut?: string };

async function pedir<T>(ruta: string): Promise<T | null> {
  try {
    // La API rechaza con 406 si no se pide JSON explícitamente, y el servidor
    // de la app manda otro Accept por su cuenta.
    const respuesta = await fetch(`${TMAPI}${ruta}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!respuesta.ok) return null;
    const cuerpo = await respuesta.json() as { data?: T };
    return cuerpo.data ?? null;
  } catch {
    return null;
  }
}

/** Devuelve null si la URL no trae id de jugador o si la API no responde. */
export async function tmApiPayload(url: string): Promise<TmApiPayload | null> {
  const id = /\/spieler\/(\d+)/.exec(url)?.[1];
  if (!id) return null;
  const player = await pedir<TmApiPayload["player"] & { clubAssignments?: Asignacion[] }>(`/player/${id}`);
  if (!player) return null;

  const asignaciones = player.clubAssignments ?? [];
  const actual = asignaciones.find((asignacion) => asignacion.type === "current");
  const seleccion = asignaciones.find((asignacion) => asignacion.type === "nationalTeam");

  const club = actual?.clubId
    ? await pedir<{ name?: string; crestUrl?: string; baseDetails?: { primaryCompetitionId?: string } }>(`/club/${actual.clubId}`)
    : null;
  const competicionId = club?.baseDetails?.primaryCompetitionId;

  return {
    player,
    club,
    competition: competicionId ? await pedir<{ name?: string; logoUrl?: string }>(`/competition/${competicionId}`) : null,
    nationalTeam: seleccion?.clubId ? await pedir<{ name?: string }>(`/club/${seleccion.clubId}`) : null,
    shirtNumber: actual?.shirtNumber ?? null,
    joined: actual?.start ?? actual?.debut ?? null,
  };
}
