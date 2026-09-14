"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { t, tf } from "@/lib/i18n";
import { encogerHaciaLaMedia } from "@/lib/cobertura";
import { positionSides } from "@/lib/positions";
import { buildSimilaritySearch, type SimilarityFilters } from "@/lib/similarity";
import { useBaseActiva } from "./BaseActiva";
import { BarraDeFiltros } from "./BarraDeFiltros";
import { Paso } from "./Paso";
import { BotonExportar } from "./BotonExportar";
import { ChevronDown, ChevronRight, Search } from "./Icons";
import { Interruptor } from "./Interruptor";

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

  const equipoObjetivo = objetivo >= 0 && rows[objetivo] ? String(rows[objetivo].Team ?? "") : "";
  const ligaObjetivo = objetivo >= 0 ? (procedencia?.[objetivo]?.ligas ?? []).join(" · ") : "";
  const cambiarReferencia = () => { setObjetivo(-1); setBusqueda(""); setMismoFlanco(false); };
  const abrirConTeclado = (evento: KeyboardEvent, indice: number) => {
    if (!onAbrirJugador || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    onAbrirJugador(indice);
  };

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
      <p>{t("Quién se parece a un jugador dentro de la base activa. Toca a cualquiera para abrir su ficha.")}</p>
      <details className="como-se-calcula">
        <summary><ChevronDown size={13} />{t("Cómo se calcula el parecido")}</summary>
        <p>{t("El parecido se corrige por cobertura: con pocas métricas en común el número se acerca a la media del conjunto hasta que haya evidencia que lo separe.")}</p>
      </details>
    </header>

    {aniosMezclados.length > 1 && <p className="pool-aviso-anios">
      {tf("La base abarca {anios}. Un jugador comparado consigo mismo entre dos años no dice lo que parece: el que creció sale parecido a su versión anterior. Acota el año si te estorba.", {
        anios: aniosMezclados.join(", "),
      })}
    </p>}

    <Paso numero={1}>A quién te quieres parecer</Paso>
    {/* Buscar y elegir, al modo de iOS. Las coincidencias salían como hasta
        veinte píldoras en montón, y al elegir una el campo seguía abierto con
        la lista debajo, así que no se veía de un vistazo QUIÉN era la
        referencia. Ahora las coincidencias son una lista, y al elegir el
        buscador se convierte en la ficha de la referencia, con su liga y un
        "Cambiar" para volver a buscar. */}
    {objetivo < 0 ? <div className="pool-buscar">
      <label className="campo-busqueda"><Search size={15} />
        <input type="search" value={busqueda} placeholder={t("Escribe un nombre…")} aria-label={t("Jugador de referencia")}
          onChange={(event) => setBusqueda(event.target.value)} />
      </label>
      {candidatosObjetivo.length > 0 && <ul className="pool-sugerencias">
        {candidatosObjetivo.map((x) => (
          <li key={x.indice}>
            <button type="button" onClick={() => { setObjetivo(x.indice); setBusqueda(x.nombre); }}>
              <span><b>{x.nombre}</b><small>{x.equipo}{procedencia?.[x.indice]?.ligas.length ? ` · ${procedencia[x.indice].ligas.join(" · ")}` : ""}</small></span>
              <ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ul>}
      {busqueda.trim() !== "" && candidatosObjetivo.length === 0 && <p className="pool-sin-resultados">{t("Ningún jugador con ese nombre en la base activa.")}</p>}
    </div> : <div className="pool-referencia">
      <div className="pool-referencia-fila">
        <span>
          <small>{t("Jugador de referencia")}</small>
          <b>{nombreObjetivo}</b>
          <span>{[equipoObjetivo, ligaObjetivo].filter(Boolean).join(" · ")}</span>
        </span>
        <button type="button" className="pool-cambiar" onClick={cambiarReferencia}>{t("Cambiar")}</button>
      </div>
      {/* "Mismo flanco" era una casilla, y cuando no aplicaba quedaba marcable
          en gris. Es un sí o un no sobre la búsqueda: un interruptor. Y cuando
          el jugador es central o juega por las dos bandas no hay interruptor,
          solo la explicación, porque no hay nada que encender. */}
      <div className="pool-referencia-fila pool-flanco">
        {flancoObjetivo ? <>
          <span><b>{tf("Solo jugadores del mismo flanco ({lado})", { lado: flancoObjetivo === "left" ? t("izquierda") : t("derecha") })}</b></span>
          <Interruptor activo={mismoFlanco} onCambio={setMismoFlanco} titulo={tf("Solo jugadores del mismo flanco ({lado})", { lado: flancoObjetivo === "left" ? t("izquierda") : t("derecha") })} />
        </> : <span><small>{t("Mismo flanco: no aplica. El jugador de referencia es central o juega por las dos bandas.")}</small></span>}
      </div>
    </div>}

    {resultado && <Paso numero={2}>Entre quiénes lo buscas</Paso>}
    {resultado && <BarraDeFiltros campos={["liga", "anio", "equipo", "pasaporte", "minutos", "edad"]} resultado={ordenados.length} accesorio={
      /* La lista se corta en cuarenta; el CSV lleva todos los candidatos que
         pasan los filtros. Van las dos cifras de parecido y la cobertura,
         porque un 90% con 55% de cobertura no es un 90% con 100. */
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
    } />}

    {/* Los resultados, en lista y no en tabla. Eran nueve columnas en 922 px
        que desbordaban a lo ancho con la ventana normal. Ahora cada fila
        lleva el nombre y, debajo, club, liga, edad y minutos; y a la derecha
        el parecido grande, con el bruto y la cobertura en pequeño debajo. La
        cobertura baja sigue marcándose en color, porque es la que avisa de
        que ese número vale menos. */}
    {resultado && <div className="pool-resultado">
      <h3>{tf("Se parecen a {jugador}", { jugador: nombreObjetivo })}</h3>
      {ordenados.length > 0 && <ol className="pool-lista">
        {ordenados.slice(0, 40).map((candidato, posicionEnLista) => (
          <li key={`${candidato.name}-${candidato.team}-${posicionEnLista}`}
            className={onAbrirJugador ? "clicable" : ""}
            role={onAbrirJugador ? "button" : undefined}
            tabIndex={onAbrirJugador ? 0 : undefined}
            title={onAbrirJugador ? t("Abrir su ficha") : undefined}
            onClick={() => onAbrirJugador?.(candidato.index)}
            onKeyDown={(evento) => abrirConTeclado(evento, candidato.index)}>
            <span className={posicionEnLista < 3 ? "rank-pos podio" : "rank-pos"}>{posicionEnLista + 1}</span>
            <span className="pool-cuerpo">
              <b className="pool-name">{candidato.name}</b>
              <small>{[candidato.team, candidato.origen.ligas.join(" · "), candidato.age != null ? String(candidato.age) : null, `${Math.round(candidato.minutes)}′`].filter(Boolean).join(" · ")}</small>
            </span>
            <span className="pool-cifras">
              <b>{candidato.ajustado}%</b>
              <small>{tf("bruto {n}%", { n: candidato.similarity })} · <span className={candidato.coverage < 60 ? "pool-baja" : undefined}>{tf("cobertura {n}%", { n: candidato.coverage })}</span></small>
            </span>
            {onAbrirJugador ? <ChevronRight size={14} className="rank-chevron" /> : <span />}
          </li>
        ))}
      </ol>}
      <p className="pool-aviso">
        {t("No se ajusta por nivel de liga: un parecido alto con un jugador de una competición más débil no significa que rinda igual aquí. Mira siempre de qué liga viene.")}
      </p>
    </div>}
  </section>;
}
