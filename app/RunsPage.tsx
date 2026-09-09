"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Paso } from "./Paso";
import { BarraDeFiltros } from "./BarraDeFiltros";
import { useBaseActiva } from "./BaseActiva";
import { casarPlantilla } from "@/lib/plantilla";
import { t, tf } from "@/lib/i18n";
import { RepartoCarreras, RunMap, TIPOS_CARRERA } from "./RunMap";
import {
  fetchOffBallRuns,
  fetchSkillcornerCompetitions,
  fetchSkillcornerTeams,
  type ApiCompetition,
  type CarreraSinBalon,
  type RespuestaCarreras,
} from "@/lib/remoteData";

/**
 * Carreras sin balón de una temporada, jugador a jugador.
 *
 * Es la única parte de la plataforma que no sale de un Excel: los eventos
 * llegan de SkillCorner por partido, con coordenadas, y solo existen mientras
 * el servidor local esté corriendo. Por eso la página explica qué falta
 * cuando no hay puente, en vez de aparecer vacía.
 */

const MOTIVOS: Record<string, string> = {
  calidad: "sin calidad suficiente",
  sin_procesar: "todavía sin procesar",
  sin_licencia: "fuera de la suscripción",
  red: "sin respuesta",
};

function resumenJugador(carreras: CarreraSinBalon[], partidos: number) {
  const total = carreras.length;
  if (!total) return null;
  const cuenta = (predicado: (carrera: CarreraSinBalon) => boolean) => carreras.filter(predicado).length;
  const xt = carreras.reduce((suma, carrera) => suma + (carrera.xthreat ?? 0), 0);
  return {
    total,
    porPartido: partidos ? total / partidos : 0,
    peligrosas: cuenta((carrera) => carrera.dangerous),
    recibidas: cuenta((carrera) => carrera.received),
    buscadas: cuenta((carrera) => carrera.targeted),
    rompenLinea: cuenta((carrera) => carrera.break_defensive_line),
    aRemate: cuenta((carrera) => carrera.lead_to_shot),
    intensas: cuenta((carrera) => carrera.speed_avg_band === "sprinting" || carrera.speed_avg_band === "hsr"),
    xt,
    xtPorCarrera: xt / total,
  };
}

export function RunsPage() {
  /*
   * Era la única pantalla fuera de la barra de filtros compartida, y por un
   * motivo real: no trabaja sobre la base cruzada sino contra la API, que
   * devuelve nombres sueltos sin puesto, sin edad y sin pasaporte. Así que
   * aquí no bastaba con poner la barra: hay que casar antes cada nombre del
   * plantel con su fila en la base, y eso lo hace casarPlantilla().
   *
   * Los filtros que SÍ puede honrar son los de jugador —puesto, pasaporte,
   * edad—. La liga y el año los decide la competición que se elige arriba, y
   * el equipo también, así que esos dos no aparecen en la barra: mandarían
   * dos cosas a la vez y se contradirían.
   */
  const { rows, filtros, cambiarFiltros, opciones, pasaFiltrosDeJugador, filtrosDeJugador, competiciones: cargadas } = useBaseActiva();
  const [competiciones, setCompeticiones] = useState<ApiCompetition[]>([]);
  const [edicion, setEdicion] = useState("");
  const [equipo, setEquipo] = useState("");
  const [equipos, setEquipos] = useState<string[]>([]);
  const [cargandoEquipos, setCargandoEquipos] = useState(false);
  const [datos, setDatos] = useState<RespuestaCarreras | null>(null);
  const [jugador, setJugador] = useState("TODOS");
  const [tipo, setTipo] = useState("TODOS");
  // Con el plantel entero son miles de flechas y el mapa se vuelve una mancha.
  // SkillCorner resuelve lo mismo mostrando solo la alta intensidad cuando
  // dibuja un equipo completo; al bajar a un jugador ya caben todas.
  const [soloIntensas, setSoloIntensas] = useState(true);
  const [estado, setEstado] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let montado = true;
    void fetchSkillcornerCompetitions()
      .then((lista) => {
        if (!montado) return;
        setCompeticiones(lista);
        /*
         * Se abre en lo que ya está cargado. Antes abría siempre en la CPL,
         * de modo que quien venía de mirar la USL en el resto de la
         * plataforma llegaba aquí a otra liga sin haberla pedido, y tenía que
         * volver a elegirla a mano.
         *
         * Si la base activa no tiene edición en SkillCorner —o no hay base—
         * cae en la CPL del año en curso, que es el uso diario del club. No
         * en la más reciente del listado, que es la temporada siguiente y aún
         * no se ha jugado: abriría la página sin un solo partido.
         */
        const anio = String(new Date().getFullYear());
        const deLaBase = cargadas
          .map((cargada) => lista.find((competicion) => (
            (competicion.name ?? "").toLowerCase() === cargada.liga.toLowerCase()
            && String(competicion.season ?? "").includes(String(cargada.anio))
          )))
          .find(Boolean);
        const cplTodas = lista.filter((competicion) => /canadian premier/i.test(competicion.name ?? ""));
        const elegida = deLaBase
          ?? cplTodas.find((competicion) => String(competicion.season ?? "").includes(anio))
          ?? cplTodas[cplTodas.length - 1];
        if (elegida) setEdicion(String(elegida.id));
      })
      .catch(() => {
        if (montado) setEstado(t("El servidor local no está corriendo. Arranca npm run bg:server y recarga."));
      });
    return () => { montado = false; };
    // Solo al montar: si volviera a correr al cambiar la base, movería la
    // competición bajo los pies de quien ya la había elegido a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!edicion) { setEquipos([]); setEquipo(""); return; }
    let montado = true;
    setCargandoEquipos(true);
    setEquipos([]);
    void fetchSkillcornerTeams(Number(edicion))
      .then((lista) => {
        if (!montado) return;
        setEquipos(lista);
        /* El equipo que se venga mirando en el resto de la plataforma, si está
           en esta competición; si no, Cavalry; si tampoco, el primero. */
        const delFiltro = filtros.equipo !== "TODOS"
          ? lista.find((nombre) => nombre.toLowerCase() === filtros.equipo.toLowerCase())
          : undefined;
        const propio = lista.find((nombre) => /cavalry/i.test(nombre));
        setEquipo(delFiltro ?? propio ?? lista[0] ?? "");
      })
      .catch(() => { if (montado) setEstado(t("No se pudieron leer los equipos de esta competición.")); })
      .finally(() => { if (montado) setCargandoEquipos(false); });
    return () => { montado = false; };
  }, [edicion]);

  async function cargar() {
    if (!edicion || !equipo.trim()) return;
    setCargando(true);
    setEstado(t("Bajando los partidos de la temporada… la primera vez tarda varios minutos."));
    try {
      const respuesta = await fetchOffBallRuns(Number(edicion), equipo.trim());
      setDatos(respuesta);
      setJugador("TODOS");
      const faltan = Object.entries(respuesta.estados).filter(([clave]) => clave !== "ok");
      setEstado(faltan.length
        ? tf("{c} de {p} partidos con datos. Sin datos: {detalle}.", {
          c: respuesta.partidosConDatos, p: respuesta.partidos,
          detalle: faltan.map(([clave, n]) => `${n} ${t(MOTIVOS[clave] ?? clave)}`).join(", "),
        })
        : tf("{c} de {p} partidos con datos.", { c: respuesta.partidosConDatos, p: respuesta.partidos }));
    } catch (error) {
      setDatos(null);
      setEstado(error instanceof Error ? error.message : String(error));
    } finally {
      setCargando(false);
    }
  }

  /**
   * Qué fila de la base activa es cada nombre del plantel.
   *
   * La API devuelve nombres sueltos: sin esto no hay puesto, ni edad, ni
   * pasaporte que filtrar. Se rehace al cambiar de equipo porque el club es lo
   * que acota el emparejamiento.
   */
  const plantilla = useMemo(
    () => casarPlantilla(rows, equipo, datos?.jugadores ?? []),
    [rows, equipo, datos],
  );

  /**
   * ¿Este jugador pasa los filtros de la barra?
   *
   * Sin filtros puestos, todos. Con alguno puesto, el que no tenga ficha en la
   * base se queda fuera: no se puede afirmar que un nombre sin edad conocida
   * cumpla un tope de edad, y es el mismo criterio que usa el resto de la
   * plataforma. Cuántos son se dice en pantalla, para que la ausencia no pase
   * por un dato.
   */
  const pasaElJugador = useCallback((nombre: string) => {
    if (!filtrosDeJugador) return true;
    const indice = plantilla.indice(nombre);
    return indice >= 0 && pasaFiltrosDeJugador(indice);
  }, [filtrosDeJugador, plantilla, pasaFiltrosDeJugador]);

  const filtradas = useMemo(() => {
    if (!datos) return [];
    return datos.runs.filter((carrera) => {
      if (jugador !== "TODOS" && carrera.player_name !== jugador) return false;
      if (!pasaElJugador(carrera.player_name)) return false;
      if (tipo !== "TODOS" && carrera.event_subtype !== tipo) return false;
      if (soloIntensas && carrera.speed_avg_band !== "sprinting" && carrera.speed_avg_band !== "hsr") return false;
      return true;
    });
  }, [datos, jugador, tipo, soloIntensas, pasaElJugador]);

  /** Los del plantel que la barra deja pasar, para el desplegable y el aviso. */
  const jugadoresVisibles = useMemo(
    () => (datos?.jugadores ?? []).filter(pasaElJugador),
    [datos, pasaElJugador],
  );
  /* Cuántos se caen por no tener ficha en la base, que es distinto de caerse
     por no cumplir el filtro. */
  const sinFichaFiltrados = useMemo(() => (
    filtrosDeJugador ? (datos?.jugadores ?? []).filter((n) => plantilla.indice(n) < 0).length : 0
  ), [datos, filtrosDeJugador, plantilla]);

  const tiposPresentes = useMemo(() => {
    if (!datos) return [];
    return [...new Set(datos.runs.map((carrera) => carrera.event_subtype).filter(Boolean))].sort();
  }, [datos]);

  /** Ranking del plantel por volumen y por amenaza generada. */
  const plantel = useMemo(() => {
    if (!datos) return [];
    const porJugador = new Map<string, CarreraSinBalon[]>();
    for (const carrera of datos.runs) {
      if (!carrera.player_name) continue;
      porJugador.set(carrera.player_name, [...(porJugador.get(carrera.player_name) ?? []), carrera]);
    }
    return [...porJugador.entries()]
      .filter(([nombre]) => pasaElJugador(nombre))
      .map(([nombre, carreras]) => ({ nombre, ...resumenJugador(carreras, datos.partidosConDatos)! }))
      .filter((fila) => fila.total >= 20)
      .sort((a, b) => b.xt - a.xt);
  }, [datos, pasaElJugador]);

  const resumen = datos ? resumenJugador(filtradas, datos.partidosConDatos) : null;

  /* Con un filtro puesto ya no es "todo el plantel": decirlo igual haría pasar
     una parte por el todo, y el mapa se guarda y se enseña. */
  const tituloDelMapa = jugador !== "TODOS" ? jugador
    : filtrosDeJugador
      ? tf("{equipo} · {n} del plantel", { equipo, n: jugadoresVisibles.length })
      : tf("{equipo} · todo el plantel", { equipo });

  return <section className="runs-page">
    <header>
      <div>
        <span>{t("SKILLCORNER · DYNAMIC EVENTS")}</span>
        <h2>{t("Mapa de carreras sin balón")}</h2>
        <p>{t("Una flecha por carrera, del punto de inicio al de fin, como en el artículo Open Data #4 de SkillCorner. El color marca la intensidad y el círculo blanco, que la carrera terminó en recepción. El ataque va siempre hacia arriba.")}</p>
      </div>
    </header>

    <Paso numero={1}>Qué competición y qué equipo</Paso>
    <div className="runs-controls">
      <label><span>{t("Competición")}</span>
        <select value={edicion} onChange={(event) => setEdicion(event.target.value)}>
          <option value="">{t("Elegir competición")}…</option>
          {competiciones.map((competicion) => (
            <option key={competicion.id} value={competicion.id}>{competicion.name} · {competicion.season}</option>
          ))}
        </select>
      </label>
      <label><span>{t("Equipo")}</span>
        <select value={equipo} disabled={cargandoEquipos || !equipos.length} onChange={(event) => {
          const elegido = event.target.value;
          setEquipo(elegido);
          /* Se propaga al filtro compartido SOLO si ese club existe en la base
             activa. Si no, las demás pantallas se quedarían en cero jugadores
             por un club que no tienen, y el usuario no sabría por qué. */
          if (opciones.equipos.some((nombre) => nombre.toLowerCase() === elegido.toLowerCase())) {
            cambiarFiltros({ equipo: opciones.equipos.find((nombre) => nombre.toLowerCase() === elegido.toLowerCase())! });
          }
        }}>
          {cargandoEquipos && <option value="">{t("Leyendo equipos…")}</option>}
          {!cargandoEquipos && !equipos.length && <option value="">{t("Elige una competición")}</option>}
          {equipos.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
        </select>
      </label>
      <button type="button" className="runs-load" disabled={cargando || !edicion} onClick={() => void cargar()}>
        {cargando ? t("Cargando…") : t("Cargar carreras")}
      </button>
      {estado && <small className="runs-estado">{estado}</small>}
    </div>

    {datos && <>
      <Paso numero={2}>Qué jugador y qué carreras</Paso>
      {/* Los de jugador y nada más: la liga, el año y el equipo los decide la
          competición de arriba, y ponerlos aquí sería mandar dos veces la
          misma cosa. */}
      <BarraDeFiltros campos={["puesto", "pasaporte", "edad"]} resultado={jugadoresVisibles.length} />
      {sinFichaFiltrados > 0 && <p className="runs-sin-ficha">
        {tf("{n} del plantel no tienen ficha en la base activa, así que no se les puede aplicar el filtro y quedan fuera. Carga la liga de este equipo para que entren.", { n: sinFichaFiltrados })}
      </p>}
      <div className="runs-controls secundarios">
        <label><span>{t("Jugador")}</span>
          <select value={jugador} onChange={(event) => {
            const elegido = event.target.value;
            setJugador(elegido);
            // Un jugador solo cabe entero en el mapa; el plantel, no.
            setSoloIntensas(elegido === "TODOS");
          }}>
            <option value="TODOS">{t("Todo el equipo")}</option>
            {jugadoresVisibles.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
          </select>
        </label>
        <label><span>{t("Tipo de carrera")}</span>
          <select value={tipo} onChange={(event) => setTipo(event.target.value)}>
            <option value="TODOS">{t("Todos")}</option>
            {tiposPresentes.map((clave) => (
              <option key={clave} value={clave}>{t(TIPOS_CARRERA[clave] ?? clave)}</option>
            ))}
          </select>
        </label>
        <button type="button" className={soloIntensas ? "on" : ""} onClick={() => setSoloIntensas(!soloIntensas)}>
          {t("Solo alta intensidad")}
        </button>
      </div>

      <div className="runs-grid">
        <RunMap
          carreras={filtradas}
          titulo={tituloDelMapa}
          subtitulo={tipo === "TODOS"
            ? tf("{n} partidos con datos", { n: datos.partidosConDatos })
            : tf("{tipo} · {n} partidos", { tipo: t(TIPOS_CARRERA[tipo] ?? tipo), n: datos.partidosConDatos })}
        />
        <div className="runs-side">
          {resumen && <div className="runs-kpis">
            <div><b>{resumen.total}</b><span>{t("Carreras")}</span></div>
            <div><b>{resumen.porPartido.toFixed(1)}</b><span>{t("Por partido")}</span></div>
            <div><b>{Math.round((resumen.peligrosas / resumen.total) * 100)}%</b><span>{t("Peligrosas")}</span></div>
            <div><b>{Math.round((resumen.recibidas / resumen.total) * 100)}%</b><span>{t("Reciben")}</span></div>
            <div><b>{resumen.xt.toFixed(1)}</b><span>{t("xThreat total")}</span></div>
            <div><b>{resumen.xtPorCarrera.toFixed(3)}</b><span>{t("xT por carrera")}</span></div>
          </div>}
          <h4>{t("Reparto por tipo de carrera")}</h4>
          <RepartoCarreras carreras={filtradas} />
        </div>
      </div>

      {plantel.length > 0 && <div className="runs-squad">
        <h3>{t("El plantel, ordenado por amenaza generada")} <i>{plantel.length}</i></h3>
        <p>{t("xThreat suma el valor de cada carrera: cuánto acercó a su equipo al gol. El total premia a quien corre mucho y bien; el valor por carrera, a quien corre poco pero decisivo.")}</p>
        <table>
          <thead><tr>
            <th>#</th><th>{t("Jugador")}</th><th>{t("Carreras")}</th><th>{t("Por partido")}</th>
            <th>{t("Peligrosas")}</th><th>{t("Reciben")}</th><th>{t("Intensas")}</th>
            <th>{t("xT total")}</th><th>{t("xT/carrera")}</th>
          </tr></thead>
          <tbody>
            {plantel.map((fila, posicion) => (
              <tr key={fila.nombre} className={fila.nombre === jugador ? "activo" : ""} onClick={() => setJugador(fila.nombre)}>
                <td>{posicion + 1}</td>
                <td className="runs-name">{fila.nombre}</td>
                <td>{fila.total}</td>
                <td>{fila.porPartido.toFixed(1)}</td>
                <td>{Math.round((fila.peligrosas / fila.total) * 100)}%</td>
                <td>{Math.round((fila.recibidas / fila.total) * 100)}%</td>
                <td>{Math.round((fila.intensas / fila.total) * 100)}%</td>
                <td><b>{fila.xt.toFixed(1)}</b></td>
                <td>{fila.xtPorCarrera.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </>}
  </section>;
}
