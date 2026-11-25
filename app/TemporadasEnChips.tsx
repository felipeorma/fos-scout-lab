"use client";

import { numberLocale, t, tf } from "@/lib/i18n";

/** Una temporada de un jugador, como ficha que se enciende o se apaga. */
export type ChipDeTemporada = {
  clave: string;
  /** "2026", "2025/2026". */
  etiqueta: string;
  /** Club y liga. */
  detalle: string;
  minutos: number;
  activa: boolean;
  /** La de referencia y las otras ligas de ese mismo año: entran siempre. */
  fija?: boolean;
  /** Añadida a mano: sin métricas, se enseña pero no entra en el radar. */
  aMano?: boolean;
};

/**
 * Qué temporadas de un jugador entran en el radar.
 *
 * Una fila de fichas, no un diálogo: preguntar cada vez que se cambia de
 * jugador cansa, y así se ve de un vistazo con qué se le está midiendo. Con
 * más de una encendida, el radar es la media de esas temporadas ponderada por
 * minutos. Las añadidas a mano no traen métricas: salen en gris para que se
 * sepa que existen, sin poder encenderse. Siempre queda al menos una.
 */
export function TemporadasEnChips({ titulo, chips, onAlternar, deshabilitado = false }: {
  titulo: string;
  chips: ChipDeTemporada[];
  onAlternar: (clave: string) => void;
  deshabilitado?: boolean;
}) {
  if (!chips.length) return null;
  const activas = chips.filter((chip) => chip.activa && !chip.aMano);
  const minutos = activas.reduce((suma, chip) => suma + chip.minutos, 0);
  return <div className="temporadas-chips" role="group" aria-label={titulo}>
    <span className="temporadas-chips-titulo">{titulo}</span>
    <div className="temporadas-chips-lista">
      {chips.map((chip) => {
        const minutosDeLaFicha = `${chip.minutos.toLocaleString(numberLocale())}′`;
        if (chip.aMano) {
          return <span key={chip.clave} className="temporada-chip a-mano" title={t("Añadida a mano: sin métricas, no entra en el radar.")}>
            <b>{chip.etiqueta}</b><small>{chip.detalle}</small><em>{t("a mano · fuera del radar")}</em>
          </span>;
        }
        const ultima = chip.activa && activas.length === 1;
        return <button key={chip.clave} type="button" className={chip.activa ? "temporada-chip on" : "temporada-chip"} aria-pressed={chip.activa}
          disabled={deshabilitado || chip.fija || ultima}
          title={chip.fija ? t("La temporada de referencia: entra siempre.") : ultima ? t("Tiene que quedar al menos una temporada.") : undefined}
          onClick={() => onAlternar(chip.clave)}>
          <i aria-hidden="true" />
          <b>{chip.etiqueta}</b>
          <small>{chip.detalle ? `${chip.detalle} · ${minutosDeLaFicha}` : minutosDeLaFicha}</small>
        </button>;
      })}
    </div>
    {activas.length > 1 && <small className="temporadas-chips-nota">{tf("Radar con la media de {n} temporadas, ponderada por minutos ({m}′).", { n: activas.length, m: minutos.toLocaleString(numberLocale()) })}</small>}
  </div>;
}

/** Las fichas de un jugador a partir de sus temporadas: encendidas las de `anios` (todas si es null). */
export function chipsDeTemporadas(temporadas: Array<{ etiqueta: string; anio: number; ligas: string[]; equipo: string; minutos: number }>, anios: number[] | null): ChipDeTemporada[] {
  return temporadas.map((temporada) => ({
    clave: String(temporada.anio),
    etiqueta: temporada.etiqueta,
    detalle: [temporada.equipo, temporada.ligas.join(", ")].filter(Boolean).join(" · "),
    minutos: temporada.minutos,
    activa: anios === null || anios.includes(temporada.anio),
  }));
}
