"use client";

import { useEffect, useMemo, useState } from "react";
import { numberLocale, t, tf } from "@/lib/i18n";
import { buildPlayerReport, type DataRow, type PlayerReport } from "@/lib/scouting";
import { compararForma, filaConLaForma } from "@/lib/formaReciente";
import { fetchForma, type ApiCompetition, type FormaReciente as DatosDeForma } from "@/lib/remoteData";
import { similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { ChipDeCambio, FilaDeMetrica, tonosDeColor } from "./KitNight";

const VENTANAS = [3, 5, 10] as const;
/** Por debajo, la forma es una señal y no un nivel: se avisa. */
const MINUTOS_PARA_FIARSE = 450;

/**
 * La forma reciente: sus últimos 3, 5 o 10 partidos con su club, medidos
 * contra la misma cohorte que la temporada (lib/formaReciente). La barra es
 * su percentil en esos partidos; la marca, el de la temporada; el chip, la
 * diferencia. Sirve para ver si viene subiendo o bajando antes de un
 * informe, no para sustituir a la temporada: con pocos minutos, cualquier
 * número se mueve mucho, y se dice.
 */
export function FormaReciente({ informe, filas, indice, minutosMin, elegidas, porLiga, fuente, conMedia = false }: {
  informe: PlayerReport;
  filas: DataRow[];
  indice: number;
  minutosMin: number;
  elegidas?: string[];
  porLiga?: { clavesPorFila: string[][] };
  /** De dónde sacar sus partidos: su liga y temporada en StatsBomb, su club y su nombre. */
  fuente: { competicion: ApiCompetition; equipo: string; jugador: string };
  /** Si la ficha se mide con la media de varias temporadas: la marca lo dice. */
  conMedia?: boolean;
}) {
  const [ventana, setVentana] = useState<number>(5);
  const [datos, setDatos] = useState<{ clave: string; forma: DatosDeForma | null; error: string } | null>(null);
  const clave = `${fuente.competicion.competition_id}|${fuente.competicion.season_id}|${fuente.equipo}|${fuente.jugador}|${ventana}`;

  useEffect(() => {
    let vivo = true;
    fetchForma(fuente.competicion, fuente.equipo, fuente.jugador, ventana)
      .then((forma) => { if (vivo) setDatos({ clave, forma, error: "" }); })
      .catch((error: unknown) => { if (vivo) setDatos({ clave, forma: null, error: error instanceof Error ? error.message : String(error) }); });
    return () => { vivo = false; };
  }, [clave, fuente.competicion, fuente.equipo, fuente.jugador, ventana]);

  const vigentes = datos?.clave === clave ? datos : null;
  const forma = vigentes?.forma ?? null;
  const comparacion = useMemo(() => {
    if (!forma || !forma.partidos.length || !filas[indice]) return null;
    const copia = [...filas];
    copia[indice] = filaConLaForma(filas[indice], forma.fila);
    const reciente = buildPlayerReport(copia, indice, minutosMin, informe.cohort, elegidas, { rescate: true, porLiga });
    return reciente ? compararForma(informe.metrics, reciente.metrics) : null;
  }, [forma, filas, indice, minutosMin, informe, elegidas, porLiga]);

  const fecha = (texto: string) => (texto ? new Date(`${texto}T12:00:00`).toLocaleDateString(numberLocale(), { day: "numeric", month: "short" }) : "");
  const sube = comparacion?.cambios.filter((c) => c.cambio >= 10).length ?? 0;
  const baja = comparacion?.cambios.filter((c) => c.cambio <= -10).length ?? 0;

  return <section className="forma-reciente" aria-label={t("Forma reciente")}>
    <header>
      <div>
        <span>{t("FORMA RECIENTE")}</span>
        <h3>{tf("Sus últimos {n} partidos con {e}", { n: ventana, e: fuente.equipo })}</h3>
      </div>
      <div className="rank-tabs" role="radiogroup" aria-label={t("Cuántos partidos")}>
        {VENTANAS.map((n) => <button key={n} type="button" role="radio" aria-checked={ventana === n} className={ventana === n ? "on" : undefined} onClick={() => setVentana(n)}>{tf("Últimos {n}", { n })}</button>)}
      </div>
    </header>
    {!vigentes && <p className="forma-nota" aria-live="polite">{t("Bajando sus partidos de StatsBomb… la primera vez tarda unos segundos por partido.")}</p>}
    {vigentes?.error && <p className="forma-nota aviso">{tf("No se pudo leer su forma: {e}", { e: vigentes.error })}</p>}
    {forma && !forma.partidos.length && <p className="forma-nota">{tf("No aparece en los partidos de {e} de esta temporada.", { e: fuente.equipo })}</p>}
    {forma && forma.partidos.length > 0 && <>
      <p className="forma-partidos">
        {forma.partidos.map((p) => <span key={p.partido}>{tf("{f} · {r} · {m}′", { f: fecha(p.fecha), r: p.rival, m: p.minutos })}</span>)}
      </p>
      <p className="forma-nota">
        {tf("{m}′ en {n} partidos, medidos contra la misma cohorte que la ficha.", { m: forma.minutos.toLocaleString(numberLocale()), n: forma.partidos.length })}
        {comparacion && ` ${tf("{s} métricas suben 10 puntos o más y {b} bajan 10 o más.", { s: sube, b: baja })}`}
        {forma.minutos < MINUTOS_PARA_FIARSE && ` ${t("Pocos minutos: tómalo como una señal, no como su nivel.")}`}
      </p>
      {comparacion && <div className="forma-filas">
        {comparacion.cambios.map((c) => {
          const grupo = similarityMetricGroup(c, informe.cohort);
          return <FilaDeMetrica key={c.key} etiqueta={t(c.label)} cifra={`P${c.reciente}`} detalle={conMedia ? tf("media P{p}", { p: c.temporada }) : tf("temporada P{p}", { p: c.temporada })}
            chip={<ChipDeCambio cambio={c.cambio} umbral={5} />} valor={c.reciente} tonos={tonosDeColor(grupo.color)} marca={c.temporada} />;
        })}
      </div>}
      {comparacion && comparacion.sinDato > 0 && <p className="forma-nota">{tf("{n} métricas del radar no tienen dato por partido (las ajustadas por posesión y las de SkillCorner): quedan fuera.", { n: comparacion.sinDato })}</p>}
    </>}
  </section>;
}
