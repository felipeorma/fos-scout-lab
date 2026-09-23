"use client";

import { EQUIPO_PROPIO, tramoDeEncaje, type EncajeDeEstilo } from "@/lib/estiloEquipo";
import { t, tf } from "@/lib/i18n";

/**
 * El encaje de estilo en una fila: la cifra y, debajo, qué es.
 *
 * Verde desde 75 —su club juega muy parecido al nuestro—, tinta de 60 a 75 y
 * gris por debajo. Sin perfil del club (liga sin estadísticas de equipo, o un
 * nombre que no casa) dice "—", y mientras llegan los datos, "…": ninguno de
 * los dos es un cero.
 */
export function CeldaEncaje({ encaje, cargando }: { encaje: EncajeDeEstilo; cargando: boolean }) {
  if (!encaje) {
    return <span className="celda-encaje vacia" title={cargando ? t("Cargando los estilos de equipo…") : t("Sin estilo de equipo para este club")}>
      <b>{cargando ? "…" : "—"}</b>
      <small>{t("encaje")}</small>
    </span>;
  }
  return <span className={`celda-encaje ${tramoDeEncaje(encaje.valor)}`}
    title={tf("Cómo juega {club} se parece un {n} sobre 100 a cómo juega {equipo}", { club: encaje.equipo, n: Math.round(encaje.valor), equipo: EQUIPO_PROPIO })}>
    <b>{Math.round(encaje.valor)}</b>
    <small>{t("encaje")}</small>
  </span>;
}
