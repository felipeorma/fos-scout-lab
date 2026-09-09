"use client";

import { useMemo, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { encogerHaciaLaMedia } from "@/lib/cobertura";
import { positionSides } from "@/lib/positions";
import { buildSimilaritySearch, type SimilarityFilters } from "@/lib/similarity";
import { useBaseActiva } from "./BaseActiva";
import { BarraDeFiltros } from "./BarraDeFiltros";
import { Paso } from "./Paso";
import { BotonExportar } from "./BotonExportar";

/**
 * Buscador entre ligas: quién se parece a este jugador en todo lo cargado.
 *
 * Antes esta pantalla montaba su PROPIO fondo. Tenía su lista de
 * competiciones, sus peticiones y su cruce, de modo que las mismas ligas se
 * descargaban dos veces —una para el informe y otra para aquí— sin enterarse
 * la una de la otra, y lo que veías dependía de en qué pestaña lo hubieras
 * cargado. Ahora trabaja sobre la base activa, como todas las demás: cargar
 * ligas se hace en un solo sitio.
 *
 * Lo que esta pantalla NO hace: ajustar por nivel de liga. Un 90 en Ligue 3 no
 * es un 90 en la MLS. Por eso la liga de cada candidato va en su columna, bien
 * visible, en vez de esconderse en un promedio.
 */

/**
 * Parecido corregido por cobertura.
 *
 * Sin esto el buscador miente de forma sistemática: un candidato de una liga
 * con pocas métricas se compara en menos dimensiones, y menos dimensiones son
 * menos ocasiones de diferir. En una prueba con dos ligas idénticas salvo por
 * la cobertura, los de la liga pobre salían al 100% con 67% de cobertura, por
 * encima de los de la liga rica que coincidían en todo al 96%.
 */
function conCobertura<T extends { similarity: number; coverage: number }>(candidatos: T[], totalMetricas: number) {
  if (!candidatos.length) return [];
  const usadas = candidatos.map((c) => Math.max(0, Math.round((c.coverage / 100) * totalMetricas)));
  const ajustados = encogerHaciaLaMedia(candidatos.map((c) => c.similarity), usadas);
  return candidatos
    .map((candidato, i) => ({ ...candidato, ajustado: Math.round(ajustados[i]) }))
    .sort((a, b) => b.ajustado - a.ajustado || b.coverage - a.coverage);
}

export function PoolPage({ onAbrirJugador }: {
  /** Abrir la ficha de un jugador. Es la misma base, así que basta el índice. */
  onAbrirJugador?: (indice: number) => void;
}) {
  const { rows, procedencia, competiciones, filtros, pasaFiltros } = useBaseActiva();
  const [objetivo, setObjetivo] = useState(-1);
  const [busqueda, setBusqueda] = useState("");
  const [mismoFlanco, setMismoFlanco] = useState(false);

  const aniosMezclados = useMemo(
    () => [...new Set(competiciones.map((c) => c.anio).filter(Boolean))].sort(),
    [competiciones],
  );

  const candidatosObjetivo = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    return rows
      .map((fila, indice) => ({ indice, nombre: String(fila.Player ?? ""), equipo: String(fila.Team ?? "") }))
      .filter((x) => x.nombre.toLowerCase().includes(q))
      .slice(0, 20);
  }, [rows, busqueda]);

  /**
   * El flanco del jugador de referencia. "Mismo flanco" solo significa algo
   * cuando tiene uno: un mediocentro es central y un extremo que juega por las
   * dos bandas sale con las dos, así que ahí la casilla se apaga en vez de
   * filtrar por algo que no dice nada.
   */
  const flancoObjetivo = useMemo<"" | "left" | "right">(() => {
    if (objetivo < 0 || !rows[objetivo]) return "";
    const lados = positionSides(rows[objetivo].Position);
    const izquierda = lados.includes("left");
    const derecha = lados.includes("right");
    if (izquierda && !derecha) return "left";
    if (derecha && !izquierda) return "right";
    return "";
  }, [rows, objetivo]);

  const resultado = useMemo(() => {
    if (objetivo < 0 || !rows.length) return null;
    const filtrosMotor: SimilarityFilters = {
      query: "", position: "", secondaryRole: "",
      side: mismoFlanco ? flancoObjetivo : "",
      passport: "",
      minimumMinutes: filtros.minutosMin,
      ageMin: null, ageMax: null,
    };
    return buildSimilaritySearch(rows, objetivo, filtrosMotor);
  }, [rows, objetivo, filtros.minutosMin, mismoFlanco, flancoObjetivo]);

  const nombreObjetivo = objetivo >= 0 && rows[objetivo] ? String(rows[objetivo].Player ?? "") : "";

  const ordenados = useMemo(() => {
    if (!resultado) return [];
    /*
     * Primero se corrige por cobertura sobre TODOS los candidatos y solo
     * después se aplican los filtros. El orden importa: la corrección encoge
     * hacia la media del conjunto, así que filtrando antes, tachar una liga
     * movería el parecido de todos los demás. Un filtro esconde jugadores; no
     * puede reescribir el número de los que quedan.
     */
    const todos = conCobertura(resultado.candidates, resultado.target.metrics.length);
    return todos
      .map((candidato) => ({ ...candidato, origen: procedencia?.[candidato.index] ?? { ligas: [], anios: [] } }))
      .filter((candidato) => pasaFiltros(candidato.index));
  }, [resultado, procedencia, pasaFiltros]);

  if (!rows.length) {
    return <section className="pool-page">
      <header>
        <h2>{t("Buscador entre ligas")}</h2>
        <p>{t("Carga primero una base y vuelve: esta pantalla busca dentro de lo que tengas cargado.")}</p>
      </header>
    </section>;
  }

  return <section className="pool-page">
    <header>
      <h2>{t("Buscador entre ligas")}</h2>
      <p>{t("Quién se parece a un jugador dentro de la base activa. El parecido se corrige por cobertura: con pocas métricas en común el número se acerca a la media del conjunto hasta que haya evidencia que lo separe.")}</p>
    </header>

    {aniosMezclados.length > 1 && <p className="pool-aviso-anios">
      {tf("La base abarca {anios}. Un jugador comparado consigo mismo entre dos años no dice lo que parece: el que creció sale parecido a su versión anterior. Acota el año si te estorba.", {
        anios: aniosMezclados.join(", "),
      })}
    </p>}

    <Paso numero={1}>A quién te quieres parecer</Paso>
    <div className="pool-buscar">
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

      {objetivo >= 0 && <label className={flancoObjetivo ? "pool-incluir" : "pool-incluir apagada"}>
        <input type="checkbox" checked={mismoFlanco && Boolean(flancoObjetivo)} disabled={!flancoObjetivo}
          onChange={(event) => setMismoFlanco(event.target.checked)} />
        <span>{flancoObjetivo
          ? tf("Solo jugadores del mismo flanco ({lado})", { lado: flancoObjetivo === "left" ? t("izquierda") : t("derecha") })
          : t("Mismo flanco: no aplica. El jugador de referencia es central o juega por las dos bandas.")}</span>
      </label>}
    </div>

    {resultado && <Paso numero={2}>Entre quiénes lo buscas</Paso>}
    {resultado && <div className="pool-barra">
      <BarraDeFiltros campos={["liga", "anio", "equipo", "pasaporte", "minutos", "edad"]} resultado={ordenados.length} />
      {/* La tabla se corta en cuarenta; el CSV lleva todos los candidatos que
          pasan los filtros. Van las dos cifras de parecido y la cobertura,
          porque un 90% con 55% de cobertura no es un 90% con 100. */}
      <BotonExportar
        nombre={[t("parecidos-a"), nombreObjetivo, filtros.liga !== "TODAS" ? filtros.liga : null, filtros.anio || null]}
        columnas={[t("#"), t("Jugador"), t("Equipo"), t("Liga"), t("Año"), t("Edad"), t("Min"), t("Parecido"), t("Bruto"), t("Cobertura")]}
        cuantas={ordenados.length}
        filas={() => ordenados.map((candidato, posicion) => [
          posicion + 1, candidato.name, candidato.team,
          candidato.origen.ligas.join(" · "), candidato.origen.anios.join(" · "),
          candidato.age ?? null, Math.round(candidato.minutes),
          candidato.ajustado, candidato.similarity, candidato.coverage,
        ])}
      />
    </div>}

    {resultado && <div className="pool-resultado">
      <h3>{tf("Se parecen a {jugador}", { jugador: nombreObjetivo })} <i>{ordenados.length}</i></h3>
      <table>
        <thead><tr>
          <th>#</th><th>{t("Jugador")}</th><th>{t("Equipo")}</th><th>{t("Liga")}</th>
          <th>{t("Edad")}</th><th>{t("Min")}</th><th>{t("Parecido")}</th><th>{t("Bruto")}</th><th>{t("Cobertura")}</th>
        </tr></thead>
        <tbody>
          {ordenados.slice(0, 40).map((candidato, posicionEnLista) => (
            <tr key={`${candidato.name}-${candidato.team}-${posicionEnLista}`}
              className={onAbrirJugador ? "clicable" : ""}
              title={onAbrirJugador ? t("Abrir su ficha") : undefined}
              onClick={() => onAbrirJugador?.(candidato.index)}>
              <td>{posicionEnLista + 1}</td>
              <td className="pool-name">{candidato.name}</td>
              <td>{candidato.team}</td>
              <td className="pool-liga">{candidato.origen.ligas.join(" · ") || "—"}</td>
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
