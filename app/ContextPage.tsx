"use client";

import { useMemo } from "react";
import type { DataRow, PlayerReport } from "@/lib/scouting";
import { METRIC_SOURCE_COLORS } from "@/lib/similarityMetricGroups";
import { t, tf } from "@/lib/i18n";
import { CuadranteMetricas, LeyendaGraficos, SwarmMetric, type PuntoCuadrante, type PuntoSwarm } from "./ContextCharts";

/**
 * Página de contexto: sitúa al jugador dentro de su equipo y de la liga.
 *
 * Un percentil solo dice dónde está respecto a su posición. Para decidir un
 * fichaje hace falta saber cuánto de eso es suyo y cuánto del entorno: un
 * extremo que recibe muchas rupturas en un equipo que sirve bien no es el
 * mismo jugador en otro que no las busca. Esta hoja separa las dos cosas.
 */

const DESTACA = 75;
const FLOJEA = 25;

function numero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function mediana(values: number[]) {
  if (!values.length) return Number.NaN;
  const orden = [...values].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export type ContextoEquipo = { rank: number; total: number; valor: number };

/** Ranking del equipo del jugador en cada métrica, frente al resto de equipos. */
export function rankingDeEquipos(rows: DataRow[], metricKey: string, equipo: string): ContextoEquipo | null {
  const porEquipo = new Map<string, number[]>();
  for (const row of rows) {
    const club = String(row.Team ?? "").trim();
    const valor = numero(row[metricKey]);
    if (!club || !Number.isFinite(valor)) continue;
    porEquipo.set(club, [...(porEquipo.get(club) ?? []), valor]);
  }
  if (porEquipo.size < 2 || !porEquipo.has(equipo)) return null;
  const medias = [...porEquipo.entries()]
    .map(([club, valores]) => ({ club, valor: mediana(valores) }))
    .filter((item) => Number.isFinite(item.valor))
    .sort((a, b) => b.valor - a.valor);
  const posicion = medias.findIndex((item) => item.club === equipo);
  if (posicion < 0) return null;
  return { rank: posicion + 1, total: medias.length, valor: medias[posicion].valor };
}

function Barra({ percentil, color }: { percentil: number; color: string }) {
  return <i className="ctx-bar" aria-hidden="true"><em style={{ width: `${Math.max(2, percentil)}%`, background: color }} /></i>;
}

function FilaMetrica({ metrica, contexto }: { metrica: PlayerReport["metrics"][number]; contexto: ContextoEquipo | null }) {
  const color = METRIC_SOURCE_COLORS[metrica.source ?? "wyscout"]?.color ?? METRIC_SOURCE_COLORS.wyscout.color;
  // El equipo se lee en tercios: arriba, en la media o abajo de la liga.
  const tercio = contexto ? (contexto.rank <= contexto.total / 3 ? "alto" : contexto.rank > (contexto.total * 2) / 3 ? "bajo" : "medio") : null;
  return <li>
    <span className="ctx-metric-label">{t(metrica.label)}</span>
    <Barra percentil={metrica.percentile} color={color} />
    <b style={{ color }}>P{metrica.percentile}</b>
    {contexto && <small className={`ctx-team-rank ${tercio}`}>{tf("su equipo {r}º de {n}", { r: contexto.rank, n: contexto.total })}</small>}
  </li>;
}

function Embudo({ pasos }: { pasos: Array<{ etiqueta: string; valor: number; base?: number }> }) {
  const maximo = Math.max(...pasos.map((paso) => paso.valor), 0.0001);
  return <div className="ctx-funnel">
    {pasos.map((paso, index) => {
      const ancho = Math.max(3, (paso.valor / maximo) * 100);
      const caida = index > 0 && pasos[index - 1].valor > 0 ? Math.round((paso.valor / pasos[index - 1].valor) * 100) : null;
      return <div key={paso.etiqueta} className="ctx-funnel-step">
        <span>{paso.etiqueta}</span>
        <i><em style={{ width: `${ancho}%` }} />{paso.base !== undefined && Number.isFinite(paso.base) && <u style={{ left: `${Math.max(3, (paso.base / maximo) * 100)}%` }} />}</i>
        <b>{paso.valor.toFixed(1)}</b>
        {caida !== null && <small>{caida}%</small>}
      </div>;
    })}
  </div>;
}

export function ContextPage({ report, rows }: { report: PlayerReport; rows: DataRow[] }) {
  const fila = useMemo(() => rows.find((row) => String(row.Player ?? "") === report.player), [rows, report.player]);

  const destacadas = useMemo(
    () => report.metrics.filter((metrica) => metrica.percentile >= DESTACA).sort((a, b) => b.percentile - a.percentile).slice(0, 7),
    [report.metrics],
  );
  const flojas = useMemo(
    () => report.metrics.filter((metrica) => metrica.percentile <= FLOJEA).sort((a, b) => a.percentile - b.percentile).slice(0, 7),
    [report.metrics],
  );

  const contextos = useMemo(() => {
    const mapa = new Map<string, ContextoEquipo | null>();
    for (const metrica of [...destacadas, ...flojas]) {
      mapa.set(metrica.key, rankingDeEquipos(rows, metrica.key, report.team));
    }
    return mapa;
  }, [destacadas, flojas, rows, report.team]);

  // El embudo solo existe si la competición trae game intelligence de SkillCorner.
  const embudo = useMemo(() => {
    if (!fila) return null;
    const paso = (columna: string) => numero(fila[columna]);
    const hechas = paso("Runs in behind P30 (SC)");
    if (!Number.isFinite(hechas) || hechas <= 0) return null;
    const equipoBase = (columna: string) => {
      const valores = rows
        .filter((row) => String(row.Team ?? "") === report.team && row !== fila)
        .map((row) => numero(row[columna]))
        .filter(Number.isFinite);
      return valores.length ? mediana(valores) : undefined;
    };
    return [
      { etiqueta: t("Rupturas"), valor: hechas, base: equipoBase("Runs in behind P30 (SC)") },
      { etiqueta: t("Peligrosas"), valor: paso("Dangerous runs behind P30 (SC)"), base: equipoBase("Dangerous runs behind P30 (SC)") },
      { etiqueta: t("Buscadas"), valor: paso("Behind targeted P30 (SC)"), base: equipoBase("Behind targeted P30 (SC)") },
      { etiqueta: t("Recibidas"), valor: paso("Behind received P30 (SC)"), base: equipoBase("Behind received P30 (SC)") },
      { etiqueta: t("Remate en 10s"), valor: paso("Behind shot within 10s P30 (SC)"), base: equipoBase("Behind shot within 10s P30 (SC)") },
    ].filter((item) => Number.isFinite(item.valor));
  }, [fila, rows, report.team]);

  // Población de su posición: la misma que sostiene los percentiles de la
  // ficha, para que el punto del jugador caiga donde dice el percentil.
  const poblacion = useMemo(
    () => rows.filter((row) => String(row.Position ?? "").trim() && String(row["Minutes played"] ?? "") !== ""),
    [rows],
  );

  // Todas las aristas del perfil: una distribución por cada métrica que la
  // base permita, venga de Wyscout, StatsBomb o SkillCorner. Si una fuente no
  // está disponible simplemente no aporta filas, y el resto sigue igual.
  const swarms = useMemo(() => {
    const elegidas = [...report.metrics].sort((a, b) => b.percentile - a.percentile);
    return elegidas.map((metrica) => {
      const puntos: PuntoSwarm[] = poblacion.flatMap((row) => {
        const valor = numero(row[metrica.key]);
        if (!Number.isFinite(valor)) return [];
        const nombre = String(row.Player ?? "");
        return [{ valor, esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
      });
      return { metrica, puntos };
    }).filter((item) => item.puntos.some((punto) => punto.esObjetivo));
  }, [report.metrics, poblacion, report.player, report.team]);

  // Cuadrante volumen contra eficacia: el cruce que más dice de un perfil.
  const cuadrante = useMemo(() => {
    const volumen = destacadas[0] ?? report.metrics[0];
    const eficacia = report.metrics.find((metrica) => metrica.key !== volumen?.key && /%/.test(metrica.label))
      ?? report.metrics.find((metrica) => metrica.key !== volumen?.key);
    if (!volumen || !eficacia) return null;
    const puntos: PuntoCuadrante[] = poblacion.flatMap((row) => {
      const x = numero(row[volumen.key]); const y = numero(row[eficacia.key]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      const nombre = String(row.Player ?? "");
      return [{ x, y, nombre, esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
    });
    return puntos.some((punto) => punto.esObjetivo) ? { volumen, eficacia, puntos } : null;
  }, [destacadas, report.metrics, report.player, report.team, poblacion]);

  return <article className="context-page">
    <header>
      <div>
        <span>{t("CONTEXTO")}</span>
        <b>{report.player}</b>
        <small>{report.team} · {report.position} · {tf("frente a {n} jugadores de su posición", { n: report.cohortSize })}</small>
      </div>
      <div className="ctx-legend">
        {(["wyscout", "statsbomb", "skillcorner"] as const)
          .filter((fuente) => report.metrics.some((metrica) => (metrica.source ?? "wyscout") === fuente))
          .map((fuente) => <span key={fuente}><i style={{ background: METRIC_SOURCE_COLORS[fuente].color }} />{METRIC_SOURCE_COLORS[fuente].label}</span>)}
      </div>
    </header>

    <div className="ctx-grid">
      <section>
        <h3 className="ctx-good">{t("Donde destaca")}</h3>
        {destacadas.length
          ? <ul className="ctx-metrics">{destacadas.map((metrica) => <FilaMetrica key={metrica.key} metrica={metrica} contexto={contextos.get(metrica.key) ?? null} />)}</ul>
          : <p className="ctx-empty">{t("No supera el percentil 75 en ninguna métrica de su posición.")}</p>}
      </section>
      <section>
        <h3 className="ctx-bad">{t("Donde no")}</h3>
        {flojas.length
          ? <ul className="ctx-metrics">{flojas.map((metrica) => <FilaMetrica key={metrica.key} metrica={metrica} contexto={contextos.get(metrica.key) ?? null} />)}</ul>
          : <p className="ctx-empty">{t("No baja del percentil 25 en ninguna métrica de su posición.")}</p>}
      </section>
    </div>

    {(swarms.length > 0 || cuadrante) && <section className="ctx-charts">
      <h3>{t("Su lugar en la distribución")}</h3>
      <LeyendaGraficos equipo={report.team} />
      <div className="ctx-charts-grid">
        <div className="ctx-swarms">
          {swarms.map(({ metrica, puntos }) => (
            <SwarmMetric key={metrica.key} etiqueta={t(metrica.label)} puntos={puntos} percentil={metrica.percentile} fuente={metrica.source ?? "wyscout"} />
          ))}
        </div>
        {cuadrante && <CuadranteMetricas
          titulo={t("Volumen contra eficacia")}
          ejeX={t(cuadrante.volumen.label)}
          ejeY={t(cuadrante.eficacia.label)}
          puntos={cuadrante.puntos}
        />}
      </div>
    </section>}

    {embudo && embudo.length >= 3 && <section className="ctx-funnel-block">
      <h3>{t("Embudo de la ruptura a la espalda")}</h3>
      <p>{t("Cuántas hace, cuántas son peligrosas y cuántas le buscan sus compañeros. La marca es la mediana de su equipo: separa lo que hace el jugador de lo que su equipo hace con él.")}</p>
      <Embudo pasos={embudo} />
    </section>}

    <footer>{t("Percentiles contra jugadores de la misma posición en la base cargada. El puesto del equipo compara la mediana de cada club de la base.")}</footer>
  </article>;
}
