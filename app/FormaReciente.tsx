"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { numberLocale, t, tf } from "@/lib/i18n";
import { buildPlayerReport, type DataRow, type PlayerReport } from "@/lib/scouting";
import { compararForma, filaConLaForma } from "@/lib/formaReciente";
import { fetchForma, type ApiCompetition, type FormaReciente as DatosDeForma } from "@/lib/remoteData";
import { similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { ChipDeCambio, FilaDeMetrica, FranjaDeCifras, tonosDeColor } from "./KitNight";

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
 *
 * Es una hoja del informe, como la ficha: mismo ancho, mismo tema y su
 * propia página Legal en el PDF, justo detrás de la ficha. Mientras no hay
 * datos (bajando, error, sin partidos) la hoja se marca vacía y no se
 * imprime.
 */
export function FormaReciente({ informe, filas, indice, minutosMin, elegidas, porLiga, fuente, conMedia = false, estilo, oscuro = false, notaDeDatos, firmas }: {
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
  /** El tema del informe (los mismos colores que la ficha). */
  estilo?: CSSProperties;
  oscuro?: boolean;
  /** La línea de procedencia de los datos, la misma del pie de la ficha. */
  notaDeDatos?: string;
  /** Autor y destinatario, como en el pie de la ficha. */
  firmas?: ReactNode;
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
  const conDatos = Boolean(forma && forma.partidos.length > 0 && comparacion);

  return <div className="legal-page-shell">
    <article className="scout-report jordhy-report forma-hoja" style={estilo} data-oscuro={oscuro ? "" : undefined}
      data-hoja-vacia={conDatos ? undefined : ""} aria-label={t("Forma reciente")}>
      <header className="forma-hoja-cabecera">
        <div>
          <span>{t("FORMA RECIENTE")}</span>
          <h2>{fuente.jugador}</h2>
          <p>{tf("Sus últimos {n} partidos con {e}", { n: ventana, e: fuente.equipo })}</p>
        </div>
        <div className="rank-tabs forma-ventanas" role="radiogroup" aria-label={t("Cuántos partidos")}>
          {VENTANAS.map((n) => <button key={n} type="button" role="radio" aria-checked={ventana === n} className={ventana === n ? "on" : undefined} onClick={() => setVentana(n)}>{tf("Últimos {n}", { n })}</button>)}
        </div>
      </header>

      <div className="forma-hoja-cuerpo">
        {!vigentes && <p className="forma-nota" aria-live="polite">{t("Bajando sus partidos de StatsBomb… la primera vez tarda unos segundos por partido.")}</p>}
        {vigentes?.error && <p className="forma-nota aviso">{tf("No se pudo leer su forma: {e}", { e: vigentes.error })}</p>}
        {forma && !forma.partidos.length && <p className="forma-nota">{tf("No aparece en los partidos de {e} de esta temporada.", { e: fuente.equipo })}</p>}
        {forma && forma.partidos.length > 0 && <>
          <FranjaDeCifras className="forma-franja" celdas={[
            { etiqueta: t("Partidos"), valor: forma.partidos.length },
            { etiqueta: t("Minutos"), valor: `${forma.minutos.toLocaleString(numberLocale())}′` },
            { etiqueta: t("Suben 10+"), valor: comparacion ? sube : "—" },
            { etiqueta: t("Bajan 10+"), valor: comparacion ? baja : "—" },
          ]} />
          <ol className="forma-partidos">
            {forma.partidos.map((p) => <li key={p.partido}><b>{fecha(p.fecha)}</b><span>{p.rival}</span><small>{`${p.minutos}′`}</small></li>)}
          </ol>
          {forma.minutos < MINUTOS_PARA_FIARSE && <p className="forma-nota aviso">{t("Pocos minutos: tómalo como una señal, no como su nivel.")}</p>}
          {comparacion && <div className="forma-filas">
            {comparacion.cambios.map((c) => {
              const grupo = similarityMetricGroup(c, informe.cohort);
              return <FilaDeMetrica key={c.key} etiqueta={t(c.label)} cifra={`P${c.reciente}`} detalle={conMedia ? tf("media P{p}", { p: c.temporada }) : tf("temporada P{p}", { p: c.temporada })}
                chip={<ChipDeCambio cambio={c.cambio} umbral={5} igual={t("igual")} />} valor={c.reciente} tonos={tonosDeColor(grupo.color)} marca={c.temporada} />;
            })}
          </div>}
        </>}
      </div>

      <footer className="dossier-footer">
        <p>
          {forma && forma.partidos.length > 0 && tf("{m}′ en {n} partidos, medidos contra la misma cohorte que la ficha.", { m: forma.minutos.toLocaleString(numberLocale()), n: forma.partidos.length })}
          {` ${conMedia ? t("La barra es su percentil en esos partidos; la marca, el de la media de sus temporadas.") : t("La barra es su percentil en esos partidos; la marca, el de la temporada.")}`}
          {comparacion && comparacion.sinDato > 0 && ` ${tf("{n} métricas del radar no tienen dato por partido (las ajustadas por posesión y las de SkillCorner): quedan fuera.", { n: comparacion.sinDato })}`}
          {notaDeDatos && ` ${notaDeDatos}`}
        </p>
        {firmas}
      </footer>
    </article>
  </div>;
}
