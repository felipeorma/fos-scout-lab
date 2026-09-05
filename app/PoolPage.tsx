"use client";

import { useEffect, useMemo, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { aggregateDatasets, extractSeason, type DataRow, type SourceDataset } from "@/lib/scouting";
import { buildSimilaritySearch, similarityOptions, type SimilarityFilters } from "@/lib/similarity";
import {
  fetchSkillcornerCompetitions,
  fetchSkillcornerDataset,
  fetchStatsbombCompetitions,
  fetchStatsbombDataset,
  type ApiCompetition,
} from "@/lib/remoteData";

/**
 * Buscador entre ligas.
 *
 * Las demás pantallas trabajan sobre una base cargada. Esta arma un fondo con
 * varias competiciones de la API a la vez y busca ahí dentro: "quién se parece
 * a este jugador en cualquiera de las ligas que tenemos".
 *
 * Dos cuidados que no son cosméticos:
 *
 * - **Una sola temporada.** Comparar un 2024 con un 2026 mezcla al jugador con
 *   su propia evolución, así que la temporada se elige primero y solo entran
 *   las competiciones que la tienen.
 * - **Cobertura desigual.** No todas las ligas traen las mismas métricas: unas
 *   tienen game intelligence de SkillCorner y otras no. El motor descarta por
 *   candidato las métricas que le faltan, y aquí se muestra el porcentaje de
 *   cobertura de cada uno para que un 95% con tres métricas no se lea igual
 *   que un 88% con doce.
 *
 * Lo que esta pantalla NO hace: ajustar por nivel de liga. Un 90 en Ligue 3 no
 * es un 90 en la MLS, y el descuento por rating de Opta que usa la mesa de
 * Maldonado está atado a sus seis ligas. Por eso la liga de cada candidato va
 * en su propia columna, bien visible, en vez de esconderse en un promedio.
 */


/**
 * Parecido corregido por cobertura.
 *
 * Sin esto el buscador miente de forma sistemática. Un candidato de una liga
 * con pocas métricas se compara en menos dimensiones, y menos dimensiones son
 * menos ocasiones de diferir: en una prueba con dos ligas idénticas salvo por
 * la cobertura, los de la liga pobre salían al 100% con 67% de cobertura, por
 * encima de los de la liga rica que coincidían en todo al 96%. El buscador
 * empujaba hacia las ligas de las que menos se sabe, que es justo lo contrario
 * de lo que uno quiere al fichar.
 *
 * La corrección es un encogimiento hacia la media: el parecido de un candidato
 * pesa según cuántas métricas lo sostienen, y lo que falta se rellena con el
 * parecido medio del conjunto. Con cobertura completa no cambia nada; con
 * media docena de métricas el número se acerca a la media hasta que haya
 * evidencia que lo separe de ella.
 */
const METRICAS_PARA_CONFIAR = 8;

function conCobertura<T extends { similarity: number; coverage: number }>(candidatos: T[], totalMetricas: number) {
  if (!candidatos.length) return [];
  const media = candidatos.reduce((suma, c) => suma + c.similarity, 0) / candidatos.length;
  return candidatos.map((candidato) => {
    const usadas = Math.max(0, Math.round((candidato.coverage / 100) * totalMetricas));
    const ajustado = (usadas * candidato.similarity + METRICAS_PARA_CONFIAR * media) / (usadas + METRICAS_PARA_CONFIAR);
    return { ...candidato, ajustado: Math.round(ajustado) };
  }).sort((a, b) => b.ajustado - a.ajustado || b.coverage - a.coverage);
}

type Fuente = "statsbomb" | "skillcorner";

/** La temporada tal como la nombra cada plataforma ("2026", "2025/2026"). */
function temporadasDe(competiciones: ApiCompetition[]) {
  return [...new Set(competiciones.map((c) => String(c.season ?? "")).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

function claveDe(fuente: Fuente, competicion: ApiCompetition) {
  return fuente === "statsbomb"
    ? `sb:${competicion.competition_id}:${competicion.season_id}`
    : `sc:${competicion.id}`;
}

export function PoolPage({ baseCargada, onSelectPlayer }: {
  /** La base del informe, para poder buscar parecidos a un jugador propio. */
  baseCargada?: { nombre: string; rows: DataRow[] } | null;
  onSelectPlayer?: (indice: number) => void;
}) {
  const [fuente, setFuente] = useState<Fuente>("statsbomb");
  const [competiciones, setCompeticiones] = useState<Record<Fuente, ApiCompetition[]>>({ statsbomb: [], skillcorner: [] });
  const [temporada, setTemporada] = useState("");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [incluirBase, setIncluirBase] = useState(true);

  const [fondo, setFondo] = useState<DataRow[] | null>(null);
  const [progreso, setProgreso] = useState("");
  const [cargando, setCargando] = useState(false);
  const [fallos, setFallos] = useState<string[]>([]);

  const [objetivo, setObjetivo] = useState(-1);
  const [busqueda, setBusqueda] = useState("");
  const [minutosMin, setMinutosMin] = useState(600);
  const [edadMax, setEdadMax] = useState(0);
  const [posicion, setPosicion] = useState("");

  useEffect(() => {
    let montado = true;
    void Promise.all([
      fetchStatsbombCompetitions().catch(() => [] as ApiCompetition[]),
      fetchSkillcornerCompetitions().catch(() => [] as ApiCompetition[]),
    ]).then(([sb, sc]) => {
      if (!montado) return;
      setCompeticiones({ statsbomb: sb, skillcorner: sc });
      if (!sb.length && !sc.length) setProgreso(t("El servidor local no está corriendo. Arranca npm run bg:server y recarga."));
    });
    return () => { montado = false; };
  }, []);

  const disponibles = competiciones[fuente];
  const temporadas = useMemo(() => temporadasDe(disponibles), [disponibles]);

  // Al cambiar de plataforma o temporada, la selección anterior deja de valer.
  // Se abre en la temporada del año en curso, no en la primera del listado:
  // esa es la siguiente, que aún no se ha jugado y daría un fondo vacío.
  useEffect(() => {
    if (!temporadas.length) return;
    const anio = String(new Date().getFullYear());
    const enCurso = temporadas.find((x) => x.includes(anio)) ?? temporadas[temporadas.length - 1];
    setTemporada((actual) => (temporadas.includes(actual) ? actual : enCurso));
  }, [temporadas]);

  const deLaTemporada = useMemo(
    () => disponibles.filter((c) => String(c.season ?? "") === temporada),
    [disponibles, temporada],
  );

  useEffect(() => {
    setElegidas(deLaTemporada.map((c) => claveDe(fuente, c)));
    setFondo(null);
    setObjetivo(-1);
  }, [deLaTemporada, fuente]);

  function alternar(clave: string) {
    setElegidas((actuales) => actuales.includes(clave)
      ? actuales.filter((x) => x !== clave)
      : [...actuales, clave]);
  }

  async function armarFondo() {
    const seleccion = deLaTemporada.filter((c) => elegidas.includes(claveDe(fuente, c)));
    if (!seleccion.length) return;
    setCargando(true);
    setFallos([]);
    setFondo(null);
    setObjetivo(-1);

    const bases: SourceDataset[] = [];
    const problemas: string[] = [];
    if (incluirBase && baseCargada?.rows.length) {
      bases.push({
        fileName: baseCargada.nombre,
        season: extractSeason(temporada),
        headers: Object.keys(baseCargada.rows[0]),
        rows: baseCargada.rows,
        provider: "wyscout",
      });
    }

    for (let i = 0; i < seleccion.length; i += 1) {
      const competicion = seleccion[i];
      setProgreso(tf("{n} de {total} · {liga}", { n: i + 1, total: seleccion.length, liga: competicion.name }));
      try {
        bases.push(fuente === "statsbomb"
          ? await fetchStatsbombDataset(competicion)
          : await fetchSkillcornerDataset(competicion));
      } catch (error) {
        problemas.push(`${competicion.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      if (!bases.length) throw new Error(t("Ninguna competición devolvió jugadores."));
      const combinado = aggregateDatasets(bases);
      setFondo(combinado.rows);
      setProgreso(tf("{j} jugadores de {n} competiciones.", { j: combinado.rows.length, n: bases.length }));
    } catch (error) {
      setProgreso(error instanceof Error ? error.message : String(error));
    } finally {
      setFallos(problemas);
      setCargando(false);
    }
  }

  const opciones = useMemo(() => (fondo ? similarityOptions(fondo) : null), [fondo]);

  const candidatosObjetivo = useMemo(() => {
    if (!fondo || !busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    return fondo
      .map((fila, indice) => ({ indice, nombre: String(fila.Player ?? ""), equipo: String(fila.Team ?? "") }))
      .filter((x) => x.nombre.toLowerCase().includes(q))
      .slice(0, 20);
  }, [fondo, busqueda]);

  const resultado = useMemo(() => {
    if (!fondo || objetivo < 0) return null;
    const filtros: SimilarityFilters = {
      query: "", position: posicion, secondaryRole: "", side: "", passport: "",
      minimumMinutes: minutosMin,
      ageMin: null, ageMax: edadMax > 0 ? edadMax : null,
    };
    return buildSimilaritySearch(fondo, objetivo, filtros);
  }, [fondo, objetivo, posicion, minutosMin, edadMax]);

  const nombreObjetivo = objetivo >= 0 && fondo ? String(fondo[objetivo].Player ?? "") : "";
  const ordenados = useMemo(
    () => (resultado ? conCobertura(resultado.candidates, resultado.target.metrics.length) : []),
    [resultado],
  );

  return <section className="pool-page">
    <header>
      <h2>{t("Buscador entre ligas")}</h2>
      <p>{t("Arma un fondo con varias competiciones de la API y busca dentro: quién se parece a un jugador, en cualquiera de las ligas contratadas. Una sola temporada por búsqueda, porque comparar dos años distintos mezcla al jugador con su propia evolución.")}</p>
    </header>

    {/* ---- 1. Qué entra en el fondo ---- */}
    <div className="pool-setup">
      <div className="pool-row">
        <label><span>{t("Plataforma")}</span>
          <select value={fuente} onChange={(event) => setFuente(event.target.value as Fuente)}>
            <option value="statsbomb">StatsBomb</option>
            <option value="skillcorner">SkillCorner</option>
          </select>
        </label>
        <label><span>{t("Temporada")}</span>
          <select value={temporada} onChange={(event) => setTemporada(event.target.value)}>
            {temporadas.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <button type="button" className="pool-load" disabled={cargando || !elegidas.length} onClick={() => void armarFondo()}>
          {cargando ? t("Armando el fondo…") : tf("Cargar {n} competiciones", { n: elegidas.length })}
        </button>
      </div>

      {deLaTemporada.length > 0 && <div className="pool-ligas">
        {deLaTemporada.map((competicion) => {
          const clave = claveDe(fuente, competicion);
          return <button
            key={clave}
            type="button"
            className={elegidas.includes(clave) ? "on" : ""}
            onClick={() => alternar(clave)}
          >
            {competicion.name}{competicion.country ? <small>{competicion.country}</small> : null}
          </button>;
        })}
      </div>}

      {baseCargada?.rows.length ? <label className="pool-incluir">
        <input type="checkbox" checked={incluirBase} onChange={(event) => setIncluirBase(event.target.checked)} />
        <span>{tf("Incluir la base cargada ({n} jugadores) para poder buscar parecidos a un jugador propio", { n: baseCargada.rows.length })}</span>
      </label> : null}

      {progreso && <p className="pool-estado">{progreso}</p>}
      {fallos.length > 0 && <ul className="pool-fallos">
        {fallos.map((x) => <li key={x}>{x}</li>)}
      </ul>}
    </div>

    {/* ---- 2. A quién nos parecemos ---- */}
    {fondo && <div className="pool-buscar">
      <label><span>{t("Jugador de referencia")}</span>
        <input value={busqueda} placeholder={t("Escribe un nombre…")} onChange={(event) => setBusqueda(event.target.value)} />
      </label>
      {candidatosObjetivo.length > 0 && <div className="pool-sugerencias">
        {candidatosObjetivo.map((x) => (
          <button key={x.indice} type="button" className={x.indice === objetivo ? "on" : ""}
            onClick={() => { setObjetivo(x.indice); setBusqueda(x.nombre); }}>
            {x.nombre}<small>{x.equipo}</small>
          </button>
        ))}
      </div>}

      <div className="pool-filtros">
        <label><span>{t("Posición")}</span>
          <select value={posicion} onChange={(event) => setPosicion(event.target.value)}>
            <option value="">{t("La del jugador")}</option>
            {(opciones?.positions ?? []).map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
        </label>
        <label><span>{t("Mín. minutos")}</span>
          <input type="number" min="0" step="100" value={minutosMin} onChange={(event) => setMinutosMin(Number(event.target.value))} />
        </label>
        <label><span>{t("Edad máxima")}</span>
          <input type="number" min="0" max="45" value={edadMax || ""} placeholder="—" onChange={(event) => setEdadMax(Number(event.target.value))} />
        </label>
      </div>
    </div>}

    {/* ---- 3. Resultado ---- */}
    {resultado && <div className="pool-resultado">
      <h3>{tf("Se parecen a {jugador}", { jugador: nombreObjetivo })} <i>{resultado.candidates.length}</i></h3>
      <p>{t("El parecido está corregido por cobertura: con pocas métricas en común el número se acerca a la media del conjunto hasta que haya evidencia que lo separe. Sin esa corrección los jugadores de ligas con menos datos salían primeros solo por compararse en menos dimensiones. La columna Bruto es el parecido sin corregir.")}</p>
      <table>
        <thead><tr>
          <th>#</th><th>{t("Jugador")}</th><th>{t("Equipo")}</th>
          <th>{t("Edad")}</th><th>{t("Min")}</th><th>{t("Parecido")}</th><th>{t("Bruto")}</th><th>{t("Cobertura")}</th>
        </tr></thead>
        <tbody>
          {ordenados.slice(0, 40).map((candidato, posicionEnLista) => (
            <tr key={`${candidato.name}-${candidato.team}-${posicionEnLista}`}
              className={onSelectPlayer ? "clicable" : ""}
              onClick={() => onSelectPlayer?.(candidato.index)}>
              <td>{posicionEnLista + 1}</td>
              <td className="pool-name">{candidato.name}</td>
              <td>{candidato.team}</td>
              <td>{candidato.age ?? "—"}</td>
              <td>{Math.round(candidato.minutes)}</td>
              <td><b>{candidato.ajustado}%</b></td>
              <td className="pool-crudo">{candidato.similarity}%</td>
              <td className={candidato.coverage < 60 ? "pool-cobertura baja" : "pool-cobertura"}>{candidato.coverage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pool-aviso">
        {t("No se ajusta por nivel de liga: un parecido alto con un jugador de una competición más débil no significa que rinda igual aquí. Mira siempre de qué liga viene.")}
      </p>
    </div>}
  </section>;
}
