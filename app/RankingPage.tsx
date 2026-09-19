"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { rankingDeCohorte } from "@/lib/ranking";
import { PERFILES } from "@/lib/perfiles";
import { useBaseActiva } from "./BaseActiva";
import { PieDeReporte } from "./PieDeReporte";
import { BarraDeFiltros, Desplegable } from "./BarraDeFiltros";
import { ChevronDown, ChevronRight } from "./Icons";
import { BotonExportar } from "./BotonExportar";
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


export function RankingPage({ onSelectPlayer, destinatario = "", logoDestinatario = "" }: {
  onSelectPlayer?: (indice: number) => void;
  /** Club destinatario del PDF, para firmar la hoja como las de diseño. */
  destinatario?: string;
  logoDestinatario?: string;
}) {
  const [perfil, setPerfil] = useState("CF");
  const [vista, setVista] = useState<"indice" | "arquetipos">("indice");
  /*
   * Los filtros vienen de la barra compartida: liga, año, club, pasaporte,
   * edad y minutos son los mismos en toda la plataforma, y lo que elijas aquí
   * sigue puesto al cambiar de pestaña. El puesto se queda local porque en
   * esta pantalla no acota: decide QUÉ ranking se calcula.
   */
  const { rows, filtros, pasaFiltros, procedencia } = useBaseActiva();
  const minutosMin = filtros.minutosMin;

  // El informe completo es caro: se calcula una vez por perfil y minutos, y
  // los filtros de mercado se aplican después sobre el resultado.
  const todos = useMemo(() => rankingDeCohorte(rows, perfil, minutosMin), [rows, perfil, minutosMin]);

  const visibles = useMemo(
    () => todos.filter((fila) => pasaFiltros(fila.indice)),
    [todos, pasaFiltros],
  );

  // De qué puesto es esta hoja, para que la firma lo diga en el PDF.
  const nombreDelPuesto = t(PERFILES.find((item) => item.id === perfil)?.nombre ?? perfil);

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

  const nombreDelPerfil = t(PERFILES.find((x) => x.id === perfil)?.nombre ?? perfil);
  const abrirConTeclado = (evento: KeyboardEvent, indice: number) => {
    if (!onSelectPlayer || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    onSelectPlayer(indice);
  };

  return <section className="rank-page">
    {/* La cabecera dice qué es la pantalla y nada más. La explicación del
        índice ocupaba tres líneas encima de todo, y se lee una vez: pasa a un
        desplegable, un nivel más abajo, igual que el aviso de cobertura. */}
    <header>
      <div>
        <span>{t("RANKING DE LA BASE")}</span>
        <h2>{t("Los mejores de cada puesto")}</h2>
        <p>{t("Quién encabeza cada posición en lo que tienes cargado. Toca a cualquiera para abrir su informe.")}</p>
        <details className="como-se-calcula">
          <summary><ChevronDown size={13} />{t("Cómo se calcula el índice")}</summary>
          <p>{t("El índice parte del percentil medio contra los jugadores de su misma posición y lo acerca a sus tres mejores métricas: destacar en algo cuenta, y no solo ser correcto en todo.")}</p>
          {hayCoberturaDesigual && <p>{t("El índice está corregido por cobertura: no todas las ligas traen las mismas métricas —sólo algunas tienen SkillCorner encima— y quien se mide con menos da un número más inestable, que asomaba en la cima más de lo que le tocaba. El ajuste acerca a la media a quien se apoya en poco, hasta que haya con qué separarlo de ella. El número pequeño de al lado es el índice sin corregir.")}</p>}
        </details>
      </div>
    </header>

    {/* Qué ranking miras: la posición como ficha y el orden como control
        segmentado, en una sola fila. Eran dos cajas con rótulo de paso para
        una decisión de dos toques. El puesto sigue yendo primero, porque
        primero eliges qué ranking y solo después lo estrechas.

        Esta fila tenía además un fallo de maquetación: su contenedor se
        llamaba "rank-barra", igual que la barrita de puntuación de cada
        fila, y heredaba su "height: 7px". Los filtros desbordaban de una caja
        de siete píxeles. */}
    <div className="filtros-barra rank-herramientas" role="group" aria-label={t("Qué puesto miras")}>
      <div className="filtros-chips">
        <Desplegable etiqueta={t("Posición")} valor={nombreDelPerfil} activo={false}>
          <select aria-label={t("Posición")} value={perfil} onChange={(event) => setPerfil(event.target.value)}>
            {PERFILES.map((item) => <option key={item.id} value={item.id}>{t(item.nombre)}</option>)}
          </select>
        </Desplegable>
      </div>
      <div className="rank-tabs" role="group" aria-label={t("Cómo ordenar")}>
        <button type="button" className={vista === "indice" ? "on" : ""} aria-pressed={vista === "indice"} onClick={() => setVista("indice")}>{t("Por índice")}</button>
        <button type="button" className={vista === "arquetipos" ? "on" : ""} aria-pressed={vista === "arquetipos"} onClick={() => setVista("arquetipos")}>{t("Por arquetipo")}</button>
      </div>
    </div>

    {/* Exportar va al final de la fila de filtros, junto al recuento: se lee
        como "baja estos N". La lista de pantalla se corta en cuarenta; el CSV
        lleva todas las que pasan los filtros, con sus métricas destacadas. */}
    <BarraDeFiltros campos={["liga", "anio", "equipo", "pasaporte", "minutos", "edad"]} resultado={visibles.length} accesorio={
      <BotonExportar
        nombre={[t("ranking"), nombreDelPerfil, filtros.liga !== "TODAS" ? filtros.liga : null, filtros.anio || null]}
        columnas={[t("#"), t("Jugador"), t("Equipo"), t("Liga"), t("Año"), t("Edad"), t("Min"), t("Índice"), t("Índice sin corregir"), t("Métricas"), t("Pasaportes"), t("Destacadas")]}
        cuantas={visibles.length}
        filas={() => visibles.map((fila, posicion) => {
          const origen = procedencia?.[fila.indice];
          return [
            posicion + 1, fila.jugador, fila.equipo,
            origen?.ligas.join(" · ") ?? "", origen?.anios.join(" · ") ?? "",
            Number.isFinite(fila.edad) ? fila.edad : null,
            Math.round(fila.minutos), fila.puntuacion, fila.puntuacionCruda, fila.metricas,
            fila.pasaportes.join(" · "),
            fila.destacadas.map((m) => `${t(m.label)} P${m.percentile}`).join(" · "),
          ];
        })}
      />
    } />

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

    {/* La lista, como una tarjeta agrupada de iOS. Cada fila tenía cinco
        columnas en fila —puesto, nombre, barra, índice y tres métricas— y las
        métricas se comían el ancho: con la ventana estrecha una fila medía
        138 px. Ahora el nombre manda, la barra y las métricas van debajo de
        él, y el índice se lee grande a la derecha, que es donde se busca un
        número. */}
    {vista === "indice" && visibles.length > 0 && <>
      <ol className="rank-list">
        {visibles.slice(0, 40).map((fila, posicion) => (
          <li
            key={fila.indice}
            className={onSelectPlayer ? "clicable" : ""}
            role={onSelectPlayer ? "button" : undefined}
            tabIndex={onSelectPlayer ? 0 : undefined}
            onClick={() => onSelectPlayer?.(fila.indice)}
            onKeyDown={(evento) => abrirConTeclado(evento, fila.indice)}
          >
            <span className={posicion < 3 ? "rank-pos podio" : "rank-pos"}>{posicion + 1}</span>
            <span className="rank-cuerpo">
              <span className="rank-nombre">
                {fila.jugador}
                <small>{fila.equipo}{Number.isFinite(fila.edad) ? ` · ${fila.edad}` : ""}{fila.minutos ? ` · ${Math.round(fila.minutos)}′` : ""}</small>
              </span>
              <i className="rank-progreso" aria-hidden="true"><em style={{ width: `${Math.max(2, (fila.puntuacion / maximo) * 100)}%` }} /></i>
              {fila.destacadas.length > 0 && <span className="rank-flags">
                {fila.destacadas.map((metrica) => <em key={metrica.label}>{t(metrica.label)} <u>P{metrica.percentile}</u></em>)}
              </span>}
            </span>
            <b className="rank-indice">{fila.puntuacion}<u title={tf("Índice sin corregir: {c} · calculado con {m} métricas", { c: fila.puntuacionCruda, m: fila.metricas })}>{fila.puntuacionCruda}</u></b>
            {onSelectPlayer ? <ChevronRight size={14} className="rank-chevron" /> : <span />}
          </li>
        ))}
      </ol>
      {hayCoberturaDesigual && <p className="rank-pie">{t("Índice corregido por cobertura: el número pequeño es el índice sin corregir.")}</p>}
    </>}

    {vista === "arquetipos" && (arquetipos.length > 0 ? <div className="rank-arq-grid">
      {arquetipos.map((ranking) => (
        <div key={ranking.arquetipo.id} className="rank-arq-card">
          <h3>{t(ranking.arquetipo.nombre)}</h3>
          <p>{t(ranking.arquetipo.resumen)}</p>
          <ol>
            {ranking.jugadores
              .filter((jugador) => pasaFiltros(jugador.indice))
              .slice(0, 10)
              .map((jugador, posicion) => (
                <li key={jugador.indice} onClick={() => onSelectPlayer?.(jugador.indice)}
                  role={onSelectPlayer ? "button" : undefined}
                  tabIndex={onSelectPlayer ? 0 : undefined}
                  onKeyDown={(evento) => abrirConTeclado(evento, jugador.indice)}
                  title={jugador.detalle.map((d) => `${t(d.etiqueta)}: P${d.percentil}`).join("\n")}>
                  <span className="rank-pos">{posicion + 1}</span>
                  <span className="rank-nombre">{jugador.nombre}<small>{jugador.equipo}{Number.isFinite(jugador.edad) ? ` · ${jugador.edad}` : ""}</small></span>
                  <i className="rank-progreso" aria-hidden="true"><em style={{ width: `${Math.max(2, jugador.ajuste)}%` }} /></i>
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
    {/* La misma firma que las hojas de diseño: en el PDF conviven páginas de
        las dos clases y no debería notarse cuál viene de dónde. */}
    <PieDeReporte asunto={`${t("Ranking")} · ${nombreDelPuesto}`} destinatario={destinatario} logo={logoDestinatario} />

  </section>;
}
