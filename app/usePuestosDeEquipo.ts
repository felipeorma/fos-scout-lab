"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { fetchPuestosDeEquipo } from "@/lib/remoteData";
import type { Alineaciones } from "@/lib/encaje";

/**
 * En qué puestos juega un equipo, de sus alineaciones de StatsBomb. Lo usan
 * el encaje de la ficha ampliada y la columna de encaje de Ranking y Entre
 * ligas: se pide una vez por equipo en la sesión.
 */

// Las alineaciones de cada equipo ya pedidas, y las que están en camino.
const puestosGuardados = new Map<string, Alineaciones>();
const puestosEnCamino = new Map<string, Promise<Alineaciones>>();

export function usePuestos(clave: string) {
  const [datos, setDatos] = useState<Alineaciones | null>(() => (clave ? puestosGuardados.get(clave) ?? null : null));
  const [error, setError] = useState("");
  useEffect(() => {
    if (!clave) { setDatos(null); setError(""); return; }
    const guardado = puestosGuardados.get(clave);
    if (guardado) { setDatos(guardado); setError(""); return; }
    setDatos(null);
    setError("");
    let vivo = true;
    let promesa = puestosEnCamino.get(clave);
    if (!promesa) {
      promesa = fetchPuestosDeEquipo(clave)
        .then((respuesta) => { puestosGuardados.set(clave, respuesta); return respuesta; })
        .finally(() => puestosEnCamino.delete(clave));
      puestosEnCamino.set(clave, promesa);
    }
    promesa
      .then((respuesta) => { if (vivo) setDatos(respuesta); })
      .catch((fallo) => {
        if (!vivo) return;
        setError(fallo instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : fallo instanceof Error ? fallo.message : String(fallo));
      });
    return () => { vivo = false; };
  }, [clave]);
  return { datos, error };
}

