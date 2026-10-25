"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BarraDegradada, Cesped, ChipDeCambio, Cometa, FilaDeMetrica, tonosDeColor, type Tonos } from "./KitNight";
import { SIMILARITY_METRIC_GROUPS, type SimilarityMetricGroup } from "@/lib/similarityMetricGroups";
import { Desplegable } from "./BarraDeFiltros";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchEventosJugador } from "@/lib/remoteData";
import { useRoles } from "./useRolesDeLiga";
import { EncajeEquipo } from "./EncajeEquipo";
import { Escudo } from "./Escudo";
import { buildSimilaritySearch, type SimilarityFilters, type SimilarityPlayer } from "@/lib/similarity";
import { PERFILES } from "@/lib/perfiles";
import { primaryPositionRole } from "@/lib/positions";
import { marcoDeSuLiga, temporadasDeFila, type DataRow, type PlayerReport, MINIMO_FAMILIAS_EN_SU_LIGA } from "@/lib/scouting";
import type { ValorCompuesto } from "@/lib/snapshot";
import { marcoConNivel, type EntradaOpta } from "@/lib/nivelDeLiga";
import type { TransfermarktProfile } from "@/lib/transfermarkt";
import {
  AGRUPACIONES_RECEPCION,
  COMPUESTAS,
  POSICION_EN_CAMPO,
  aVertical,
  agrupacionRecepcion,
  anchoDeTexto,
  carriles,
  colocarEtiquetas,
  defensivasGanadas,
  densidad,
  enjambre,
  esJuegoAbierto,
  esPaseEnJuego,
  familiasCompuestas,
  fuenteStatsbomb,
  grupoDeRecepcion,
  mapaDeGanadas,
  ofensivasGanadas,
  rejilla,
  resumenRecepciones,
  ROLES_SECUENCIA,
  rolesFrenteAlGrupo,
  type EventoSB,
  type EventosJugador,
  type GrupoCompuesto,
  type Punto,
} from "@/lib/snapshot";

/**
 * Las piezas de la ficha ampliada, cada una por separado.
 *
 * La ficha ampliada las monta todas en una hoja. Todas leen lo mismo: el
 * grupo de familias, los parecidos y los eventos de StatsBomb se calculan o se
 * piden una vez por jugador y se reparten entre las piezas.
 *
 * Todo en SVG: la hoja se imprime, y un vector sale nítido en el PDF.
 */

export type ContextoFicha = {
  rows: DataRow[];
  indice: number;
  informe: PlayerReport;
  perfilTm?: Partial<TransfermarktProfile>;
  minutosMin: number;
  onAbrirJugador?: (indice: number) => void;
  /** La temporada que se mira en la ficha ("2026", "2025/2026"); sin ella, la más reciente del jugador. */
  temporada?: string;
  /** Las claves "liga año" de cada fila cuando se mide contra su liga; sin ellas, contra todas. */
  clavesPorFila?: string[][] | null;
  /** Los Opta Power Rankings, para decir el nivel de su liga junto al grupo. */
  feedOpta?: EntradaOpta[] | null;
  /** Las claves "liga año" de cada fila, se mida como se mida: acotan el Top 10 y los parecidos. */
  ligasDeFila?: string[][] | null;
  /** Ligas añadidas a mano al Top 10 y a los parecidos; por defecto, solo la suya. */
  ligasExtra?: string[];
  /**
   * Medir siempre contra su liga y su cohorte, aunque su liga tenga menos de
   * diez de su puesto (con cinco basta para las familias). La Ficha ampliada
   * lo pide.
   */
  siempreSuLiga?: boolean;
};

export type IdPieza =
  | "ficha" | "tabla" | "radar" | "top10" | "puestos" | "parecidos"
  | "tiros" | "ocasiones" | "ganadas" | "pases_inicio" | "pases_fin"
  | "calor" | "defensa" | "enjambres" | "dispersion"
  | "recepciones" | "recepciones_tipo" | "recepciones_origen" | "recepciones_pasadores"
  | "roles" | "encaje";

/*
 * Look Night. Cada familia toma el color de su conjunto —el mismo que en el
 * radar— y su barra va de oscuro a claro según el percentil. Las listas y los
 * roles van con el rojo del acento (rampa_de_valor del diseño).
 */
const CONJUNTO_DE_FAMILIA: Record<string, SimilarityMetricGroup["id"]> = {
  construccion: "passing", asociacion: "passing", progresion: "passing",
  creacion_juego: "creating", creacion_parado: "creating", centros: "creating",
  amenaza: "finishing", finalizacion: "finishing",
  aereo: "defending", defensa_rival: "defending", defensa_propia: "defending", defensa_area: "defending", defensa_juego: "defending",
  fisico: "physical", movimiento_sc: "physical", bajo_presion: "physical",
};
const conjuntoDeFamilia = (id: string) => SIMILARITY_METRIC_GROUPS.find((grupo) => grupo.id === (CONJUNTO_DE_FAMILIA[id] ?? "passing"))!;
const TONOS_ACENTO: Tonos = { color: "#ff3b30", bajo: "#a94a44", alto: "#ff8d6b" };
/** La rampa de la red de pases (#CBD8D0 → #F6A994 → #FF3B30), de 0 a 1. */
function rampaDeRed(valor: number) {
  const paradas = ["#cbd8d0", "#f6a994", "#ff3b30"];
  const v = Math.max(0, Math.min(1, valor));
  const [a, b, f] = v < 0.5 ? [paradas[0], paradas[1], v / 0.5] : [paradas[1], paradas[2], (v - 0.5) / 0.5];
  const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(canal(a, i) * (1 - f) + canal(b, i) * f)).join(",")})`;
}
/** Colores de acción del xG chain del diseño, aclarados para fondo oscuro. */
const COLOR_OCASION: Record<string, string> = { juego: "#2f96e0", centro: "#f2b01e", parado: "#e08cbb", asistencia: "#2fb65a" };
/** Una estrella de cinco puntas: el gol, como en el mapa de remates del diseño. */
function estrella(x: number, y: number, radio: number) {
  let d = "";
  for (let i = 0; i < 10; i += 1) {
    const angulo = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? radio * 0.45 : radio;
    d += `${i ? "L" : "M"}${(x + Math.cos(angulo) * r).toFixed(2)} ${(y + Math.sin(angulo) * r).toFixed(2)}`;
  }
  return `${d}Z`;
}

const conSigno = (z: number) => `${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`;
export const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;
const pct = (parte: number, total: number) => `${total ? Math.round((parte / total) * 100) : 0}%`;
const num = (valor: number, decimales = 0) => valor.toLocaleString(numberLocale(), { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

// ---- Lo que se comparte entre piezas ---------------------------------------

// Los eventos de cada jugador ya pedidos en esta sesión, y los que están en
// camino: dos bloques del mismo jugador esperan la misma descarga.
const memoria = new Map<string, EventosJugador>();
const enCamino = new Map<string, Promise<EventosJugador>>();
// Por base cargada: al cambiar de base la clave desaparece con ella.
const grupos = new WeakMap<DataRow[], Map<string, GrupoCompuesto>>();
const similares = new WeakMap<DataRow[], Map<string, SimilarityPlayer[]>>();
const similaresDelPuesto = new WeakMap<DataRow[], Map<string, SimilarityPlayer[]>>();

function deCache<T>(tabla: WeakMap<DataRow[], Map<string, T>>, rows: DataRow[], clave: string, calcular: () => T): T {
  let porClave = tabla.get(rows);
  if (!porClave) { porClave = new Map(); tabla.set(rows, porClave); }
  if (!porClave.has(clave)) porClave.set(clave, calcular());
  return porClave.get(clave)!;
}

function pedirEventos(clave: string) {
  let promesa = enCamino.get(clave);
  if (!promesa) {
    const [liga, temporada, club, nombre] = clave.split("|");
    promesa = fetchEventosJugador(liga, temporada, club, nombre)
      .then((respuesta) => { memoria.set(clave, respuesta); return respuesta; })
      .finally(() => enCamino.delete(clave));
    enCamino.set(clave, promesa);
  }
  return promesa;
}

/** Los eventos del jugador. Sin `activo` no se piden: solo se usan si ya están. */
function useEventos(clave: string, activo: boolean, club: string) {
  const [eventos, setEventos] = useState<EventosJugador | null>(() => (clave ? memoria.get(clave) ?? null : null));
  const [estado, setEstado] = useState("");

  useEffect(() => {
    if (!clave) {
      setEventos(null);
      setEstado(t("Este jugador no viene de StatsBomb: los mapas necesitan sus eventos partido a partido."));
      return;
    }
    const guardado = memoria.get(clave);
    if (guardado) {
      setEventos(guardado);
      setEstado(guardado.partidos ? "" : t("StatsBomb no tiene eventos de este jugador en esa temporada."));
      return;
    }
    setEventos(null);
    if (!activo) { setEstado(""); return; }
    let vivo = true;
    setEstado(tf("Bajando los partidos de {equipo}… la primera vez tarda un par de minutos.", { equipo: club }));
    pedirEventos(clave)
      .then((respuesta) => {
        if (!vivo) return;
        setEventos(respuesta);
        setEstado(respuesta.partidos ? "" : t("StatsBomb no tiene eventos de este jugador en esa temporada."));
      })
      .catch((error) => {
        if (!vivo) return;
        setEstado(error instanceof TypeError
          ? t("El servidor local no respondió. Arranca npm run bg:server y reintenta.")
          : error instanceof Error ? error.message : String(error));
      });
    return () => { vivo = false; };
  }, [clave, activo, club]);

  return { eventos, estado };
}

/** Los eventos ya separados por mapa. */
function separar(lista: EventoSB[]) {
  const tiros = lista.filter((e) => e.t === "Shot" && e.l);
  const ocasiones = lista.filter((e) => e.t === "Pass" && (e.sa || e.ga) && e.l && e.e);
  const defensivas = lista.filter((e) => ((e.t === "Duel" && e.dt === "Tackle") || ["Ball Recovery", "Interception", "Clearance", "Block"].includes(e.t)) && e.l);
  return {
    tiros,
    goles: tiros.filter((e) => e.o === "Goal").length,
    xgTotal: tiros.reduce((s, e) => s + (e.xg ?? 0), 0),
    ocasiones,
    asistencias: ocasiones.filter((e) => e.ga).length,
    defensivasGanadas: defensivasGanadas(lista),
    ofensivasGanadas: ofensivasGanadas(lista),
    pasesJuego: lista.filter((e) => esPaseEnJuego(e) && e.l),
    acciones: lista.filter((e) => ["Pass", "Carry", "Ball Receipt*", "Dribble", "Shot"].includes(e.t) && esJuegoAbierto(e) && e.l),
    defensivas,
    cuenta: (tipo: string, dt?: string) => defensivas.filter((e) => e.t === tipo && (!dt || e.dt === dt)).length,
  };
}

/**
 * Todo lo que necesitan las piezas de un jugador. `conEventos` decide si se
 * piden sus partidos: un bloque de radar no tiene por qué esperar dos minutos
 * de descarga que no va a usar.
 */
export function useDatosFicha(contexto: ContextoFicha, conEventos: boolean, conRoles = false) {
  const { rows, indice, informe, minutosMin, clavesPorFila, feedOpta, ligasDeFila = null, ligasExtra = [], siempreSuLiga = false } = contexto;
  const fila = rows[indice];
  const jugador = String(fila?.Player ?? informe.player);
  const fuente = fuenteStatsbomb(fila?.["Data sources"], contexto.temporada);
  // El club de ESA temporada y liga, no el actual: es con el que jugó esos partidos.
  const temporadaDeLaFuente = fuente ? temporadasDeFila(fila).find((temporada) => temporada.etiqueta === fuente.temporada) : undefined;
  const equipo = (fuente && temporadaDeLaFuente?.equipoPorLiga[fuente.liga]) || String(fila?.Team ?? informe.team);
  const clave = fuente ? `${fuente.liga}|${fuente.temporada}|${equipo}|${jugador}` : "";
  const { eventos, estado } = useEventos(clave, conEventos, equipo);
  const { roles: rolesLiga, estado: estadoRoles } = useRoles(fuente?.liga ?? "", fuente?.temporada ?? "", conRoles);

  // Su grupo, como en la ficha: los de su puesto en su liga y temporada, si
  // hay al menos diez; si no, todos los cargados, y la cabecera lo dice.
  const suLiga = useMemo(
    () => marcoDeSuLiga(rows, clavesPorFila, indice, informe.cohort, minutosMin, siempreSuLiga ? MINIMO_FAMILIAS_EN_SU_LIGA : undefined),
    [rows, clavesPorFila, indice, informe.cohort, minutosMin, siempreSuLiga],
  );
  const grupo = useMemo(() => {
    const enSuLiga = suLiga?.modo === "liga" ? suLiga : null;
    const clave = `${informe.cohort}|${minutosMin}|${indice}|${enSuLiga ? enSuLiga.claves.join("¦") : "todas"}`;
    return deCache(grupos, rows, clave, () => familiasCompuestas(rows, informe.cohort, minutosMin, indice, enSuLiga ? (i) => enSuLiga.filas.has(i) : undefined));
  }, [rows, informe.cohort, minutosMin, indice, suLiga]);
  /*
   * El Top 10 y los parecidos, de su liga y temporada por defecto; con más
   * ligas si se añaden. En el Top 10 cada uno va medido dentro de su propia
   * liga (su grupo de posición de esa liga), así que un 1,5 de la MLS y uno de
   * la CPL dicen lo mismo: cuánto destaca donde juega.
   */
  const susLigas = useMemo(() => ligasDeFila?.[indice] ?? [], [ligasDeFila, indice]);
  const ligasDeLaLista = useMemo(() => [...new Set([...susLigas, ...ligasExtra])], [susLigas, ligasExtra]);
  const claveDeLigas = ligasDeLaLista.join("¦");
  const gruposDelTop = useMemo(() => {
    if (!ligasDeFila || !susLigas.length) return [grupo];
    return ligasDeLaLista.map((liga) => deCache(grupos, rows, `${informe.cohort}|${minutosMin}|liga:${liga}`,
      () => familiasCompuestas(rows, informe.cohort, minutosMin, -1, (i) => (ligasDeFila[i] ?? []).includes(liga))));
    // claveDeLigas resume ligasDeLaLista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligasDeFila, susLigas, claveDeLigas, rows, informe.cohort, minutosMin, grupo]);
  const candidatosDelTop = useMemo(() => {
    const vistos = new Set<number>();
    const lista: Array<{ i: number; valores: Record<string, ValorCompuesto> | undefined }> = [];
    for (const g of gruposDelTop) for (const i of g.indices) {
      if (vistos.has(i)) continue;
      vistos.add(i);
      lista.push({ i, valores: g.valores.get(i) });
    }
    return lista;
  }, [gruposDelTop]);
  const parecidos = useMemo(() => deCache(similares, rows, `${indice}|${minutosMin}|${claveDeLigas}`, () => {
    const puesto = primaryPositionRole(fila?.Position ?? informe.position) ?? "";
    const filtros: SimilarityFilters = { query: "", position: puesto, secondaryRole: "", side: "", passport: "", minimumMinutes: minutosMin, ageMin: null, ageMax: null };
    // Cada uno medido contra su liga cuando hay varias; si la suya no da, contra todas.
    const porLiga = ligasDeFila && new Set(ligasDeFila.flat()).size > 1 ? { ligasPorFila: ligasDeFila } : null;
    const enLaLista = (i: number) => !ligasDeFila || !susLigas.length || (ligasDeFila[i] ?? []).some((liga) => ligasDeLaLista.includes(liga));
    try {
      const busqueda = (porLiga ? buildSimilaritySearch(rows, indice, filtros, {}, "AUTO", null, porLiga) : null) ?? buildSimilaritySearch(rows, indice, filtros);
      return (busqueda?.candidates ?? []).filter((c) => enLaLista(c.index)).slice(0, 15);
    } catch {
      return [];
    }
    // claveDeLigas resume las ligas de la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, indice, minutosMin, claveDeLigas, ligasDeFila, informe.position, fila]);
  // Para los aros de los gráficos de grupo hacen falta parecidos de su mismo
  // puesto: la lista general admite otros (a Engel, central, le salían
  // laterales y un extremo), y esos no tienen punto en el gráfico de centrales.
  const parecidosDelPuesto = useMemo(() => deCache(similaresDelPuesto, rows, `${indice}|${minutosMin}`, () => {
    // La posición cruda de la fila ("LCB"): la del informe ya viene
    // formateada ("Defender (LCB)") y el detector no la reconoce.
    const puesto = primaryPositionRole(fila?.Position ?? informe.position);
    if (!puesto) return [];
    const filtros: SimilarityFilters = { query: "", position: puesto, secondaryRole: "", side: "", passport: "", minimumMinutes: minutosMin, ageMin: null, ageMax: null };
    try {
      return buildSimilaritySearch(rows, indice, filtros)?.candidates.slice(0, 20) ?? [];
    } catch {
      return [];
    }
  }), [rows, indice, minutosMin, informe.position, fila]);
  const mapas = useMemo(() => separar(eventos?.eventos ?? []), [eventos]);
  const enGrupo = useMemo(() => new Set(grupo.indices), [grupo]);
  const roles = useMemo(
    () => (rolesLiga ? rolesFrenteAlGrupo(rows, grupo.indices, indice, rolesLiga.jugadores) : null),
    [rolesLiga, rows, grupo, indice],
  );
  const minutosPos = Object.entries(eventos?.posiciones ?? {}).filter(([, m]) => m > 0);

  return {
    contexto,
    jugador,
    equipo,
    fuente,
    eventos,
    estado,
    sinEventos: !eventos || !eventos.partidos,
    grupo,
    propias: grupo.valores.get(indice) ?? {},
    nombreGrupo: t(PERFILES.find((perfil) => perfil.id === informe.cohort)?.nombre ?? informe.cohort),
    /** Contra quién se midió el grupo, con el nivel de su liga; null con una sola competición. */
    marco: suLiga ? { modo: suLiga.modo, texto: marcoConNivel(suLiga.claves, feedOpta), enSuLiga: suLiga.enSuLiga } : null,
    candidatosDelTop,
    /** Las ligas del Top 10 y de los parecidos, con su nivel: "CPL 2026 · Opta 65,3 + MLS 2026 · Opta 79,7". */
    ligasDeLaLista: ligasDeLaLista.length ? marcoConNivel(ligasDeLaLista, feedOpta) : "",
    /** De cuál de las ligas de la lista es una fila (la primera que casa), para escribirla al lado. */
    ligaEnLaLista: (i: number) => (ligasDeFila?.[i] ?? []).find((liga) => ligasDeLaLista.includes(liga)) ?? "",
    parecidos,
    // Los aros de los gráficos de grupo: los cinco más parecidos de su puesto
    // que están en el grupo (con el mínimo de minutos).
    destacados: parecidosDelPuesto.filter((p) => enGrupo.has(p.index)).slice(0, 5).map((p) => p.index),
    nombres: (i: number) => String(rows[i]?.Player ?? ""),
    minutosPos,
    totalPos: minutosPos.reduce((s, [, m]) => s + m, 0),
    roles,
    estadoRoles,
    ...mapas,
  };
}

export type DatosFicha = ReturnType<typeof useDatosFicha>;

// ---- Piezas de dibujo -----------------------------------------------------

/**
 * Campo vertical con el ataque hacia arriba, en unidades de StatsBomb (80 × 120).
 *
 * `tercio` dibuja solo el último tercio (40 de los 120): los tiros y las
 * ocasiones pasan ahí, y con el mismo ancho que el campo entero sale a la
 * misma escala que los demás mapas.
 */
const TERCIO = 40;
function Cancha({ tercio = false, fondo, children, etiqueta }: { tercio?: boolean; fondo?: ReactNode; children?: ReactNode; etiqueta: string }) {
  const alto = tercio ? TERCIO : 120;
  return <svg className={tercio ? "snap-cancha tercio" : "snap-cancha"} viewBox={`-2 -3 84 ${alto + 5}`} role="img" aria-label={etiqueta}>
    <Cesped ancho={80} largo={alto} franja={10} radio={1.5} />
    {fondo}
    <g className="snap-lineas">
      <rect x={0} y={0} width={80} height={120} />
      <line x1={0} y1={60} x2={80} y2={60} />
      <circle cx={40} cy={60} r={10} />
      <rect x={18} y={0} width={44} height={18} />
      <rect x={30} y={0} width={20} height={6} />
      <path d="M32 18 A10 10 0 0 0 48 18" />
      <rect x={18} y={102} width={44} height={18} />
      <rect x={30} y={114} width={20} height={6} />
      <path d="M32 102 A10 10 0 0 1 48 102" />
      {tercio && <line x1={0} y1={TERCIO} x2={80} y2={TERCIO} />}
    </g>
    {children}
  </svg>;
}

function Tarjeta({ titulo, subtitulo, leyenda, aviso, children, clase = "" }: { titulo: string; subtitulo?: string; leyenda?: ReactNode; aviso?: string; children: ReactNode; clase?: string }) {
  return <figure className={`snap-tarjeta ${clase}`.trim()}>
    <figcaption><b>{titulo}</b>{subtitulo && <small>{subtitulo}</small>}</figcaption>
    {aviso && <p className="snap-vacio snap-aviso" role="status">{aviso}</p>}
    {children}
    {leyenda && <div className="snap-leyenda">{leyenda}</div>}
  </figure>;
}

function RejillaCampo({ puntos, modo, etiqueta }: { puntos: Punto[]; modo: "pct" | "n"; etiqueta: string }) {
  const { conteos, total, columnas, filas } = rejilla(puntos);
  const max = Math.max(1, ...conteos.flat());
  const ancho = 80 / columnas, alto = 120 / filas;
  return <Cancha etiqueta={etiqueta} fondo={conteos.map((fila, f) => fila.map((n, c) => (
    <rect key={`${f}-${c}`} x={c * ancho} y={f * alto} width={ancho} height={alto} className="snap-celda" style={{ fillOpacity: 0.08 + (n / max) * 0.72 }} />
  )))}>
    {conteos.map((fila, f) => fila.map((n, c) => (
      <text key={`${f}-${c}`} x={c * ancho + ancho / 2} y={f * alto + alto / 2 + 1.2} className="snap-celda-texto">
        {modo === "pct" ? `${total ? num((n / total) * 100, 1) : 0}%` : n}
      </text>
    )))}
  </Cancha>;
}

/** Las trece familias en rosa: largo = percentil, cifra = desviaciones típicas. */
function RadarFamilias({ valores }: { valores: DatosFicha["propias"] }) {
  const familias = COMPUESTAS.filter((c) => valores[c.id]);
  const n = familias.length;
  if (!n) return null;
  const C = 200, R0 = 26, R1 = 132;
  const paso = (Math.PI * 2) / n;
  const radio = (p: number) => R0 + (R1 - R0) * Math.max(0, Math.min(100, p)) / 100;
  const punto = (a: number, r: number) => [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
  // Lienzo más ancho que el radar: las etiquetas de los lados ("Defensa en
  // campo propio") salían cortadas por el borde.
  return <svg className="snap-radar" viewBox="-80 -6 560 412" role="img" aria-label={t("Familias del jugador")}>
    {[25, 50, 75, 100].map((p) => <circle key={p} cx={C} cy={C} r={radio(p)} className={p === 50 ? "snap-anillo mediana" : "snap-anillo"} />)}
    {familias.map((familia, i) => {
      const valor = valores[familia.id];
      const a0 = i * paso + paso * 0.07, a1 = (i + 1) * paso - paso * 0.07, r = radio(valor.percentil);
      const [x0, y0] = punto(a0, R0), [x1, y1] = punto(a0, r), [x2, y2] = punto(a1, r), [x3, y3] = punto(a1, R0);
      const medio = (i + 0.5) * paso;
      const [tx, ty] = punto(medio, Math.max(r - 11, R0 + 12));
      const [lx, ly] = punto(medio, R1 + 16);
      const seno = Math.sin(medio);
      return <g key={familia.id}>
        <path d={`M${x0} ${y0}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${R0} ${R0} 0 0 0 ${x0} ${y0}Z`} className="snap-cuna">
          <title>{`${t(familia.etiqueta)} · z ${conSigno(valor.z)} · P${valor.percentil}`}</title>
        </path>
        <text x={tx} y={ty + 3} className="snap-cuna-z">{conSigno(valor.z)}</text>
        <text x={lx} y={ly + 3} textAnchor={seno > 0.05 ? "start" : seno < -0.05 ? "end" : "middle"} className="snap-radar-etiqueta">{t(familia.corta)}</text>
      </g>;
    })}
    <circle cx={C} cy={C} r={R0 - 3} className="snap-radar-centro" />
  </svg>;
}

// Los tres tamaños de nombre, en unidades del SVG: el del informe manda, sus
// parecidos se leen y el resto acompaña sin competir.
const NOMBRE = { objetivo: 11, parecido: 9.5, resto: 8.5 } as const;

function Enjambre({ id, grupo, objetivo, destacados, nombres }: { id: string; grupo: GrupoCompuesto; objetivo: number; destacados: number[]; nombres: (i: number) => string }) {
  const puntos = [...new Set([...grupo.indices, objetivo])]
    .map((i) => ({ i, z: grupo.valores.get(i)?.[id]?.z ?? Number.NaN }))
    .filter((p) => Number.isFinite(p.z));
  if (puntos.length < 3) return <p className="snap-vacio">{t("Sin datos suficientes.")}</p>;
  const W = 380, margen = 14, r = 2.8;
  const min = Math.min(...puntos.map((p) => p.z)), max = Math.max(...puntos.map((p) => p.z));
  const x = (z: number) => margen + ((z - min) / Math.max(max - min, 1e-6)) * (W - margen * 2);
  const ys = enjambre(puntos.map((p) => x(p.z)), r);
  // Los nombres van encima, en carriles, con una línea hasta su punto: en
  // una fila de puntos tan juntos no hay sitio para ponerlos al lado. Solo
  // el jugador y sus cinco más parecidos: con más nombres la fila se volvía
  // ilegible y no era lo que se busca leer en ella.
  const tipo = (i: number) => (i === objetivo ? "objetivo" : destacados.includes(i) ? "parecido" : "resto");
  const tamano = (i: number) => NOMBRE[tipo(i)];
  const { posiciones, total } = carriles(puntos.filter((p) => tipo(p.i) !== "resto").map((p) => ({
    id: p.i, x: x(p.z), ancho: anchoDeTexto(apellido(nombres(p.i)), tamano(p.i)),
    // El jugador del informe primero (carril más cercano), luego sus parecidos.
    prioridad: tipo(p.i) === "objetivo" ? 1 : 0, forzar: true,
  })), 2, W - 2);
  const conNombre = puntos.map((p, k) => ({ ...p, k })).filter((p) => posiciones.has(p.i));
  const semi = Math.max(18, ...ys.map((y) => Math.abs(y))) + r + 2;
  const arriba = total ? total * 12 + 8 : 4;
  const cy = arriba + semi;
  const eje = cy + semi + 4;
  const alto = eje + 14;
  const marcas = [];
  for (let z = Math.ceil(min); z <= Math.floor(max); z += 1) marcas.push(z);
  const orden = [...puntos.keys()].sort((a, b) => {
    const rango = (p: { i: number }) => (p.i === objetivo ? 2 : destacados.includes(p.i) ? 1 : 0);
    return rango(puntos[a]) - rango(puntos[b]);
  });
  return <svg className="snap-enjambre" viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={t(COMPUESTAS.find((c) => c.id === id)?.etiqueta ?? id)}>
    <line x1={margen} y1={eje} x2={W - margen} y2={eje} className="snap-eje" />
    {marcas.map((z) => <g key={z}>
      <line x1={x(z)} y1={arriba - 2} x2={x(z)} y2={eje + 2} className={z === 0 ? "snap-eje cero" : "snap-rejilla"} />
      <text x={x(z)} y={eje + 11} className="snap-eje-texto">{z}</text>
    </g>)}
    {conNombre.map((p) => {
      const sitio = posiciones.get(p.i)!;
      const base = arriba - 5 - sitio.carril * 12;
      const radioPunto = p.i === objetivo ? 4.6 : r;
      return <line key={`g${p.i}`} x1={sitio.x} y1={base + 2} x2={x(p.z)} y2={cy + ys[p.k] - radioPunto - 0.5} className={`snap-guia ${tipo(p.i)}`} />;
    })}
    {orden.map((k) => {
      const p = puntos[k];
      const clase = p.i === objetivo ? "snap-punto objetivo" : destacados.includes(p.i) ? "snap-punto parecido" : "snap-punto";
      return <circle key={p.i} cx={x(p.z)} cy={cy + ys[k]} r={p.i === objetivo ? 4.6 : r} className={clase} />;
    })}
    {conNombre.map((p) => {
      const sitio = posiciones.get(p.i)!;
      return <text key={`n${p.i}`} x={sitio.x} y={arriba - 5 - sitio.carril * 12} textAnchor="middle" style={{ fontSize: tamano(p.i) }}
        className={`snap-punto-nombre ${tipo(p.i)}`}>{apellido(nombres(p.i))}</text>;
    })}
  </svg>;
}

function Dispersion({ grupo, objetivo, destacados, nombres, ejeX, ejeY }: {
  grupo: GrupoCompuesto; objetivo: number; destacados: number[]; nombres: (i: number) => string; ejeX: string; ejeY: string;
}) {
  const puntos = [...new Set([...grupo.indices, objetivo])]
    .map((i) => ({ i, x: grupo.valores.get(i)?.[ejeX]?.z ?? Number.NaN, y: grupo.valores.get(i)?.[ejeY]?.z ?? Number.NaN }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (puntos.length < 3) return <p className="snap-vacio">{t("Sin datos suficientes.")}</p>;
  const W = 380, H = 290, m = 30;
  const xs = puntos.map((p) => p.x), ys = puntos.map((p) => p.y);
  // Un 7 % de aire a cada lado: los jugadores de los extremos no quedan
  // pegados al marco y su nombre tiene dónde ir.
  const aire = (a: number, b: number) => [a - (b - a) * 0.07, b + (b - a) * 0.07];
  const [x0, x1] = aire(Math.min(...xs, -1), Math.max(...xs, 1)), [y0, y1] = aire(Math.min(...ys, -1), Math.max(...ys, 1));
  const X = (v: number) => m + ((v - x0) / (x1 - x0)) * (W - m - 10);
  const Y = (v: number) => H - m - ((v - y0) / (y1 - y0)) * (H - m - 10);
  const marcas = (a: number, b: number) => { const s = []; for (let v = Math.ceil(a); v <= Math.floor(b); v += 1) s.push(v); return s; };
  const orden = [...puntos].sort((a, b) => Number(a.i === objetivo || destacados.includes(a.i)) - Number(b.i === objetivo || destacados.includes(b.i)));
  const tipo = (i: number) => (i === objetivo ? "objetivo" : destacados.includes(i) ? "parecido" : "resto");
  const radio = (i: number) => (i === objetivo ? 5 : destacados.includes(i) ? 3.6 : 2.6);
  // Todos con nombre. En un grupo grande sería una pared de texto: ahí solo
  // el jugador, sus parecidos y los diez que más se alejan del centro.
  const nombrables = new Set(puntos.length > 40
    ? [...puntos].sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y)).slice(0, 10).map((p) => p.i)
    : puntos.map((p) => p.i));
  const etiquetas = colocarEtiquetas(
    puntos.filter((p) => tipo(p.i) !== "resto" || nombrables.has(p.i)).map((p) => ({
      id: p.i, x: X(p.x), y: Y(p.y), r: radio(p.i), texto: apellido(nombres(p.i)),
      tamano: NOMBRE[tipo(p.i)], prioridad: tipo(p.i) === "objetivo" ? 3 : tipo(p.i) === "parecido" ? 2 : 1, forzar: tipo(p.i) !== "resto",
    })),
    { x0: m + 2, y0: 2, x1: W - 2, y1: H - m - 2 },
    puntos.map((p) => ({ x: X(p.x), y: Y(p.y), r: radio(p.i) })),
  );
  const punto = new Map(puntos.map((p) => [p.i, p]));
  return <svg className="snap-dispersion" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(COMPUESTAS.find((c) => c.id === ejeX)!.etiqueta)} · ${t(COMPUESTAS.find((c) => c.id === ejeY)!.etiqueta)}`}>
    {marcas(x0, x1).map((v) => <g key={`x${v}`}><line x1={X(v)} y1={10} x2={X(v)} y2={H - m} className={v === 0 ? "snap-eje cero" : "snap-rejilla"} /><text x={X(v)} y={H - m + 12} className="snap-eje-texto">{v}</text></g>)}
    {marcas(y0, y1).map((v) => <g key={`y${v}`}><line x1={m} y1={Y(v)} x2={W - 10} y2={Y(v)} className={v === 0 ? "snap-eje cero" : "snap-rejilla"} /><text x={m - 6} y={Y(v) + 3} className="snap-eje-texto fin">{v}</text></g>)}
    {etiquetas.filter((e) => e.guia).map((e) => {
      const p = punto.get(e.id)!;
      return <line key={`g${e.id}`} x1={X(p.x)} y1={Y(p.y)} x2={e.x} y2={e.y - NOMBRE[tipo(e.id)] * 0.3} className="snap-guia" />;
    })}
    {orden.map((p) => <circle key={p.i} cx={X(p.x)} cy={Y(p.y)} r={radio(p.i)}
      className={tipo(p.i) === "objetivo" ? "snap-punto objetivo" : tipo(p.i) === "parecido" ? "snap-punto parecido" : "snap-punto"} />)}
    {/* Los nombres, encima de todos los puntos y con un halo del color del
        papel: se leen aunque pasen por encima de una línea de la rejilla. */}
    {etiquetas.map((e) => <text key={`n${e.id}`} x={e.x} y={e.y} textAnchor={e.ancla} style={{ fontSize: NOMBRE[tipo(e.id)] }}
      className={`snap-punto-nombre ${tipo(e.id)}`}>{apellido(nombres(e.id))}</text>)}
    <text x={(W + m) / 2} y={H - 2} className="snap-eje-titulo">{t(COMPUESTAS.find((c) => c.id === ejeX)!.etiqueta)}</text>
    <text x={10} y={(H - m) / 2} transform={`rotate(-90 10 ${(H - m) / 2})`} className="snap-eje-titulo">{t(COMPUESTAS.find((c) => c.id === ejeY)!.etiqueta)}</text>
  </svg>;
}

// ---- Una pieza --------------------------------------------------------------

/** Dibuja una pieza. `opcion` es la familia del Top 10 o cómo se agrupan las recepciones. */
export function PiezaFicha({ pieza, datos, opcion, onOpcion }: {
  pieza: IdPieza;
  datos: DatosFicha;
  opcion?: string;
  onOpcion?: (valor: string) => void;
}) {
  const { contexto, jugador, equipo, fuente, eventos, grupo, propias, nombreGrupo, parecidos, destacados, nombres, sinEventos } = datos;
  const { rows, indice, informe, perfilTm, onAbrirJugador } = contexto;
  // Para el difuminado del mapa de acciones ganadas: un id por pieza.
  const idDifuso = `snap-difuso-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const conGrupo = datos.marco?.modo === "liga"
    ? tf("frente a {n} {grupo} de su liga ({marco})", { n: grupo.indices.length, grupo: nombreGrupo.toLowerCase(), marco: datos.marco.texto })
    : tf("frente a {n} {grupo}", { n: grupo.indices.length, grupo: nombreGrupo.toLowerCase() });

  switch (pieza) {
    case "ficha": {
      /*
       * La misma tarjeta que Ficha y radar, en pequeño: retrato grafito con
       * el brillo del club, escudo arriba a la izquierda y dorsal arriba a la
       * derecha (los dos con el borde blanco de la foto), la foto recortada,
       * y al lado la liga, el nombre, la posición y los datos; debajo, la
       * franja de la temporada con el índice.
       */
      const dorsal = eventos?.dorsal || perfilTm?.number || "";
      const iniciales = jugador.split(/\s+/).map((p) => p[0]).slice(0, 2).join("");
      // Todo de la temporada que se mira: el informe puede sumar dos temporadas
      // (el radar se mide con las dos) y salía "54 partidos · 2.451 minutos".
      const deLaTemporada = (columna: string, respaldo: number) => {
        const valor = Number(rows[indice]?.[columna]);
        return Number.isFinite(valor) && rows[indice]?.[columna] !== "" ? valor : respaldo;
      };
      const minutosTemporada = deLaTemporada("Minutes played", informe.minutes);
      const dato = (valor: unknown) => (valor === undefined || valor === null || valor === "" || valor === "—" ? "—" : String(valor));
      return <div className="snap-ficha">
        <div className="snap-retrato">
          <span className="snap-retrato-brillo" aria-hidden="true" />
          {perfilTm?.clubLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="snap-retrato-escudo" src={perfilTm.clubLogo} alt="" />
            : <Escudo equipo={equipo} liga={fuente?.liga ?? ""} tamano={34} respaldo className="snap-retrato-escudo" />}
          {dorsal && <b className="snap-retrato-dorsal">{dorsal}</b>}
          {perfilTm?.playerImage
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="snap-retrato-foto" src={perfilTm.playerImage} alt="" />
            : <span className="snap-retrato-iniciales">{iniciales}</span>}
        </div>
        <div className="snap-retrato-info">
          <div className="snap-retrato-competicion">
            {perfilTm?.leagueLogo
              // eslint-disable-next-line @next/next/no-img-element
              && <img src={perfilTm.leagueLogo} alt="" />}
            <span><b>{fuente?.liga || perfilTm?.league || t("Competición")}</b><small>{perfilTm?.club || equipo}</small></span>
          </div>
          <h3>{jugador}</h3>
          <div className="snap-retrato-identidad"><b>{informe.position || "—"}</b><span>{perfilTm?.citizenship || informe.passport || ""}</span></div>
          <dl>
            <div><dt>{t("Edad")}</dt><dd>{dato(perfilTm?.age || informe.age)}</dd></div>
            <div><dt>{t("Altura")}</dt><dd>{dato(perfilTm?.height)}</dd></div>
            <div><dt>{t("Pie")}</dt><dd>{dato(perfilTm?.foot || informe.foot)}</dd></div>
            <div><dt>{t("Contrato")}</dt><dd>{dato(perfilTm?.contract || informe.contract)}</dd></div>
            <div><dt>{t("Valor")}</dt><dd>{dato(perfilTm?.marketValue)}</dd></div>
            <div><dt>{t("Temporada")}</dt><dd>{dato(fuente?.temporada)}</dd></div>
          </dl>
        </div>
        <div className="snap-retrato-franja">
          <div><b>{num(deLaTemporada("Matches played", informe.matches))}</b><span>{t("Partidos")}</span></div>
          <div><b>{num(minutosTemporada)}</b><span>{t("Minutos")}</span></div>
          <div className="goles"><b>{num(deLaTemporada("Goals", informe.goals))}</b><span>{t("Goles")}</span></div>
          <div className="asistencias"><b>{num(deLaTemporada("Assists", informe.assists))}</b><span>{t("Asist.")}</span></div>
          <div className="snap-retrato-anillo" style={{ "--score": `${informe.score * 3.6}deg` } as CSSProperties}><b>{informe.score}</b><span>{t("Índice")}</span></div>
        </div>
      </div>;
    }

    case "tabla": {
      // Filas de métrica por conjunto: la barra es el percentil con el
      // degradado de su color, la marca el central típico (P50) y el chip
      // cuántas desviaciones típicas se aparta de él.
      const conDato = COMPUESTAS.filter((c) => propias[c.id]);
      const porConjunto = SIMILARITY_METRIC_GROUPS
        .map((g) => ({ g, familias: conDato.filter((c) => conjuntoDeFamilia(c.id).id === g.id).sort((a, b) => propias[b.id].percentil - propias[a.id].percentil) }))
        .filter((bloque) => bloque.familias.length);
      return <div className="snap-tabla n-familias" role="list" aria-label={tf("Familias frente a {n} {grupo}", { n: grupo.indices.length, grupo: nombreGrupo.toLowerCase() })}>
        <p className="snap-tabla-titulo">{conGrupo}</p>
        {porConjunto.map(({ g, familias }) => <section key={g.id} role="listitem" style={{ "--n-grupo": g.color } as CSSProperties}>
          <h4 className="n-grupo-titulo">{t(g.label)}</h4>
          {familias.map((c) => <FilaDeMetrica key={c.id}
            etiqueta={<>{t(c.etiqueta)}{c.fuente === "skillcorner" && <em className="snap-fuente-sc" title="SkillCorner">SC</em>}</>}
            cifra={`P${propias[c.id].percentil}`}
            chip={<ChipDeCambio cambio={propias[c.id].z} umbral={0.25} texto={Math.abs(propias[c.id].z).toFixed(2)} />}
            valor={propias[c.id].percentil} tonos={tonosDeColor(g.color)} marca={50} />)}
        </section>)}
      </div>;
    }

    case "radar":
      return <Tarjeta titulo={t("Familias")} subtitulo={t("Largo: percentil · cifra: desviaciones típicas")} clase="snap-radar-tarjeta">
        <RadarFamilias valores={propias} />
      </Tarjeta>;

    case "top10": {
      const familia = COMPUESTAS.find((c) => c.id === opcion) ?? COMPUESTAS.find((c) => c.id === "progresion") ?? COMPUESTAS[0];
      const top = datos.candidatosDelTop
        .map(({ i, valores }) => ({ i, z: valores?.[familia.id]?.z ?? Number.NaN }))
        .filter((p) => Number.isFinite(p.z))
        .sort((a, b) => b.z - a.z)
        .slice(0, 10);
      return <Tarjeta titulo={t("Top 10")} subtitulo={datos.ligasDeLaLista ? tf("{f} · cada uno en su liga · {ligas}", { f: t(familia.etiqueta), ligas: datos.ligasDeLaLista }) : undefined} clase="snap-top">
        <Desplegable etiqueta={t("Familia")} valor={t(familia.etiqueta)} activo={false}>
          <select aria-label={t("Familia")} value={familia.id} onChange={(evento) => onOpcion?.(evento.target.value)} onClick={(evento) => evento.stopPropagation()}>
            {COMPUESTAS.map((c) => <option key={c.id} value={c.id}>{c.fuente === "skillcorner" ? `${t(c.etiqueta)} · SkillCorner` : t(c.etiqueta)}</option>)}
          </select>
        </Desplegable>
        <ol>
          {top.map(({ i, z }, posicion) => (
            <li key={i} className={i === indice ? "activo" : undefined} onClick={() => onAbrirJugador?.(i)}>
              <span>{posicion + 1}</span>
              <b>{nombres(i)}<small>{[String(rows[i]?.Team ?? ""), ...(contexto.ligasExtra?.length ? [datos.ligaEnLaLista(i)] : [])].filter(Boolean).join(" · ")}</small><BarraDegradada valor={(z / Math.max(top[0]?.z ?? 1, 0.01)) * 100} tonos={tonosDeColor(conjuntoDeFamilia(familia.id).color)} /></b>
              <em>{conSigno(z)}</em>
            </li>
          ))}
        </ol>
      </Tarjeta>;
    }

    case "puestos": {
      const { minutosPos, totalPos } = datos;
      return <Tarjeta titulo={t("Tiempo en cada puesto")} subtitulo={eventos ? tf("{m} minutos en {n} puestos", { m: num(totalPos), n: minutosPos.length }) : undefined} clase="snap-puestos">
        <Cancha etiqueta={t("Tiempo en cada puesto")}>
          {minutosPos.map(([codigo, minutos]) => {
            const lugar = POSICION_EN_CAMPO[codigo];
            if (!lugar) return null;
            const parte = totalPos ? minutos / totalPos : 0;
            return <g key={codigo}>
              <circle cx={lugar[0]} cy={lugar[1]} r={3.7 + parte * 9} className="snap-puesto-halo" />
              <circle cx={lugar[0]} cy={lugar[1]} r={3.2 + parte * 9} className="snap-puesto" style={{ fill: rampaDeRed(Math.sqrt(parte)), opacity: parte ? 1 : 0.5 }} />
              <text x={lugar[0]} y={lugar[1] + 1.2} className="snap-puesto-pct">{`${Math.round(parte * 100)}%`}</text>
              <text x={lugar[0]} y={lugar[1] + 4.6 + parte * 9} className="snap-puesto-codigo">{codigo}</text>
            </g>;
          })}
        </Cancha>
        {minutosPos.length > 0 && <ol className="snap-puestos-lista">
          {minutosPos.slice(0, 5).map(([codigo, minutos]) => <li key={codigo}><b>{codigo}</b><span>{num(minutos)}′</span><em>{`${Math.round((minutos / totalPos) * 100)}%`}</em></li>)}
        </ol>}
      </Tarjeta>;
    }

    case "parecidos": {
      const lista = parecidos;
      return <Tarjeta titulo={tf("Los que más se parecen a {nombre}", { nombre: apellido(jugador) })}
        subtitulo={datos.ligasDeLaLista
          ? tf("{n} más cercanos de su puesto · {ligas}", { n: lista.length, ligas: datos.ligasDeLaLista })
          : tf("{n} más cercanos de su puesto en la base", { n: lista.length })} clase="snap-parecidos">
        <ol>
          {lista.map((p, posicion) => (
            <li key={p.index} onClick={() => onAbrirJugador?.(p.index)}>
              <span>{posicion + 1}</span>
              <b>{p.name}</b>
              <small>{[p.team, ...(contexto.ligasExtra?.length ? [datos.ligaEnLaLista(p.index)] : [])].filter(Boolean).join(" · ")}</small>
              <em>{`${num(p.similarity, 1)}%`}</em>
              <BarraDegradada valor={p.similarity} tonos={TONOS_ACENTO} />
            </li>
          ))}
        </ol>
      </Tarjeta>;
    }

    case "tiros": {
      // Los de más lejos que el último tercio no caben en el dibujo: se dice cuántos.
      const lejos = datos.tiros.filter((e) => aVertical(e.l!)[1] > TERCIO + 2).length;
      return <Tarjeta titulo={t("Tiros")} subtitulo={sinEventos ? undefined : tf("{n} tiros · {g} goles · {x} xG", { n: datos.tiros.length, g: datos.goles, x: num(datos.xgTotal, 2) })}
        leyenda={<><i className="snap-l gol" />{t("Gol")}<i className="snap-l tiro" />{t("Sin gol")}<span>{t("tamaño = xG")}</span>
          {lejos > 0 && <span>{tf("{n} desde fuera del último tercio", { n: lejos })}</span>}</>}>
        <Cancha tercio etiqueta={t("Tiros")}>
          {/* Gol = estrella verde con borde blanco; el resto, círculo rojo. Tamaño = xG. */}
          {datos.tiros.map((e, i) => {
            const [X, Y] = aVertical(e.l!);
            const radio = 0.9 + Math.sqrt(Math.max(e.xg ?? 0.01, 0.01)) * 5;
            return e.o === "Goal"
              ? <path key={i} d={estrella(X, Y, radio * 1.35)} className="snap-tiro gol" />
              : <circle key={i} cx={X} cy={Y} r={radio} className="snap-tiro" />;
          })}
        </Cancha>
      </Tarjeta>;
    }

    case "ocasiones": {
      const claseOcasion = (e: EventoSB) => (e.ga ? "asistencia" : e.pt === "Corner" || e.pt === "Free Kick" ? "parado" : e.cr ? "centro" : "juego");
      return <Tarjeta titulo={t("Ocasiones creadas")} subtitulo={sinEventos ? undefined : tf("{n} pases a tiro · {a} asistencias", { n: datos.ocasiones.length, a: datos.asistencias })}
        leyenda={<><i className="snap-l juego" />{t("Juego")}<i className="snap-l centro" />{t("Centro")}<i className="snap-l parado" />{t("Balón parado")}<i className="snap-l asistencia" />{t("Asistencia")}</>}>
        <Cancha tercio etiqueta={t("Ocasiones creadas")}>
          {datos.ocasiones.map((e, i) => {
            const [x0, y0] = aVertical(e.l!), [x1, y1] = aVertical(e.e!);
            // Cometa que engorda hacia el destino, en el color de su tipo de acción.
            return <g key={i} className={`snap-ocasion ${claseOcasion(e)}`}><Cometa x1={x0} y1={y0} x2={x1} y2={y1} ancho={1.5} color={COLOR_OCASION[claseOcasion(e)]} opacidad={0.92} /><circle cx={x1} cy={y1} r={0.85} /></g>;
          })}
        </Cancha>
      </Tarjeta>;
    }

    case "ganadas": {
      // Dónde gana el balón en defensa y dónde gana la acción en ataque, en un
      // solo mapa de calor de dos colores (lib/snapshot.ts, mapaDeGanadas).
      const celdas = mapaDeGanadas(
        datos.defensivasGanadas.map((e) => [e.l![0], e.l![1]] as Punto),
        datos.ofensivasGanadas.map((e) => [e.l![0], e.l![1]] as Punto),
      );
      return <Tarjeta titulo={t("Acciones ganadas")} subtitulo={sinEventos ? undefined : tf("{d} defensivas · {o} ofensivas", { d: datos.defensivasGanadas.length, o: datos.ofensivasGanadas.length })}
        leyenda={<>
          <i className="snap-l defensiva" /><span title={t("Entradas e intercepciones ganadas, recuperaciones, bloqueos y despejes.")}>{t("Defensivas")}</span>
          <i className="snap-l ambas" /><span>{t("Las dos")}</span>
          <i className="snap-l ofensiva" /><span title={t("Regates completados, faltas recibidas y duelos aéreos ganados.")}>{t("Ofensivas")}</span>
        </>}>
        <Cancha etiqueta={t("Acciones ganadas")} fondo={<>
          <defs>
            <filter id={idDifuso} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={2.2} /></filter>
            <clipPath id={`${idDifuso}-campo`}><rect x={0} y={0} width={80} height={120} /></clipPath>
          </defs>
          <g clipPath={`url(#${idDifuso}-campo)`}>
            <g filter={`url(#${idDifuso})`}>
              {celdas.map((celda) => <rect key={`${celda.x}-${celda.y}`} x={celda.x} y={celda.y} width={celda.w + 0.1} height={celda.h + 0.1}
                className="snap-calor-ganadas" style={{ fill: celda.color, fillOpacity: celda.opacidad }} />)}
            </g>
          </g>
        </>} />
      </Tarjeta>;
    }

    case "pases_inicio":
      return <Tarjeta titulo={t("Dónde empieza sus pases")} subtitulo={sinEventos ? undefined : tf("{n} pases en juego abierto", { n: num(datos.pasesJuego.length) })}>
        <RejillaCampo puntos={datos.pasesJuego.map((e) => [e.l![0], e.l![1]] as Punto)} modo="pct" etiqueta={t("Dónde empieza sus pases")} />
      </Tarjeta>;

    case "pases_fin":
      return <Tarjeta titulo={t("Dónde terminan sus pases")} subtitulo={sinEventos ? undefined : tf("{n} destinos", { n: num(datos.pasesJuego.filter((e) => e.e).length) })}>
        <RejillaCampo puntos={datos.pasesJuego.filter((e) => e.e).map((e) => [e.e![0], e.e![1]] as Punto)} modo="pct" etiqueta={t("Dónde terminan sus pases")} />
      </Tarjeta>;

    case "calor": {
      const { celdas, columnas, filas } = densidad(datos.acciones.map((e) => [e.l![0], e.l![1]] as Punto));
      const w = 80 / columnas, h = 120 / filas;
      return <Tarjeta titulo={t("Mapa de calor")} subtitulo={sinEventos ? undefined : tf("{n} acciones en juego abierto", { n: num(datos.acciones.length) })}>
        <Cancha etiqueta={t("Mapa de calor")} fondo={celdas.map((fila, f) => fila.map((v, c) => v > 0.02
          ? <rect key={`${f}-${c}`} x={c * w} y={f * h} width={w + 0.1} height={h + 0.1} className="snap-calor" style={{ fillOpacity: v * 0.9 }} />
          : null))} />
      </Tarjeta>;
    }

    case "defensa": {
      const { defensivas, cuenta } = datos;
      // El desglose va en la leyenda: en el subtítulo ocupaba cuatro líneas y
      // bajaba el campo respecto de los de su fila.
      return <Tarjeta titulo={t("Acciones defensivas")} subtitulo={sinEventos ? undefined : tf("{n} en total", { n: defensivas.length })}
        leyenda={sinEventos ? undefined : <span>{tf("{e} entradas · {r} recuperaciones · {i} intercepciones · {d} despejes", {
          e: cuenta("Duel", "Tackle"), r: cuenta("Ball Recovery"), i: cuenta("Interception"), d: cuenta("Clearance"),
        })}</span>}>
        <RejillaCampo puntos={defensivas.map((e) => [e.l![0], e.l![1]] as Punto)} modo="n" etiqueta={t("Acciones defensivas")} />
      </Tarjeta>;
    }

    case "recepciones": {
      const agrupacion = agrupacionRecepcion(opcion);
      const r = resumenRecepciones(eventos?.eventos ?? [], agrupacion.id);
      const color = new Map(agrupacion.grupos.map((g) => [g.id, g.color]));
      const porNoventa = datos.totalPos ? (r.total / datos.totalPos) * 90 : 0;
      // Con cientos de recepciones los puntos se tapan: debajo va la densidad
      // por zonas (más clara donde más recibe, como el radar) y encima el
      // porcentaje de las zonas que pesan.
      const zonas = (() => {
        const { conteos, total, columnas, filas } = rejilla(r.lista.map((e) => [e.l![0], e.l![1]] as Punto));
        return {
          total, max: Math.max(1, ...conteos.flat()), w: 80 / columnas, h: 120 / filas,
          celdas: conteos.flatMap((fila, f) => fila.map((n, c) => ({ f, c, n }))).filter(({ n }) => n > 0),
        };
      })();
      // Primero lo más frecuente: los grupos raros van encima y no quedan
      // enterrados bajo cien recepciones al pie.
      const frecuencia = new Map(r.grupos.map((g) => [g.id, g.n]));
      const orden = r.lista
        .map((e) => ({ e, grupo: grupoDeRecepcion(e, agrupacion.id) }))
        .sort((a, b) => (frecuencia.get(b.grupo ?? "") ?? 0) - (frecuencia.get(a.grupo ?? "") ?? 0));
      return <Tarjeta titulo={t("Dónde recibe")} subtitulo={sinEventos ? undefined : tf("{n} recepciones · {p} por 90", { n: num(r.total), p: num(porNoventa, 1) })} clase="snap-con-chip snap-recepciones"
        leyenda={<>
          {r.grupos.filter((g) => g.n).map((g) => <span key={g.id} className="snap-l-grupo"><i style={{ background: g.color }} />{t(g.etiqueta)} <b>{num(g.n)}</b></span>)}
          {r.fallidas > 0 && <span className="snap-l-grupo"><i className="hueco" />{t("No controlada")}</span>}
        </>}>
        <Desplegable etiqueta={t("Agrupar por")} valor={t(agrupacion.etiqueta)} activo={false}>
          <select aria-label={t("Agrupar por")} value={agrupacion.id} onChange={(evento) => onOpcion?.(evento.target.value)} onClick={(evento) => evento.stopPropagation()}>
            {AGRUPACIONES_RECEPCION.map((a) => <option key={a.id} value={a.id}>{t(a.etiqueta)}</option>)}
          </select>
        </Desplegable>
        {/* Con cientos de recepciones los puntos se tapan entre sí: debajo va la
            densidad por zonas (más clara donde más recibe, como el radar) y el
            porcentaje en las que pesan; encima, los puntos con el color de su
            grupo, más pequeños. */}
        <Cancha etiqueta={t("Dónde recibe")} fondo={zonas.celdas.map(({ f, c, n }) => (
          <rect key={`${f}-${c}`} x={c * zonas.w + 0.4} y={f * zonas.h + 0.4} width={zonas.w - 0.8} height={zonas.h - 0.8} rx={1.2} className="snap-zona" style={{ fill: rampaDeRed(n / zonas.max), fillOpacity: 0.14 + (n / zonas.max) * 0.5 }} />
        ))}>
          {orden.map(({ e, grupo }, i) => {
            const [X, Y] = aVertical(e.l!);
            const tinta = (grupo && color.get(grupo)) || "#9aa0a6";
            return e.o === "Incomplete"
              ? <circle key={i} cx={X} cy={Y} r={0.7} className="snap-recepcion fallida" style={{ stroke: tinta }} />
              : <circle key={i} cx={X} cy={Y} r={0.62} className="snap-recepcion" style={{ fill: tinta }} />;
          })}
          {/* El porcentaje de las zonas que pesan, por encima de los puntos. */}
          {zonas.celdas.filter(({ n }) => zonas.total && n / zonas.total >= 0.08).map(({ f, c, n }) => (
            <text key={`p-${f}-${c}`} x={c * zonas.w + zonas.w / 2} y={f * zonas.h + zonas.h / 2 + 1.2} className="snap-zona-pct">{`${Math.round((n / zonas.total) * 100)}%`}</text>
          ))}
        </Cancha>
      </Tarjeta>;
    }

    case "recepciones_tipo": {
      const agrupacion = agrupacionRecepcion(opcion);
      const r = resumenRecepciones(eventos?.eventos ?? [], agrupacion.id);
      const agrupadas = r.grupos.reduce((s, g) => s + g.n, 0);
      const maximo = Math.max(1, ...r.grupos.map((g) => g.n));
      return <Tarjeta titulo={t("Cómo recibe")} subtitulo={sinEventos ? undefined : `${t(agrupacion.etiqueta)} · ${tf("{n} recepciones", { n: num(r.total) })}`} clase="snap-como-recibe">
        <ol className="snap-barras">
          {r.grupos.map((g) => (
            <li key={g.id}>
              <span>{t(g.etiqueta)}</span>
              <i><b style={{ width: `${(g.n / maximo) * 100}%`, background: g.color }} /></i>
              <em>{pct(g.n, agrupadas)}</em>
            </li>
          ))}
        </ol>
        <dl className="snap-cifras">
          <div><dt>{t("En el último tercio")}</dt><dd>{pct(r.ultimoTercio, r.total)}</dd></div>
          <div><dt>{t("En el área")}</dt><dd>{pct(r.area, r.total)}</dd></div>
          <div><dt>{t("Presionado")}</dt><dd>{pct(r.presionadas, r.total)}</dd></div>
          <div><dt>{t("Progresivas")}</dt><dd>{pct(r.progresivas, r.total)}</dd></div>
          <div><dt>{t("No controladas")}</dt><dd>{pct(r.fallidas, r.total)}</dd></div>
          <div><dt>{t("Por 90")}</dt><dd>{num(datos.totalPos ? (r.total / datos.totalPos) * 90 : 0, 1)}</dd></div>
        </dl>
      </Tarjeta>;
    }

    case "recepciones_origen": {
      const r = resumenRecepciones(eventos?.eventos ?? [], "tipo");
      return <Tarjeta titulo={t("De dónde le llega")} subtitulo={sinEventos ? undefined : tf("Origen de {n} pases que recibe", { n: num(r.origenes.length) })}>
        <RejillaCampo puntos={r.origenes} modo="pct" etiqueta={t("De dónde le llega")} />
      </Tarjeta>;
    }

    case "recepciones_pasadores": {
      const r = resumenRecepciones(eventos?.eventos ?? [], "tipo");
      const lista = r.pasadores.slice(0, 8);
      return <Tarjeta titulo={t("Quién se la da")} subtitulo={sinEventos ? undefined : tf("{n} compañeros distintos", { n: r.pasadores.length })} clase="snap-parecidos snap-pasadores">
        <ol>
          {lista.map((p, posicion) => (
            <li key={p.nombre}>
              <span>{posicion + 1}</span>
              <b>{p.nombre}</b>
              <small>{tf("{n} balones", { n: num(p.n) })}</small>
              <em>{pct(p.n, r.total)}</em>
            </li>
          ))}
        </ol>
      </Tarjeta>;
    }

    case "roles": {
      const r = datos.roles;
      const aviso = !fuente
        ? t("Este jugador no viene de StatsBomb: los roles salen de sus eventos partido a partido.")
        : !r ? (datos.estadoRoles || t("Sin intervenciones de este jugador en las secuencias de su liga.")) : undefined;
      /*
       * La jugada de izquierda a derecha: arranca, circula, hace avanzar,
       * finaliza. Cada papel es una burbuja en su fase: el tamaño, qué parte
       * de su juego es; el color y la cifra, cuánto más que los de su puesto
       * (percentil). Antes eran ocho barras iguales y no se veía la jugada.
       */
      const FASES_DE_LA_JUGADA: Array<{ nombre: string; x: number; roles: Array<{ id: string; x: number; y: number }> }> = [
        { nombre: "Arranca", x: 24, roles: [{ id: "iniciador", x: 24, y: 64 }] },
        { nombre: "Circula", x: 74, roles: [{ id: "control", x: 74, y: 38 }, { id: "apoyo", x: 74, y: 90 }] },
        { nombre: "Hace avanzar", x: 140, roles: [{ id: "enlace", x: 118, y: 38 }, { id: "progresor", x: 162, y: 38 }, { id: "conductor", x: 118, y: 90 }, { id: "vertical", x: 162, y: 90 }] },
        { nombre: "Finaliza", x: 204, roles: [{ id: "remate", x: 204, y: 64 }] },
      ];
      const fila = (id: string) => r?.filas.find((f) => f.id === id);
      const destacan = r ? [...r.filas].filter((f) => f.parte >= 0.05).sort((x, y) => y.percentil - x.percentil).slice(0, 2) : [];
      return <Tarjeta titulo={t("Cómo participa en la jugada")}
        subtitulo={r ? tf("Frente a {n} {grupo} de {liga} · {i} intervenciones suyas en juego abierto", {
          n: r.grupo, grupo: nombreGrupo.toLowerCase(), liga: fuente?.liga ?? "", i: num(r.intervenciones),
        }) : undefined} aviso={aviso} clase="snap-roles">
        {r && <>
          {destacan.length > 0 && <p className="snap-roles-perfil">{tf("Perfil: {perfil}. Lo que más le distingue de los {grupo}: {lista}.", {
            perfil: r.perfil || t(ROLES_SECUENCIA.find((x) => x.id === destacan[0].id)?.perfil ?? ""), grupo: nombreGrupo.toLowerCase(),
            lista: destacan.map((f) => `${t(f.etiqueta).toLowerCase()} (P${f.percentil})`).join(t(" y ")),
          })}</p>}
          <svg viewBox="0 0 228 122" className="snap-roles-jugada" role="img" aria-label={t("Cómo participa en la jugada")}>
            {/* Las cuatro fases, con flechas: la jugada va hacia la portería rival. */}
            {FASES_DE_LA_JUGADA.map((fase, k) => <g key={fase.nombre}>
              <text x={fase.x} y={9} className="snap-roles-fase">{t(fase.nombre)}</text>
              {k < FASES_DE_LA_JUGADA.length - 1 && <path d={`M${fase.x + (k === 2 ? 38 : 17)} 64 L${FASES_DE_LA_JUGADA[k + 1].x - (k + 1 === 2 ? 38 : 17)} 64`} className="snap-roles-flecha" markerEnd="url(#snap-roles-punta)" />}
            </g>)}
            <defs><marker id="snap-roles-punta" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 6 3 0 6z" className="snap-roles-punta" /></marker></defs>
            {FASES_DE_LA_JUGADA.flatMap((fase) => fase.roles).map(({ id, x, y }) => {
              const f = fila(id);
              if (!f) return null;
              const radio = 6.5 + Math.sqrt(f.parte) * 12;
              const rol = ROLES_SECUENCIA.find((x) => x.id === id);
              return <g key={id} className="snap-roles-burbuja">
                <title>{`${t(rol?.etiqueta ?? id)}: ${t(rol?.descripcion ?? "")} P${f.percentil} · ${Math.round(f.parte * 100)} %`}</title>
                <circle cx={x} cy={y} r={radio} style={{ fill: rampaDeRed(f.percentil / 100) }} />
                <text x={x} y={y + 2} className={f.percentil >= 50 ? "snap-roles-p fuerte" : "snap-roles-p"}>{`P${f.percentil}`}</text>
                <text x={x} y={y + radio + 6.5} className="snap-roles-nombre">{t(f.etiqueta)}</text>
                <text x={x} y={y + radio + 12} className="snap-roles-parte">{`${Math.round(f.parte * 100)} %`}</text>
              </g>;
            })}
          </svg>
          <ul className="snap-roles-leyenda">
            {ROLES_SECUENCIA.map((rol) => <li key={rol.id}><b>{t(rol.etiqueta)}</b> {t(rol.descripcion)}</li>)}
          </ul>
          <p className="snap-roles-clave">{t("Tamaño: qué parte de su juego es ese papel · color y cifra: su percentil frente a los de su puesto.")}</p>
          <p className="snap-roles-nota">{t("Cada vez que toca el balón en una jugada de su equipo cuenta un solo papel, el primero que cumple: remate, inicio, pase largo, progresión, conducción, apoyo, enlace, control. Tamaño: qué parte de su juego es ese papel. Color y cifra: su percentil en ese papel frente a los de su puesto.")}</p>
        </>}
      </Tarjeta>;
    }

    case "encaje":
      // En Visuales, sin el detalle dimensión a dimensión: el resumen cabe en
      // un bloque; el detalle es la hoja entera de la ficha ampliada.
      return <figure className="snap-tarjeta snap-encaje snap-con-chip"><EncajeEquipo datos={datos} equipo={opcion} onEquipo={onOpcion} detalle /></figure>;

    case "enjambres":
      return <Tarjeta titulo={tf("Frente a su grupo: {grupo}", { grupo: nombreGrupo.toLowerCase() })} subtitulo={t("Cada punto es un jugador; relleno, él; con aro, sus cinco más parecidos")} clase="snap-enjambres">
        {(["progresion", "defensa_propia", "amenaza"] as const).map((id) => (
          <div key={id} className="snap-enjambre-fila">
            <small>{t(COMPUESTAS.find((c) => c.id === id)!.etiqueta)}</small>
            <Enjambre id={id} grupo={grupo} objetivo={indice} destacados={destacados} nombres={nombres} />
          </div>
        ))}
      </Tarjeta>;

    case "dispersion":
      return <Tarjeta titulo={t("Construcción frente a asociación")} subtitulo={t("Desviaciones típicas frente a su grupo")} clase="snap-dispersion-tarjeta">
        <Dispersion grupo={grupo} objetivo={indice} destacados={destacados} nombres={nombres} ejeX="construccion" ejeY="asociacion" />
      </Tarjeta>;
  }
}
