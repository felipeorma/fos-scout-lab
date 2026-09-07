"use client";

import { useMemo, useState } from "react";
import { type DataRow, type SourceDataset } from "@/lib/scouting";
import { ligasDeBases, origenPorFila } from "@/lib/procedencia";
import { rankingDeCohorte } from "@/lib/ranking";
import { t, tf } from "@/lib/i18n";
import { rankingPorArquetipo } from "@/lib/arquetipos";

/**
 * Ranking de la base por posición.
 *
 * La página de contexto responde "¿cómo está este jugador?"; esta responde la
 * pregunta de antes: "¿quién es el mejor de cada puesto en lo que tengo
 * cargado?". Por eso no depende del jugador seleccionado —se elige la posición
 * y punto— y por eso convive el índice global con los arquetipos: el índice
 * ordena por nivel, el arquetipo ordena por tipo de jugador.
 *
 * No sustituye a la mesa de Maldonado: aquella usa el mapa de posiciones del
 * club y su propia detección de liga. Esta es genérica y sirve para cualquier
 * base cargada.
 */

const PERFILES = [
  { id: "GK", nombre: "Porteros" },
  { id: "CB", nombre: "Centrales" },
  { id: "FB", nombre: "Laterales" },
  { id: "DMF", nombre: "Pivotes / mediocentros" },
  { id: "B2B", nombre: "Interiores (box-to-box)" },
  { id: "WING", nombre: "Extremos" },
  { id: "DWING", nombre: "Extremos directos" },
  { id: "AM", nombre: "Mediapuntas" },
  { id: "CF", nombre: "Delanteros" },
];


/**
 * Cuántos pares hacen falta para que un percentil signifique algo.
 *
 * Con diez jugadores en la posición, cada uno queda a diez puntos de
 * percentil del siguiente por pura aritmética: el número separa por el
 * tamaño de la muestra, no por el rendimiento. Por debajo de cinco deja de
 * informar del todo — un percentil 25 con cuatro jugadores solo dice "es el
 * penúltimo".
 *
 * No se ocultan los números: en una liga chica a veces son lo único que hay,
 * y esconderlos rompería un flujo real. Se avisa de lo que valen.
 */
const COHORTE_FIABLE = 10;
const COHORTE_MINIMA = 5;


export function RankingPage({ rows, bases = [], minimumMinutes, onSelectPlayer }: {
  rows: DataRow[];
  /** Las bases que se cruzaron, para poder filtrar por liga y por año. */
  bases?: SourceDataset[];
  minimumMinutes: number;
  onSelectPlayer?: (indice: number) => void;
}) {
  const [perfil, setPerfil] = useState("CF");
  const [minutosMin, setMinutosMin] = useState(minimumMinutes);
  const [edadMax, setEdadMax] = useState(0);
  const [equipo, setEquipo] = useState("TODOS");
  const [pasaporte, setPasaporte] = useState("TODOS");
  const [vista, setVista] = useState<"indice" | "arquetipos">("indice");
  const [liga, setLiga] = useState("TODAS");
  const [anio, setAnio] = useState(0);

  /*
   * Liga y año filtran DESPUÉS del índice, igual que el equipo y el pasaporte
   * que tienen al lado. El número que se ve sigue siendo el percentil contra
   * todos los jugadores de esa posición en lo que hay cargado, no contra los
   * de la liga elegida: mirar la Ligue 3 sola y ver un 90 recalculado contra
   * la propia Ligue 3 diría algo muy distinto de un 90 contra dieciséis ligas,
   * y esto último es lo que sirve para fichar. Estrechan a quién ves, no cómo
   * se le mide.
   */
  const procedencias = useMemo(() => ligasDeBases(bases), [bases]);
  const origenes = useMemo(
    () => (procedencias.length > 1 ? origenPorFila(rows, procedencias) : null),
    [rows, procedencias],
  );
  const ligas = useMemo(
    () => [...new Set(procedencias.map((x) => x.liga))].sort((a, b) => a.localeCompare(b, "es")),
    [procedencias],
  );
  const anios = useMemo(
    () => [...new Set(procedencias.map((x) => x.anio).filter(Boolean))].sort(),
    [procedencias],
  );

  // El informe completo es caro: se calcula una vez por perfil y minutos, y
  // los filtros de edad y equipo se aplican después sobre el resultado.
  // El informe completo es caro: se calcula una vez por perfil y minutos, y
  // los filtros de edad y equipo se aplican después sobre el resultado.
  const todos = useMemo(() => rankingDeCohorte(rows, perfil, minutosMin), [rows, perfil, minutosMin]);

  const equipos = useMemo(
    () => [...new Set(todos.map((fila) => fila.equipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [todos],
  );

  // La lista sale de los jugadores de esta posición, no de la base entera:
  // ofrecer pasaportes que no tiene ningún central al mirar centrales sobra.
  const pasaportes = useMemo(
    () => [...new Set(todos.flatMap((fila) => fila.pasaportes).filter((x) => x && x !== "—"))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [todos],
  );

  const visibles = useMemo(() => todos.filter((fila) => (
    (equipo === "TODOS" || fila.equipo === equipo)
    && (pasaporte === "TODOS" || fila.pasaportes.includes(pasaporte))
    && (liga === "TODAS" || Boolean(origenes?.[fila.indice]?.ligas.includes(liga)))
    && (!anio || Boolean(origenes?.[fila.indice]?.anios.includes(anio)))
    && (edadMax <= 0 || (Number.isFinite(fila.edad) && fila.edad <= edadMax))
  )), [todos, equipo, pasaporte, edadMax, liga, anio, origenes]);

  const arquetipos = useMemo(
    () => (vista === "arquetipos" ? rankingPorArquetipo(rows, perfil, minutosMin) : []),
    [vista, rows, perfil, minutosMin],
  );

  const maximo = visibles[0]?.puntuacion ?? 100;
  /* El aviso solo cuando la cobertura es desigual de verdad: si toda la base
     viene de la misma plataforma, el ajuste no mueve a nadie y explicarlo
     sería ruido. */
  const hayCoberturaDesigual = useMemo(() => {
    if (todos.length < 2) return false;
    const metricas = todos.map((fila) => fila.metricas);
    return Math.max(...metricas) - Math.min(...metricas) >= 3;
  }, [todos]);

  return <section className="rank-page">
    <header>
      <div>
        <span>{t("RANKING DE LA BASE")}</span>
        <h2>{t("Los mejores de cada puesto")}</h2>
        <p>{t("Quién encabeza cada posición en lo que tienes cargado. El índice parte del percentil medio contra los jugadores de su misma posición y lo acerca a sus tres mejores métricas: destacar en algo cuenta, y no solo ser correcto en todo. Haz clic en cualquiera para abrir su informe.")}</p>
      </div>
      <b>{tf("{n} jugadores", { n: visibles.length })}</b>
    </header>

    <div className="rank-filters">
      <label><span>{t("Posición")}</span>
        <select value={perfil} onChange={(event) => setPerfil(event.target.value)}>
          {PERFILES.map((item) => <option key={item.id} value={item.id}>{t(item.nombre)}</option>)}
        </select>
      </label>
      <label><span>{t("Equipo")}</span>
        <select value={equipo} onChange={(event) => setEquipo(event.target.value)}>
          <option value="TODOS">{t("Todos")}</option>
          {equipos.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
        </select>
      </label>
      <label><span>{t("Pasaporte")}</span>
        <select value={pasaporte} disabled={!pasaportes.length} onChange={(event) => setPasaporte(event.target.value)}>
          {pasaportes.length
            ? <>
              <option value="TODOS">{t("Todos")}</option>
              {pasaportes.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
            </>
            : <option value="TODOS">{t("La base no trae nacionalidad")}</option>}
        </select>
      </label>
      {ligas.length > 1 && <label><span>{t("Liga")}</span>
        <select value={liga} onChange={(event) => setLiga(event.target.value)}>
          <option value="TODAS">{t("Todas")}</option>
          {ligas.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
        </select>
      </label>}
      {anios.length > 1 && <label><span>{t("Año")}</span>
        <select value={anio || ""} onChange={(event) => setAnio(Number(event.target.value))}>
          <option value="">{t("Todos")}</option>
          {anios.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>}
      <label><span>{t("Mín. minutos")}</span>
        <input type="number" min="0" step="100" value={minutosMin} onChange={(event) => setMinutosMin(Number(event.target.value))} />
      </label>
      <label><span>{t("Edad máxima")}</span>
        <input type="number" min="0" max="45" value={edadMax || ""} placeholder="—" onChange={(event) => setEdadMax(Number(event.target.value))} />
      </label>
      <div className="rank-tabs">
        <button type="button" className={vista === "indice" ? "on" : ""} onClick={() => setVista("indice")}>{t("Por índice")}</button>
        <button type="button" className={vista === "arquetipos" ? "on" : ""} onClick={() => setVista("arquetipos")}>{t("Por arquetipo")}</button>
      </div>
    </div>

    {hayCoberturaDesigual && <p className="rank-cobertura">
      {t("El índice está corregido por cobertura: no todas las ligas traen las mismas métricas —sólo algunas tienen SkillCorner encima— y quien se mide con menos da un número más inestable, que asomaba en la cima más de lo que le tocaba. El ajuste acerca a la media a quien se apoya en poco, hasta que haya con qué separarlo de ella. El número pequeño de al lado es el índice sin corregir.")}
    </p>}

    {todos.length > 0 && todos.length < COHORTE_FIABLE && (
      <p className={todos.length < COHORTE_MINIMA ? "rank-muestra grave" : "rank-muestra"}>
        {todos.length < COHORTE_MINIMA
          ? tf("Solo {n} jugadores de esta posición pasan el filtro de minutos. Los percentiles no dicen nada con una muestra así: el índice ordena, pero no mide. Baja el mínimo de minutos o carga más ligas.", { n: todos.length })
          : tf("{n} jugadores en esta posición. Con menos de diez, cada uno queda a diez puntos de percentil del siguiente por aritmética, no por rendimiento: sirve para ordenar, no para comparar con otra base.", { n: todos.length })}
      </p>
    )}

    {!visibles.length && <p className="rank-empty">
      {t("Ningún jugador de esa posición pasa los filtros. Baja el mínimo de minutos o quita el tope de edad.")}
    </p>}

    {vista === "indice" && visibles.length > 0 && <ol className="rank-list">
      {visibles.slice(0, 40).map((fila, posicion) => (
        <li
          key={fila.indice}
          className={onSelectPlayer ? "clicable" : ""}
          onClick={() => onSelectPlayer?.(fila.indice)}
        >
          <span className="rank-pos">{posicion + 1}</span>
          <span className="rank-nombre">
            {fila.jugador}
            <small>{fila.equipo}{Number.isFinite(fila.edad) ? ` · ${fila.edad}` : ""}{fila.minutos ? ` · ${Math.round(fila.minutos)}′` : ""}</small>
          </span>
          <i className="rank-barra"><em style={{ width: `${Math.max(2, (fila.puntuacion / maximo) * 100)}%` }} /></i>
          <b>{fila.puntuacion}<u title={tf("Índice sin corregir: {c} · calculado con {m} métricas", { c: fila.puntuacionCruda, m: fila.metricas })}>{fila.puntuacionCruda}</u></b>
          <span className="rank-flags">
            {fila.destacadas.length
              ? fila.destacadas.map((metrica) => <em key={metrica.label}>{t(metrica.label)} <u>P{metrica.percentile}</u></em>)
              : <span className="rank-sin">—</span>}
          </span>
        </li>
      ))}
    </ol>}

    {vista === "arquetipos" && (arquetipos.length > 0 ? <div className="rank-arq-grid">
      {arquetipos.map((ranking) => (
        <div key={ranking.arquetipo.id} className="rank-arq-card">
          <h3>{t(ranking.arquetipo.nombre)}</h3>
          <p>{t(ranking.arquetipo.resumen)}</p>
          <ol>
            {ranking.jugadores
              .filter((jugador) => (
                (equipo === "TODOS" || jugador.equipo === equipo)
                && (pasaporte === "TODOS" || jugador.pasaportes.includes(pasaporte))
                && (liga === "TODAS" || Boolean(origenes?.[jugador.indice]?.ligas.includes(liga)))
                && (!anio || Boolean(origenes?.[jugador.indice]?.anios.includes(anio)))
                && (edadMax <= 0 || (Number.isFinite(jugador.edad) && jugador.edad <= edadMax))
              ))
              .slice(0, 10)
              .map((jugador, posicion) => (
                <li key={jugador.indice} onClick={() => onSelectPlayer?.(jugador.indice)}
                  title={jugador.detalle.map((d) => `${t(d.etiqueta)}: P${d.percentil}`).join("\n")}>
                  <span className="rank-pos">{posicion + 1}</span>
                  <span className="rank-nombre">{jugador.nombre}<small>{jugador.equipo}{Number.isFinite(jugador.edad) ? ` · ${jugador.edad}` : ""}</small></span>
                  <i className="rank-barra"><em style={{ width: `${Math.max(2, jugador.ajuste)}%` }} /></i>
                  <b>{jugador.ajuste}</b>
                </li>
              ))}
          </ol>
          <small className="rank-arq-metricas">
            {tf("Mide: {lista}.", { lista: ranking.disponibles.map((etiqueta) => t(etiqueta).toLowerCase()).join(", ") })}
          </small>
        </div>
      ))}
    </div> : <p className="rank-empty">
      {t("Esta posición no tiene arquetipos, o la base no trae las métricas de SkillCorner que necesitan. Carga datos de SkillCorner desde Conectar API para verlos.")}
    </p>)}
  </section>;
}
