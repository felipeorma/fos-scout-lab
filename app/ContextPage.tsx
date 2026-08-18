"use client";

import { useEffect, useMemo, useState } from "react";
import type { DataRow, PlayerReport } from "@/lib/scouting";
import { METRIC_SOURCE_COLORS } from "@/lib/similarityMetricGroups";
import { t, tf } from "@/lib/i18n";
import { BarrasRanking, BarrasZ, CuadranteMetricas, LeyendaGraficos, SwarmMetric, type BarraRank, type BarraZ, type PuntoCuadrante, type PuntoSwarm } from "./ContextCharts";
import { CATALOGO, DEFINICIONES, type FichaContexto } from "./ContextCatalog";

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

const BLOQUES = [
  { id: "destacados", etiqueta: "Dónde destaca" },
  { id: "distribucion", etiqueta: "Distribución" },
  { id: "cuadrante", etiqueta: "Cuadrante" },
  { id: "presion", etiqueta: "Presión" },
  { id: "embudo", etiqueta: "Embudo de rupturas" },
] as const;

type BloqueId = string;

export type ControlesContexto = {
  equipos: string[];
  jugadores: Array<{ player: string; index: number }>;
  equipo: string;
  jugador: number;
  cohorte: string;
  minutos: number;
  onEquipo: (equipo: string) => void;
  onJugador: (indice: number) => void;
  onCohorte: (cohorte: string) => void;
  onMinutos: (minutos: number) => void;
};

export function ContextPage({ report, rows, controles }: { report: PlayerReport; rows: DataRow[]; controles?: ControlesContexto }) {
  // Qué visuales se muestran. Se recuerda entre sesiones: cada scout mira
  // cosas distintas y la hoja no debería obligar a todas.
  // Por defecto se muestran los bloques generales más las fichas que responden
  // al perfil del jugador. La elección se guarda POR PERFIL: un central y un
  // extremo no deberían compartir preferencia.
  const claveMemoria = `fos-scout-context-blocks-${report.cohort}`;
  const porDefecto = useMemo(() => [
    ...BLOQUES.map((bloque) => bloque.id as BloqueId),
    ...CATALOGO.filter((ficha) => !ficha.perfiles.length || ficha.perfiles.includes(report.cohort)).map((ficha) => ficha.id),
  ], [report.cohort, claveMemoria]);
  const [visibles, setVisibles] = useState<BloqueId[]>(porDefecto);
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(claveMemoria);
      setVisibles(guardado ? JSON.parse(guardado) as BloqueId[] : porDefecto);
    } catch { setVisibles(porDefecto); }
  }, [claveMemoria, porDefecto]);
  const alternar = (id: BloqueId) => {
    const siguiente = visibles.includes(id) ? visibles.filter((item) => item !== id) : [...visibles, id];
    setVisibles(siguiente);
    try { window.localStorage.setItem(claveMemoria, JSON.stringify(siguiente)); } catch { /* opcional */ }
  };
  // Filtro de plataforma: ver solo lo que aporta StatsBomb, solo SkillCorner,
  // o las dos. Útil para saber qué parte de la lectura depende de cada fuente.
  const [fuente, setFuente] = useState<"todas" | "statsbomb" | "skillcorner">("todas");
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem("fos-scout-context-source");
      if (guardado === "statsbomb" || guardado === "skillcorner" || guardado === "todas") setFuente(guardado);
    } catch { /* preferencia opcional */ }
  }, []);
  const cambiarFuente = (valor: "todas" | "statsbomb" | "skillcorner") => {
    setFuente(valor);
    try { window.localStorage.setItem("fos-scout-context-source", valor); } catch { /* opcional */ }
  };
  const encaja = (origen?: string) => fuente === "todas" || (origen ?? "wyscout") === fuente;
  /** Una ficha pertenece a la fuente de las columnas que usa; las mixtas salen en ambas. */
  const fichaEncaja = (ficha: FichaContexto) => {
    if (fuente === "todas") return true;
    const columnas = [ficha.ejeX, ficha.ejeY, ficha.campo, ...(ficha.campos ?? []).map((campo) => campo.columna)].filter(Boolean) as string[];
    if (!columnas.length) return true;
    const marca = fuente === "skillcorner" ? "(SC)" : "(SB)";
    return columnas.some((columna) => columna.includes(marca));
  };

  const muestra = (id: BloqueId) => visibles.includes(id);
  const recomendada = (ficha: FichaContexto) => ficha.perfiles.includes(report.cohort);

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
        return [{ valor, nombre, equipo: String(row.Team ?? ""), esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
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
      return [{ x, y, nombre, equipo: String(row.Team ?? ""), esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
    });
    return puntos.some((punto) => punto.esObjetivo) ? { volumen, eficacia, puntos } : null;
  }, [destacadas, report.metrics, report.player, report.team, poblacion]);

  // Perfil de presión: el eje de cinco de los "metric explainer". Volumen de
  // recepciones bajo presión contra lo que consigue hacer con ellas.
  const presion = useMemo(() => {
    const ejeX = "Receptions under pressure P30 (SC)";
    const ejeY = "Progressive under pressure P30 (SC)";
    if (!fila || !Number.isFinite(numero(fila[ejeX]))) return null;
    const puntos: PuntoCuadrante[] = poblacion.flatMap((row) => {
      const x = numero(row[ejeX]); const y = numero(row[ejeY]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
      const nombre = String(row.Player ?? "");
      return [{ x, y, nombre, equipo: String(row.Team ?? ""), esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
    });
    return puntos.some((punto) => punto.esObjetivo) ? puntos : null;
  }, [fila, poblacion, report.player, report.team]);

  // Fichas del catálogo que la base cargada permite dibujar. Las dos genéricas
  // —z-scores y ranking— se rellenan con las propias métricas del perfil.
  const fichas = useMemo(() => {
    const columnas = new Set(rows.length ? Object.keys(rows[0]) : []);
    const mejor = destacadas[0] ?? report.metrics[0];
    return CATALOGO.map((ficha): { ficha: FichaContexto; datos: unknown } | null => {
      const resuelta: FichaContexto = ficha.id === "zscores-perfil"
        ? { ...ficha, campos: report.metrics.slice(0, 10).map((metrica) => ({ columna: metrica.key, etiqueta: t(metrica.label) })) }
        : ficha.id === "ranking-liga" && mejor ? { ...ficha, campo: mejor.key, titulo: `${t(ficha.titulo)} · ${t(mejor.label)}` }
        : ficha;
      const necesarias = [...resuelta.requiere, ...(resuelta.ejeX ? [resuelta.ejeX] : []), ...(resuelta.ejeY ? [resuelta.ejeY] : []), ...(resuelta.campo ? [resuelta.campo] : [])];
      if (necesarias.some((columna) => !columnas.has(columna))) return null;

      if (resuelta.tipo === "cuadrante" && resuelta.ejeX && resuelta.ejeY) {
        const puntos: PuntoCuadrante[] = poblacion.flatMap((row) => {
          const x = numero(row[resuelta.ejeX!]); const y = numero(row[resuelta.ejeY!]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
          const nombre = String(row.Player ?? "");
          return [{ x, y, nombre, equipo: String(row.Team ?? ""), esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
        });
        return puntos.some((punto) => punto.esObjetivo) ? { ficha: resuelta, datos: puntos } : null;
      }
      if (resuelta.tipo === "ranking" && resuelta.campo) {
        const barras: BarraRank[] = poblacion.flatMap((row) => {
          const valor = numero(row[resuelta.campo!]);
          if (!Number.isFinite(valor)) return [];
          const nombre = String(row.Player ?? "");
          return [{ nombre, equipo: String(row.Team ?? ""), valor, esObjetivo: nombre === report.player, esCompanero: nombre !== report.player && String(row.Team ?? "") === report.team }];
        });
        return barras.some((barra) => barra.esObjetivo) ? { ficha: resuelta, datos: barras } : null;
      }
      if (resuelta.tipo === "zscores" && resuelta.campos?.length) {
        const barras: BarraZ[] = resuelta.campos.flatMap(({ columna, etiqueta }) => {
          if (!columnas.has(columna) || !fila) return [];
          const propio = numero(fila[columna]);
          const valores = poblacion.map((row) => numero(row[columna])).filter(Number.isFinite);
          if (!Number.isFinite(propio) || valores.length < 6) return [];
          const media = valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
          const desviacion = Math.sqrt(valores.reduce((suma, valor) => suma + (valor - media) ** 2, 0) / valores.length);
          if (desviacion < 1e-9) return [];
          return [{ etiqueta, z: (propio - media) / desviacion }];
        });
        return barras.length >= 3 ? { ficha: resuelta, datos: barras } : null;
      }
      return null;
    }).filter(Boolean) as Array<{ ficha: FichaContexto; datos: unknown }>;
  }, [rows, poblacion, fila, report, destacadas]);

  return <article className="context-page">
    {/* Los mismos filtros de la Página 01, sobre el mismo estado: cambiar aquí
        cambia el informe entero. Evita ir y volver de pestaña para comparar. */}
    {controles && <div className="ctx-controls">
      <label><span>{t("Equipo")}</span>
        <select value={controles.equipo} onChange={(event) => controles.onEquipo(event.target.value)}>
          {controles.equipos.map((equipo) => <option key={equipo || "__sin__"} value={equipo}>{equipo || t("Equipo no disponible")}</option>)}
        </select>
      </label>
      <label><span>{t("Jugador")}</span>
        <select value={controles.jugador} onChange={(event) => controles.onJugador(Number(event.target.value))}>
          {controles.jugadores.map((jugador) => <option key={`${jugador.player}-${jugador.index}`} value={jugador.index}>{jugador.player}</option>)}
        </select>
      </label>
      <label><span>{t("Cohorte")}</span>
        <select value={controles.cohorte} onChange={(event) => controles.onCohorte(event.target.value)}>
          <option value="AUTO">{t("Automática")}</option>
          <option value="GK">{t("Porteros")}</option>
          <option value="CB">{t("Centrales")}</option>
          <option value="FB">{t("Laterales")}</option>
          <option value="DMF">{t("Pivotes / mediocentros")}</option>
          <option value="B2B">{t("Interiores (box-to-box)")}</option>
          <option value="WING">{t("Extremos")}</option>
          <option value="DWING">{t("Extremos directos")}</option>
          <option value="AM">{t("Mediapuntas")}</option>
          <option value="CF">{t("Delanteros")}</option>
        </select>
      </label>
      <label><span>{t("Mín. minutos")}</span>
        <input type="number" min="0" step="100" value={controles.minutos} onChange={(event) => controles.onMinutos(Number(event.target.value))} />
      </label>
    </div>}
    <header>
      <div>
        <span>{t("CONTEXTO")}</span>
        <b>{report.player}</b>
        <small>{report.team} · {report.position} · {tf("frente a {n} jugadores de su posición", { n: report.cohortSize })}</small>
      </div>
      <div className="ctx-source" role="group" aria-label={t("Fuente de datos")}>
        {([["todas", t("Ambas")], ["statsbomb", METRIC_SOURCE_COLORS.statsbomb.label], ["skillcorner", METRIC_SOURCE_COLORS.skillcorner.label]] as const).map(([valor, etiqueta]) => (
          <button key={valor} type="button" className={fuente === valor ? "on" : ""}
            style={valor !== "todas" ? { "--fuente-color": METRIC_SOURCE_COLORS[valor].color } as React.CSSProperties : undefined}
            onClick={() => cambiarFuente(valor)}>{etiqueta}</button>
        ))}
      </div>
      <div className="ctx-picker" role="group" aria-label={t("Qué visualizar")}>
        {BLOQUES.map((bloque) => (
          <button key={bloque.id} type="button" className={muestra(bloque.id) ? "on" : ""} onClick={() => alternar(bloque.id)}>{t(bloque.etiqueta)}</button>
        ))}
        {[...fichas].filter(({ ficha }) => fichaEncaja(ficha)).sort((a, b) => Number(recomendada(b.ficha)) - Number(recomendada(a.ficha))).map(({ ficha }) => (
          <button key={ficha.id} type="button"
            className={`${muestra(ficha.id as BloqueId) ? "on" : ""}${recomendada(ficha) ? " sugerida" : ""}`}
            onClick={() => alternar(ficha.id as BloqueId)}
            title={`${ficha.articulo}${recomendada(ficha) ? " · " + t("recomendada para este perfil") : ""}`}>
            {recomendada(ficha) && <i aria-hidden="true">★</i>}{t(ficha.titulo)}
          </button>
        ))}
      </div>
      <div className="ctx-legend">
        {(["wyscout", "statsbomb", "skillcorner"] as const)
          .filter((fuente) => report.metrics.some((metrica) => (metrica.source ?? "wyscout") === fuente))
          .map((fuente) => <span key={fuente}><i style={{ background: METRIC_SOURCE_COLORS[fuente].color }} />{METRIC_SOURCE_COLORS[fuente].label}</span>)}
      </div>
    </header>

    {muestra("destacados") && <div className="ctx-grid">
      <section>
        <h3 className="ctx-good">{t("Donde destaca")}</h3>
        {destacadas.length
          ? <ul className="ctx-metrics">{destacadas.filter((metrica) => encaja(metrica.source)).map((metrica) => <FilaMetrica key={metrica.key} metrica={metrica} contexto={contextos.get(metrica.key) ?? null} />)}</ul>
          : <p className="ctx-empty">{t("No supera el percentil 75 en ninguna métrica de su posición.")}</p>}
      </section>
      <section>
        <h3 className="ctx-bad">{t("Donde no")}</h3>
        {flojas.length
          ? <ul className="ctx-metrics">{flojas.filter((metrica) => encaja(metrica.source)).map((metrica) => <FilaMetrica key={metrica.key} metrica={metrica} contexto={contextos.get(metrica.key) ?? null} />)}</ul>
          : <p className="ctx-empty">{t("No baja del percentil 25 en ninguna métrica de su posición.")}</p>}
      </section>
    </div>}

    {(muestra("distribucion") || muestra("cuadrante")) && (swarms.length > 0 || cuadrante) && <section className="ctx-charts">
      <h3>{t("Su lugar en la distribución")}</h3>
      <LeyendaGraficos equipo={report.team} />
      <div className="ctx-charts-grid">
        {muestra("distribucion") && <div className="ctx-swarms">
          {swarms.map(({ metrica, puntos }) => (
            encaja(metrica.source) ? <SwarmMetric key={metrica.key} etiqueta={t(metrica.label)} puntos={puntos} percentil={metrica.percentile} fuente={metrica.source ?? "wyscout"} /> : null
          ))}
        </div>}
        {muestra("cuadrante") && cuadrante && <CuadranteMetricas
          titulo={t("Volumen contra eficacia")}
          ejeX={t(cuadrante.volumen.label)}
          ejeY={t(cuadrante.eficacia.label)}
          puntos={cuadrante.puntos}
        />}
      </div>
    </section>}

    {fichas.some(({ ficha }) => muestra(ficha.id as BloqueId) && fichaEncaja(ficha)) && <section className="ctx-catalog-block">
      <h3>{t("Análisis de los artículos de SkillCorner")}</h3>
      <div className="ctx-catalog">
        {fichas.filter(({ ficha }) => muestra(ficha.id as BloqueId) && fichaEncaja(ficha)).map(({ ficha, datos }) => (
          <section key={ficha.id}>
            <h4>{t(ficha.titulo)}</h4>
            <p>{t(ficha.lectura)}</p>
            {ficha.tipo === "cuadrante" && <CuadranteMetricas titulo="" ejeX={t(ficha.etiquetaX ?? "")} ejeY={t(ficha.etiquetaY ?? "")} puntos={datos as PuntoCuadrante[]} />}
            {ficha.tipo === "ranking" && <BarrasRanking titulo="" unidad={ficha.unidad} barras={datos as BarraRank[]} />}
            {ficha.tipo === "zscores" && <BarrasZ titulo="" barras={datos as BarraZ[]} />}
          </section>
        ))}
      </div>
    </section>}

    {muestra("presion") && presion && <section className="ctx-pressure">
      <h3>{t("Perfil de presión")}</h3>
      <p>{t("Cuántos balones recibe bajo presión intensa y cuántos consigue progresar. Es el eje que separa a quien juega cómodo de quien resuelve incómodo.")}</p>
      <CuadranteMetricas titulo={t("Bajo presión intensa")} ejeX={t("Recepciones bajo presión")} ejeY={t("Progresiones bajo presión")} puntos={presion} />
    </section>}

    {muestra("embudo") && embudo && embudo.length >= 3 && <section className="ctx-funnel-block">
      <h3>{t("Embudo de la ruptura a la espalda")}</h3>
      <p>{t("Cuántas hace, cuántas son peligrosas y cuántas le buscan sus compañeros. La marca es la mediana de su equipo: separa lo que hace el jugador de lo que su equipo hace con él.")}</p>
      <Embudo pasos={embudo} />
    </section>}

    {(() => {
      // Solo las métricas que el scout tiene delante: un glosario completo
      // sería ruido, y uno ausente obliga a saberse la nomenclatura.
      const enPantalla = new Set<string>();
      for (const metrica of [...destacadas, ...flojas]) enPantalla.add(metrica.key);
      if (muestra("distribucion")) for (const { metrica } of swarms) enPantalla.add(metrica.key);
      for (const { ficha } of fichas) {
        if (!muestra(ficha.id as BloqueId)) continue;
        for (const columna of [ficha.ejeX, ficha.ejeY, ficha.campo, ...(ficha.campos ?? []).map((campo) => campo.columna)]) {
          if (columna) enPantalla.add(columna);
        }
      }
      const glosario = [...enPantalla].filter((columna) => DEFINICIONES[columna]).sort();
      if (!glosario.length) return null;
      return <section className="ctx-glossary">
        <h3>{t("Qué mide cada métrica")}</h3>
        <dl>
          {glosario.map((columna) => <div key={columna}>
            <dt>{t(columna)}</dt>
            <dd>{t(DEFINICIONES[columna])}</dd>
          </div>)}
        </dl>
      </section>;
    })()}

    <footer>{t("Percentiles contra jugadores de la misma posición en la base cargada. El puesto del equipo compara la mediana de cada club de la base.")}</footer>
  </article>;
}
