"use client";

import { useBaseActiva } from "./BaseActiva";
import { Desplegable } from "./BarraDeFiltros";
import { t } from "@/lib/i18n";

/**
 * Con qué temporadas se mide una lista (Ranking, Pizarra): una sola, o la
 * media de varias, siempre dicho. Antes la lista juntaba en silencio todas
 * las temporadas cargadas de cada jugador.
 *
 * Va como la primera ficha de la barra, junto a la posición: decide QUÉ se
 * calcula, no a quién se enseña.
 */
export function PeriodoDeLista() {
  const { vista } = useBaseActiva();
  if (!vista.opciones.length) return null;
  const etiqueta = t("Temporada");
  // El texto de la opción ya dice "Temporada 2026" o "Media de 2025 + 2026"; en la ficha basta lo de después.
  const valor = vista.texto.replace(/^(Temporada|Season)\s+/, "");
  return <Desplegable etiqueta={etiqueta} valor={vista.periodo.modo === "media" ? vista.texto : valor} activo={vista.periodo.modo === "media"}>
    <select aria-label={t("Con qué temporadas se mide la lista")} value={vista.clave} onChange={(evento) => vista.elegir(evento.target.value)}>
      {vista.opciones.map((opcion) => <option key={opcion.clave} value={opcion.clave}>{opcion.texto}</option>)}
    </select>
  </Desplegable>;
}

/** La línea que dice el período en la cabecera de una hoja; con aviso mientras se rehace. */
export function TextoDelPeriodoDeLista() {
  const { vista } = useBaseActiva();
  if (!vista.texto) return null;
  return <span className="periodo-de-lista" aria-live="polite">
    {vista.texto}{vista.periodo.modo === "media" ? ` · ${t("ponderada por minutos")}` : ""}
    {vista.pendiente && <em>{` · ${t("rehaciendo la lista…")}`}</em>}
  </span>;
}
