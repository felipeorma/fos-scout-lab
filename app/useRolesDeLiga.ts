"use client";

import { useEffect, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { fetchRolesDeSecuencia, type RolesDeLiga } from "@/lib/remoteData";

/**
 * Los roles en la secuencia de una liga, compartidos por la ficha ampliada
 * (los del jugador) y el encaje con un equipo (los de la liga de destino).
 * Se piden una vez por liga y temporada en la sesión.
 */

// Los roles de cada liga ya pedidos, y los que están en camino.
const rolesGuardados = new Map<string, RolesDeLiga>();
const rolesEnCamino = new Map<string, Promise<RolesDeLiga>>();

/** Los roles en la secuencia de una liga y temporada. Sin `activo` no se piden. */
export function useRoles(liga: string, temporada: string, activo: boolean) {
  const clave = liga ? `${liga}|${temporada}` : "";
  const [roles, setRoles] = useState<RolesDeLiga | null>(() => (clave ? rolesGuardados.get(clave) ?? null : null));
  const [estado, setEstado] = useState("");
  useEffect(() => {
    if (!clave) { setRoles(null); setEstado(""); return; }
    const guardado = rolesGuardados.get(clave);
    if (guardado) { setRoles(guardado); setEstado(""); return; }
    setRoles(null);
    if (!activo) { setEstado(""); return; }
    let vivo = true;
    setEstado(tf("Analizando las secuencias de {liga}… la primera vez tarda unos minutos.", { liga }));
    let promesa = rolesEnCamino.get(clave);
    if (!promesa) {
      promesa = fetchRolesDeSecuencia(liga, temporada)
        .then((respuesta) => { rolesGuardados.set(clave, respuesta); return respuesta; })
        .finally(() => rolesEnCamino.delete(clave));
      rolesEnCamino.set(clave, promesa);
    }
    promesa
      .then((respuesta) => { if (vivo) { setRoles(respuesta); setEstado(""); } })
      .catch((error) => {
        if (!vivo) return;
        setEstado(error instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : error instanceof Error ? error.message : String(error));
      });
    return () => { vivo = false; };
  }, [clave, liga, temporada, activo]);
  return { roles, estado };
}

