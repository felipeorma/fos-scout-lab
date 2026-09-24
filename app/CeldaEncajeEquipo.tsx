"use client";

import { tramo } from "@/lib/encaje";
import { t, tf } from "@/lib/i18n";
import type { EncajeDeFila } from "./useEncajeDeLista";

/**
 * El encaje con un equipo en una fila: grande, cuánto se parece a lo que el
 * equipo pide en su puesto; debajo, qué lugar ocuparía por índice en la
 * plantilla y en qué % de partidos el equipo usa su puesto. Sin dato, "—":
 * nunca un cero.
 */
export function CeldaEncajeEquipo({ encaje, cargandoSitio }: { encaje: EncajeDeFila | null; cargandoSitio: boolean }) {
  if (!encaje) return null;
  const debajo = [
    encaje.lugar ? `${encaje.lugar.lugar}.º/${encaje.lugar.de}` : null,
    encaje.sitio != null ? `${encaje.sitio}%` : cargandoSitio ? "…" : null,
  ].filter(Boolean).join(" · ");
  const titulo = [
    encaje.puesto != null
      ? tf("Se parece un {n} sobre 100 a lo que {equipo} pide en su puesto (por familias; la ficha ampliada suma los roles en la secuencia).", { n: Math.round(encaje.puesto), equipo: encaje.equipo })
      : tf("Sin comparación con el puesto: {equipo} no tiene jugadores de esa posición con los minutos mínimos, o él no llega a ellos.", { equipo: encaje.equipo }),
    encaje.lugar ? tf("Por índice, sería el {l}.º de {n} en ese puesto.", { l: encaje.lugar.lugar, n: encaje.lugar.de }) : null,
    encaje.sitio != null ? tf("{equipo} usa su puesto en el {p} % de los partidos.", { equipo: encaje.equipo, p: encaje.sitio }) : null,
  ].filter(Boolean).join("\n");
  return <span className={`celda-encaje celda-encaje-equipo ${encaje.puesto != null ? tramo(encaje.puesto) : "vacia"}`} title={titulo}>
    <b>{encaje.puesto != null ? Math.round(encaje.puesto) : "—"}</b>
    <small>{debajo || t("puesto")}</small>
  </span>;
}
