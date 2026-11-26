"use client";

import { numberLocale, t, tf } from "@/lib/i18n";

/** Cómo se mide a un jugador con varias temporadas: una sola, o la media de varias. */
export type ModoDePeriodo = "una" | "media";

/** Una temporada del jugador, como se enseña al elegir. */
export type TemporadaDelPeriodo = {
  clave: string;
  anio: number;
  /** "2026", "2025/2026". */
  etiqueta: string;
  /** Club y liga. */
  detalle: string;
  minutos: number;
  /** Añadida a mano: sin métricas, se enseña pero no entra en el radar. */
  aMano?: boolean;
};

export type Periodo = { modo: ModoDePeriodo; anios: number[] };

const minutosDe = (minutos: number) => `${Math.round(minutos).toLocaleString(numberLocale())}′`;

/**
 * Con qué temporadas se mide a un jugador: la pregunta y la respuesta.
 *
 * Elegir a un jugador no pregunta nada —todas sus temporadas ya están
 * cargadas—. Se pregunta donde se dibuja: en la ficha, al comparar y en la
 * ficha ampliada. La primera vez que se abre a alguien con más de una
 * temporada sale la pregunta entera ("¿solo la última o la media?"); una
 * vez contestada queda como un selector discreto, y la respuesta se recuerda
 * para ese jugador. Hasta contestar se mide con la última, que es lo que
 * enseña cualquier plataforma por defecto.
 *
 * Una temporada: las fichas son excluyentes. Media: se encienden varias, y el
 * radar es la media ponderada por minutos. Las añadidas a mano salen en gris:
 * no traen métricas.
 */
export function PeriodoDelJugador({ jugador, temporadas, periodo, respondido, onCambiar, donde, deshabilitado = false }: {
  jugador: string;
  /** De la más reciente a la más vieja. */
  temporadas: TemporadaDelPeriodo[];
  periodo: Periodo;
  respondido: boolean;
  onCambiar: (periodo: Periodo) => void;
  /** Qué se dibuja con esto: "el radar y la ficha", "la comparación"… */
  donde: string;
  deshabilitado?: boolean;
}) {
  const conMetricas = temporadas.filter((temporada) => !temporada.aMano);
  const aMano = temporadas.filter((temporada) => temporada.aMano);
  if (!conMetricas.length) return null;
  const encendidas = conMetricas.filter((temporada) => periodo.anios.includes(temporada.anio));
  const ultima = conMetricas[0];
  const minutos = encendidas.reduce((suma, temporada) => suma + temporada.minutos, 0);
  const etiquetas = (lista: TemporadaDelPeriodo[]) => [...lista].reverse().map((temporada) => temporada.etiqueta).join(" + ");

  // Una sola temporada cargada: no hay nada que elegir, pero se dice cuál es.
  if (conMetricas.length === 1) {
    return <div className="periodo periodo-unica" role="group" aria-label={tf("Temporadas de {p}", { p: jugador })}>
      <span className="periodo-titulo">{t("Temporada")}</span>
      <div className="periodo-fichas">
        <span className="temporada-chip on fija"><i aria-hidden="true" /><b>{ultima.etiqueta}</b><small>{[ultima.detalle, minutosDe(ultima.minutos)].filter(Boolean).join(" · ")}</small></span>
        {aMano.map((temporada) => <FichaAMano key={temporada.clave} temporada={temporada} />)}
      </div>
    </div>;
  }

  const elegirModo = (modo: ModoDePeriodo) => {
    if (modo === periodo.modo && respondido) return;
    if (modo === "una") onCambiar({ modo, anios: [encendidas[0]?.anio ?? ultima.anio] });
    else onCambiar({ modo, anios: encendidas.length > 1 ? encendidas.map((temporada) => temporada.anio) : conMetricas.map((temporada) => temporada.anio) });
  };
  const alternar = (anio: number) => {
    if (periodo.modo === "una") { onCambiar({ modo: "una", anios: [anio] }); return; }
    const siguientes = periodo.anios.includes(anio) ? periodo.anios.filter((otro) => otro !== anio) : [...periodo.anios, anio];
    if (siguientes.length) onCambiar({ modo: "media", anios: siguientes });
  };

  return <div className={respondido ? "periodo" : "periodo pregunta"} role="group" aria-label={tf("Temporadas de {p}", { p: jugador })}>
    {!respondido && <div className="periodo-pregunta">
      <p><b>{tf("{p} tiene {n} temporadas cargadas.", { p: jugador, n: conMetricas.length })}</b> {tf("¿Con cuáles se mide {donde}?", { donde })}</p>
      <div className="periodo-respuestas">
        <button type="button" className="button secondary compact" disabled={deshabilitado} onClick={() => onCambiar({ modo: "una", anios: [ultima.anio] })}>
          {tf("Solo {t}", { t: ultima.etiqueta })}<small>{t("la última")}</small>
        </button>
        <button type="button" className="button primary compact" disabled={deshabilitado} onClick={() => onCambiar({ modo: "media", anios: conMetricas.map((temporada) => temporada.anio) })}>
          {tf("Media de {t}", { t: etiquetas(conMetricas) })}<small>{t("ponderada por minutos")}</small>
        </button>
      </div>
      <small className="periodo-nota">{tf("Hasta que elijas, se mide con {t}. Lo que elijas se recuerda para este jugador.", { t: encendidas.length ? etiquetas(encendidas) : ultima.etiqueta })}</small>
    </div>}
    <div className="periodo-control">
      <span className="periodo-titulo">{t("Temporadas")}</span>
      <div className="rank-tabs periodo-modo" role="radiogroup" aria-label={t("Cómo se mide")}>
        <button type="button" role="radio" aria-checked={periodo.modo === "una"} className={periodo.modo === "una" ? "on" : undefined} disabled={deshabilitado} onClick={() => elegirModo("una")}>{t("Una temporada")}</button>
        <button type="button" role="radio" aria-checked={periodo.modo === "media"} className={periodo.modo === "media" ? "on" : undefined} disabled={deshabilitado} onClick={() => elegirModo("media")}>{t("Media de varias")}</button>
      </div>
      <div className="periodo-fichas">
        {conMetricas.map((temporada) => {
          const activa = periodo.anios.includes(temporada.anio);
          const ultimaEncendida = activa && periodo.modo === "media" && encendidas.length === 1;
          return <button key={temporada.clave} type="button" className={activa ? "temporada-chip on" : "temporada-chip"} aria-pressed={activa}
            disabled={deshabilitado || ultimaEncendida} title={ultimaEncendida ? t("Tiene que quedar al menos una temporada.") : undefined}
            onClick={() => alternar(temporada.anio)}>
            <i aria-hidden="true" className={periodo.modo === "una" ? "radio" : undefined} />
            <b>{temporada.etiqueta}</b>
            <small>{[temporada.detalle, minutosDe(temporada.minutos)].filter(Boolean).join(" · ")}</small>
          </button>;
        })}
        {aMano.map((temporada) => <FichaAMano key={temporada.clave} temporada={temporada} />)}
      </div>
      <small className="periodo-nota">{encendidas.length > 1
        ? tf("Se mide con la media de {t}, ponderada por minutos ({m}).", { t: etiquetas(encendidas), m: minutosDe(minutos) })
        : tf("Se mide solo con {t} ({m}).", { t: encendidas[0]?.etiqueta ?? ultima.etiqueta, m: minutosDe(encendidas[0]?.minutos ?? ultima.minutos) })}</small>
    </div>
  </div>;
}

function FichaAMano({ temporada }: { temporada: TemporadaDelPeriodo }) {
  return <span className="temporada-chip a-mano" title={t("Añadida a mano: sin métricas, no entra en el radar.")}>
    <b>{temporada.etiqueta}</b><small>{temporada.detalle}</small><em>{t("a mano · fuera del radar")}</em>
  </span>;
}

/** "2026" o "2025 + 2026": las temporadas de un período, para cabeceras y hojas. */
export function textoDelPeriodo(temporadas: TemporadaDelPeriodo[], periodo: Periodo) {
  return temporadas.filter((temporada) => !temporada.aMano && periodo.anios.includes(temporada.anio))
    .map((temporada) => temporada.etiqueta).reverse().join(" + ");
}
