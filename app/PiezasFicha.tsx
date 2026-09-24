"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Desplegable } from "./BarraDeFiltros";
import { numberLocale, t, tf } from "@/lib/i18n";
import { fetchEventosJugador } from "@/lib/remoteData";
import { useRoles } from "./useRolesDeLiga";
import { EncajeEquipo } from "./EncajeEquipo";
import { buildSimilaritySearch, type SimilarityFilters, type SimilarityPlayer } from "@/lib/similarity";
import { PERFILES } from "@/lib/perfiles";
import { primaryPositionRole } from "@/lib/positions";
import type { DataRow, PlayerReport } from "@/lib/scouting";
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
  densidad,
  enjambre,
  esJuegoAbierto,
  esPaseEnJuego,
  familiasCompuestas,
  fuenteStatsbomb,
  grupoDeRecepcion,
  MIN_INTERVENCIONES,
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
 * La ficha ampliada las monta todas en una hoja; Visuales las usa sueltas,
 * como bloques que se colocan, se estiran y se imprimen junto a los demás.
 * Las dos leen lo mismo: el grupo de familias, los parecidos y los eventos de
 * StatsBomb se calculan o se piden una vez por jugador y se reparten, así que
 * diez bloques en Visuales no son diez descargas.
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
};

export type IdPieza =
  | "ficha" | "tabla" | "radar" | "top10" | "puestos" | "parecidos"
  | "tiros" | "ocasiones" | "regates" | "pases_inicio" | "pases_fin"
  | "calor" | "defensa" | "enjambres" | "dispersion"
  | "recepciones" | "recepciones_tipo" | "recepciones_origen" | "recepciones_pasadores"
  | "roles" | "encaje";

/**
 * El catálogo que ofrece Visuales. `ancho` y `alto` son el tamaño con el que
 * nace el bloque —en doceavos y píxeles—, pensado para que la pieza se lea sin
 * tocar nada; `eventos` dice si necesita los partidos de StatsBomb.
 */
export const PIEZAS_FICHA: Array<{ id: IdPieza; titulo: string; ancho: number; alto: number; eventos: boolean; roles?: boolean }> = [
  { id: "ficha", titulo: "Ficha del jugador", ancho: 6, alto: 280, eventos: false },
  { id: "tabla", titulo: "Familias en tabla", ancho: 6, alto: 460, eventos: false },
  { id: "radar", titulo: "Radar de familias", ancho: 6, alto: 440, eventos: false },
  { id: "top10", titulo: "Top 10 de una familia", ancho: 6, alto: 580, eventos: false },
  { id: "parecidos", titulo: "Los más parecidos", ancho: 6, alto: 580, eventos: false },
  { id: "puestos", titulo: "Tiempo en cada puesto", ancho: 4, alto: 500, eventos: true },
  { id: "tiros", titulo: "Tiros", ancho: 6, alto: 380, eventos: true },
  { id: "ocasiones", titulo: "Ocasiones creadas", ancho: 6, alto: 380, eventos: true },
  { id: "regates", titulo: "Regates", ancho: 4, alto: 500, eventos: true },
  { id: "pases_inicio", titulo: "Dónde empieza sus pases", ancho: 4, alto: 500, eventos: true },
  { id: "pases_fin", titulo: "Dónde terminan sus pases", ancho: 4, alto: 500, eventos: true },
  { id: "calor", titulo: "Mapa de calor", ancho: 4, alto: 500, eventos: true },
  { id: "defensa", titulo: "Acciones defensivas", ancho: 4, alto: 500, eventos: true },
  { id: "recepciones", titulo: "Dónde recibe", ancho: 4, alto: 560, eventos: true },
  { id: "recepciones_tipo", titulo: "Cómo recibe", ancho: 4, alto: 500, eventos: true },
  { id: "recepciones_origen", titulo: "De dónde le llega", ancho: 4, alto: 500, eventos: true },
  { id: "recepciones_pasadores", titulo: "Quién se la da", ancho: 4, alto: 420, eventos: true },
  { id: "roles", titulo: "Rol en la secuencia", ancho: 12, alto: 420, eventos: false, roles: true },
  { id: "encaje", titulo: "Encaje con un equipo", ancho: 12, alto: 560, eventos: false, roles: true },
  { id: "enjambres", titulo: "Frente a su grupo", ancho: 12, alto: 380, eventos: false },
  { id: "dispersion", titulo: "Construcción frente a asociación", ancho: 6, alto: 400, eventos: false },
];

export const esPieza = (id: unknown): id is IdPieza => PIEZAS_FICHA.some((pieza) => pieza.id === id);

/**
 * El ajuste propio de una pieza, si lo tiene: la familia del Top 10 o cómo se
 * agrupan las recepciones. Visuales lo ofrece en el inspector del bloque.
 */
export function opcionesDePieza(id: IdPieza): { etiqueta: string; inicial: string; opciones: Array<{ valor: string; etiqueta: string }> } | null {
  if (id === "top10") return { etiqueta: "Familia", inicial: "progresion", opciones: COMPUESTAS.map((c) => ({ valor: c.id, etiqueta: c.etiqueta })) };
  if (id === "recepciones" || id === "recepciones_tipo") {
    return { etiqueta: "Agrupar por", inicial: "tipo", opciones: AGRUPACIONES_RECEPCION.map((a) => ({ valor: a.id, etiqueta: a.etiqueta })) };
  }
  return null;
}

const tramo = (percentil: number) => (percentil >= 80 ? "p5" : percentil >= 60 ? "p4" : percentil >= 40 ? "p3" : percentil >= 20 ? "p2" : "p1");
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
  const regates = lista.filter((e) => e.t === "Dribble" && e.l);
  const defensivas = lista.filter((e) => ((e.t === "Duel" && e.dt === "Tackle") || ["Ball Recovery", "Interception", "Clearance", "Block"].includes(e.t)) && e.l);
  return {
    tiros,
    goles: tiros.filter((e) => e.o === "Goal").length,
    xgTotal: tiros.reduce((s, e) => s + (e.xg ?? 0), 0),
    ocasiones,
    asistencias: ocasiones.filter((e) => e.ga).length,
    regates,
    regatesBien: regates.filter((e) => e.o === "Complete").length,
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
  const { rows, indice, informe, minutosMin } = contexto;
  const fila = rows[indice];
  const jugador = String(fila?.Player ?? informe.player);
  const equipo = String(fila?.Team ?? informe.team);
  const fuente = fuenteStatsbomb(fila?.["Data sources"]);
  const clave = fuente ? `${fuente.liga}|${fuente.temporada}|${equipo}|${jugador}` : "";
  const { eventos, estado } = useEventos(clave, conEventos, equipo);
  const { roles: rolesLiga, estado: estadoRoles } = useRoles(fuente?.liga ?? "", fuente?.temporada ?? "", conRoles);

  const grupo = useMemo(
    () => deCache(grupos, rows, `${informe.cohort}|${minutosMin}|${indice}`, () => familiasCompuestas(rows, informe.cohort, minutosMin, indice)),
    [rows, informe.cohort, minutosMin, indice],
  );
  const parecidos = useMemo(() => deCache(similares, rows, `${indice}|${minutosMin}`, () => {
    const filtros: SimilarityFilters = { query: "", position: "", secondaryRole: "", side: "", passport: "", minimumMinutes: minutosMin, ageMin: null, ageMax: null };
    try {
      return buildSimilaritySearch(rows, indice, filtros)?.candidates.slice(0, 15) ?? [];
    } catch {
      return [];
    }
  }), [rows, indice, minutosMin]);
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

/** Campo vertical con el ataque hacia arriba, en unidades de StatsBomb (80 × 120). */
function Cancha({ mitad = false, fondo, children, etiqueta }: { mitad?: boolean; fondo?: ReactNode; children?: ReactNode; etiqueta: string }) {
  const alto = mitad ? 64 : 120;
  return <svg className={mitad ? "snap-cancha mitad" : "snap-cancha"} viewBox={`-2 -3 84 ${alto + 5}`} role="img" aria-label={etiqueta}>
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

/**
 * Dibuja una pieza. `suelta` es para Visuales: allí cada bloque va por su
 * cuenta y, si faltan los eventos, avisa dentro del propio bloque en vez de en
 * la cabecera de la hoja. `opcion` es la familia del Top 10.
 */
export function PiezaFicha({ pieza, datos, opcion, onOpcion, suelta = false }: {
  pieza: IdPieza;
  datos: DatosFicha;
  opcion?: string;
  onOpcion?: (valor: string) => void;
  suelta?: boolean;
}) {
  const { contexto, jugador, equipo, fuente, eventos, grupo, propias, nombreGrupo, parecidos, destacados, nombres, sinEventos } = datos;
  const { rows, indice, informe, perfilTm, onAbrirJugador } = contexto;
  const aviso = suelta && sinEventos ? datos.estado || undefined : undefined;
  const conGrupo = tf("frente a {n} {grupo}", { n: grupo.indices.length, grupo: nombreGrupo.toLowerCase() });

  switch (pieza) {
    case "ficha":
      return <div className="snap-ficha">
        {perfilTm?.playerImage
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="snap-foto" src={perfilTm.playerImage} alt="" />
          : <span className="snap-foto vacia">{jugador.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}</span>}
        <div className="snap-ficha-texto">
          <b>{jugador}</b>
          <small>
            {perfilTm?.clubLogo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={perfilTm.clubLogo} alt="" />}
            {perfilTm?.club || equipo}
          </small>
        </div>
        <dl>
          <div><dt>{t("Posición")}</dt><dd>{informe.position || "—"}</dd></div>
          <div><dt>{t("Edad")}</dt><dd>{informe.age || "—"}</dd></div>
          <div><dt>{t("Minutos")}</dt><dd>{num(informe.minutes)}</dd></div>
          <div><dt>{t("País")}</dt><dd>{informe.passport || "—"}</dd></div>
          <div><dt>{t("Dorsal")}</dt><dd>{eventos?.dorsal || perfilTm?.number || "—"}</dd></div>
          <div><dt>{t("Liga")}</dt><dd>{fuente?.liga ?? "—"}</dd></div>
        </dl>
      </div>;

    case "tabla":
      return <ol className="snap-tabla" aria-label={tf("Familias frente a {n} {grupo}", { n: grupo.indices.length, grupo: nombreGrupo.toLowerCase() })}>
        <li className="snap-tabla-titulo">{conGrupo}</li>
        {COMPUESTAS.filter((c) => propias[c.id]).sort((a, b) => propias[b.id].z - propias[a.id].z).map((c) => (
          <li key={c.id}>
            <span>{t(c.etiqueta)}{c.fuente === "skillcorner" && <em className="snap-fuente-sc" title="SkillCorner">SC</em>}</span>
            <em className={propias[c.id].z >= 0 ? "sube" : "baja"}>{conSigno(propias[c.id].z)}</em>
            <i className={`estilo-pct ${tramo(propias[c.id].percentil)}`}>{propias[c.id].percentil}</i>
          </li>
        ))}
      </ol>;

    case "radar":
      return <Tarjeta titulo={t("Familias")} subtitulo={suelta ? `${t("Largo: percentil · cifra: desviaciones típicas")} · ${conGrupo}` : t("Largo: percentil · cifra: desviaciones típicas")} clase="snap-radar-tarjeta">
        <RadarFamilias valores={propias} />
      </Tarjeta>;

    case "top10": {
      const familia = COMPUESTAS.find((c) => c.id === opcion) ?? COMPUESTAS.find((c) => c.id === "progresion") ?? COMPUESTAS[0];
      const top = grupo.indices
        .map((i) => ({ i, z: grupo.valores.get(i)?.[familia.id]?.z ?? Number.NaN }))
        .filter((p) => Number.isFinite(p.z))
        .sort((a, b) => b.z - a.z)
        .slice(0, 10);
      return <Tarjeta titulo={t("Top 10")} subtitulo={suelta ? `${t(familia.etiqueta)} · ${conGrupo}` : undefined} clase="snap-top">
        <Desplegable etiqueta={t("Familia")} valor={t(familia.etiqueta)} activo={false}>
          <select aria-label={t("Familia")} value={familia.id} onChange={(evento) => onOpcion?.(evento.target.value)} onClick={(evento) => evento.stopPropagation()}>
            {COMPUESTAS.map((c) => <option key={c.id} value={c.id}>{c.fuente === "skillcorner" ? `${t(c.etiqueta)} · SkillCorner` : t(c.etiqueta)}</option>)}
          </select>
        </Desplegable>
        <ol>
          {top.map(({ i, z }, posicion) => (
            <li key={i} className={i === indice ? "activo" : undefined} onClick={() => onAbrirJugador?.(i)}>
              <span>{posicion + 1}</span>
              <b>{nombres(i)}<small>{String(rows[i]?.Team ?? "")}</small></b>
              <em>{conSigno(z)}</em>
            </li>
          ))}
        </ol>
      </Tarjeta>;
    }

    case "puestos": {
      const { minutosPos, totalPos } = datos;
      return <Tarjeta titulo={t("Tiempo en cada puesto")} subtitulo={eventos ? tf("{m} minutos en {n} puestos", { m: num(totalPos), n: minutosPos.length }) : undefined} aviso={aviso} clase="snap-puestos">
        <Cancha etiqueta={t("Tiempo en cada puesto")}>
          {minutosPos.map(([codigo, minutos]) => {
            const lugar = POSICION_EN_CAMPO[codigo];
            if (!lugar) return null;
            const parte = totalPos ? minutos / totalPos : 0;
            return <g key={codigo}>
              <circle cx={lugar[0]} cy={lugar[1]} r={3.2 + parte * 9} className="snap-puesto" />
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
      // Suelto, en un bloque de media hoja, van diez: quince pedían un bloque
      // más alto que el resto de la fila.
      const lista = suelta ? parecidos.slice(0, 10) : parecidos;
      return <Tarjeta titulo={tf("Los que más se parecen a {nombre}", { nombre: apellido(jugador) })} subtitulo={tf("{n} más cercanos de la base, de cualquier puesto", { n: lista.length })} clase="snap-parecidos">
        <ol>
          {lista.map((p, posicion) => (
            <li key={p.index} onClick={() => onAbrirJugador?.(p.index)}>
              <span>{posicion + 1}</span>
              <b>{p.name}</b>
              <small>{p.team}</small>
              <em>{`${num(p.similarity, 1)}%`}</em>
            </li>
          ))}
        </ol>
      </Tarjeta>;
    }

    case "tiros":
      return <Tarjeta titulo={t("Tiros")} subtitulo={sinEventos ? undefined : tf("{n} tiros · {g} goles · {x} xG", { n: datos.tiros.length, g: datos.goles, x: num(datos.xgTotal, 2) })} aviso={aviso}
        leyenda={<><i className="snap-l gol" />{t("Gol")}<i className="snap-l tiro" />{t("Sin gol")}<span>{t("tamaño = xG")}</span></>}>
        <Cancha mitad etiqueta={t("Tiros")}>
          {datos.tiros.map((e, i) => { const [X, Y] = aVertical(e.l!); return <circle key={i} cx={X} cy={Y} r={0.9 + Math.sqrt(Math.max(e.xg ?? 0.01, 0.01)) * 5} className={e.o === "Goal" ? "snap-tiro gol" : "snap-tiro"} />; })}
        </Cancha>
      </Tarjeta>;

    case "ocasiones": {
      const claseOcasion = (e: EventoSB) => (e.ga ? "asistencia" : e.pt === "Corner" || e.pt === "Free Kick" ? "parado" : e.cr ? "centro" : "juego");
      return <Tarjeta titulo={t("Ocasiones creadas")} subtitulo={sinEventos ? undefined : tf("{n} pases a tiro · {a} asistencias", { n: datos.ocasiones.length, a: datos.asistencias })} aviso={aviso}
        leyenda={<><i className="snap-l juego" />{t("Juego")}<i className="snap-l centro" />{t("Centro")}<i className="snap-l parado" />{t("Balón parado")}<i className="snap-l asistencia" />{t("Asistencia")}</>}>
        <Cancha mitad etiqueta={t("Ocasiones creadas")}>
          {datos.ocasiones.map((e, i) => {
            const [x0, y0] = aVertical(e.l!), [x1, y1] = aVertical(e.e!);
            return <g key={i} className={`snap-ocasion ${claseOcasion(e)}`}><line x1={x0} y1={y0} x2={x1} y2={y1} /><circle cx={x1} cy={y1} r={0.9} /></g>;
          })}
        </Cancha>
      </Tarjeta>;
    }

    case "regates": {
      const { regates, regatesBien } = datos;
      return <Tarjeta titulo={t("Regates")} subtitulo={sinEventos ? undefined : tf("{b} de {n} completados · {p}%", { b: regatesBien, n: regates.length, p: regates.length ? Math.round((regatesBien / regates.length) * 100) : 0 })} aviso={aviso}
        leyenda={<><i className="snap-l gol" />{t("Completado")}<i className="snap-l fallo" />{t("Fallido")}</>}>
        <Cancha etiqueta={t("Regates")}>
          {regates.map((e, i) => { const [X, Y] = aVertical(e.l!); return <circle key={i} cx={X} cy={Y} r={1.4} className={e.o === "Complete" ? "snap-regate bien" : "snap-regate mal"} />; })}
        </Cancha>
      </Tarjeta>;
    }

    case "pases_inicio":
      return <Tarjeta titulo={t("Dónde empieza sus pases")} subtitulo={sinEventos ? undefined : tf("{n} pases en juego abierto", { n: num(datos.pasesJuego.length) })} aviso={aviso}>
        <RejillaCampo puntos={datos.pasesJuego.map((e) => [e.l![0], e.l![1]] as Punto)} modo="pct" etiqueta={t("Dónde empieza sus pases")} />
      </Tarjeta>;

    case "pases_fin":
      return <Tarjeta titulo={t("Dónde terminan sus pases")} subtitulo={sinEventos ? undefined : tf("{n} destinos", { n: num(datos.pasesJuego.filter((e) => e.e).length) })} aviso={aviso}>
        <RejillaCampo puntos={datos.pasesJuego.filter((e) => e.e).map((e) => [e.e![0], e.e![1]] as Punto)} modo="pct" etiqueta={t("Dónde terminan sus pases")} />
      </Tarjeta>;

    case "calor": {
      const { celdas, columnas, filas } = densidad(datos.acciones.map((e) => [e.l![0], e.l![1]] as Punto));
      const w = 80 / columnas, h = 120 / filas;
      return <Tarjeta titulo={t("Mapa de calor")} subtitulo={sinEventos ? undefined : tf("{n} acciones en juego abierto", { n: num(datos.acciones.length) })} aviso={aviso}>
        <Cancha etiqueta={t("Mapa de calor")} fondo={celdas.map((fila, f) => fila.map((v, c) => v > 0.02
          ? <rect key={`${f}-${c}`} x={c * w} y={f * h} width={w + 0.1} height={h + 0.1} className="snap-calor" style={{ fillOpacity: v * 0.9 }} />
          : null))} />
      </Tarjeta>;
    }

    case "defensa": {
      const { defensivas, cuenta } = datos;
      return <Tarjeta titulo={t("Acciones defensivas")} subtitulo={sinEventos ? undefined : tf("{n} en total · {e} entradas · {r} recuperaciones · {i} intercepciones · {d} despejes", {
        n: defensivas.length, e: cuenta("Duel", "Tackle"), r: cuenta("Ball Recovery"), i: cuenta("Interception"), d: cuenta("Clearance"),
      })} aviso={aviso}>
        <RejillaCampo puntos={defensivas.map((e) => [e.l![0], e.l![1]] as Punto)} modo="n" etiqueta={t("Acciones defensivas")} />
      </Tarjeta>;
    }

    case "recepciones": {
      const agrupacion = agrupacionRecepcion(opcion);
      const r = resumenRecepciones(eventos?.eventos ?? [], agrupacion.id);
      const color = new Map(agrupacion.grupos.map((g) => [g.id, g.color]));
      const porNoventa = datos.totalPos ? (r.total / datos.totalPos) * 90 : 0;
      // Primero lo más frecuente: los grupos raros van encima y no quedan
      // enterrados bajo cien recepciones al pie.
      const frecuencia = new Map(r.grupos.map((g) => [g.id, g.n]));
      const orden = r.lista
        .map((e) => ({ e, grupo: grupoDeRecepcion(e, agrupacion.id) }))
        .sort((a, b) => (frecuencia.get(b.grupo ?? "") ?? 0) - (frecuencia.get(a.grupo ?? "") ?? 0));
      return <Tarjeta titulo={t("Dónde recibe")} subtitulo={sinEventos ? undefined : tf("{n} recepciones · {p} por 90", { n: num(r.total), p: num(porNoventa, 1) })} aviso={aviso} clase="snap-con-chip snap-recepciones"
        leyenda={<>
          {r.grupos.filter((g) => g.n).map((g) => <span key={g.id} className="snap-l-grupo"><i style={{ background: g.color }} />{t(g.etiqueta)} <b>{num(g.n)}</b></span>)}
          {r.fallidas > 0 && <span className="snap-l-grupo"><i className="hueco" />{t("No controlada")}</span>}
        </>}>
        <Desplegable etiqueta={t("Agrupar por")} valor={t(agrupacion.etiqueta)} activo={false}>
          <select aria-label={t("Agrupar por")} value={agrupacion.id} onChange={(evento) => onOpcion?.(evento.target.value)} onClick={(evento) => evento.stopPropagation()}>
            {AGRUPACIONES_RECEPCION.map((a) => <option key={a.id} value={a.id}>{t(a.etiqueta)}</option>)}
          </select>
        </Desplegable>
        <Cancha etiqueta={t("Dónde recibe")}>
          {orden.map(({ e, grupo }, i) => {
            const [X, Y] = aVertical(e.l!);
            const tinta = (grupo && color.get(grupo)) || "#9aa0a6";
            return e.o === "Incomplete"
              ? <circle key={i} cx={X} cy={Y} r={0.85} className="snap-recepcion fallida" style={{ stroke: tinta }} />
              : <circle key={i} cx={X} cy={Y} r={0.95} className="snap-recepcion" style={{ fill: tinta }} />;
          })}
        </Cancha>
      </Tarjeta>;
    }

    case "recepciones_tipo": {
      const agrupacion = agrupacionRecepcion(opcion);
      const r = resumenRecepciones(eventos?.eventos ?? [], agrupacion.id);
      const agrupadas = r.grupos.reduce((s, g) => s + g.n, 0);
      const maximo = Math.max(1, ...r.grupos.map((g) => g.n));
      return <Tarjeta titulo={t("Cómo recibe")} subtitulo={sinEventos ? undefined : `${t(agrupacion.etiqueta)} · ${tf("{n} recepciones", { n: num(r.total) })}`} aviso={aviso} clase="snap-como-recibe">
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
      return <Tarjeta titulo={t("De dónde le llega")} subtitulo={sinEventos ? undefined : tf("Origen de {n} pases que recibe", { n: num(r.origenes.length) })} aviso={aviso}>
        <RejillaCampo puntos={r.origenes} modo="pct" etiqueta={t("De dónde le llega")} />
      </Tarjeta>;
    }

    case "recepciones_pasadores": {
      const r = resumenRecepciones(eventos?.eventos ?? [], "tipo");
      const lista = r.pasadores.slice(0, 8);
      return <Tarjeta titulo={t("Quién se la da")} subtitulo={sinEventos ? undefined : tf("{n} compañeros distintos", { n: r.pasadores.length })} aviso={aviso} clase="snap-parecidos snap-pasadores">
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
      return <Tarjeta titulo={tf("Rol en la secuencia frente a su grupo{perfil}", { perfil: r?.perfil ? ` · ${r.perfil}` : "" })}
        subtitulo={r ? tf("Percentil frente a {n} {grupo} de {liga} · secuencias en juego abierto, mínimo {min} intervenciones · {i} suyas", {
          n: r.grupo, grupo: nombreGrupo.toLowerCase(), liga: fuente?.liga ?? "", min: MIN_INTERVENCIONES, i: num(r.intervenciones),
        }) : undefined} aviso={aviso} clase="snap-roles">
        {r && <ol className="snap-roles-lista">
          {r.filas.map((f) => (
            <li key={f.id} title={t(ROLES_SECUENCIA.find((rol) => rol.id === f.id)?.descripcion ?? "")}>
              <span>{t(f.etiqueta)}</span>
              <i><b style={{ width: `${Math.max(2, f.percentil)}%`, opacity: 0.35 + (f.percentil / 100) * 0.65 }} /><em>{f.percentil}</em></i>
              <small>{`${Math.round(f.parte * 100)}%`}</small>
            </li>
          ))}
        </ol>}
        {r && <p className="snap-roles-nota">{t("Barra: percentil frente a su grupo en la parte de sus intervenciones que es cada rol. Derecha: esa parte. Cada intervención cuenta en un solo rol, el primero que cumple: remate, iniciador, vertical, progresor, conductor, apoyo, enlace, control.")}</p>}
      </Tarjeta>;
    }

    case "encaje":
      // En Visuales, sin el detalle dimensión a dimensión: el resumen cabe en
      // un bloque; el detalle es la hoja entera de la ficha ampliada.
      return <figure className="snap-tarjeta snap-encaje snap-con-chip"><EncajeEquipo datos={datos} equipo={opcion} onEquipo={onOpcion} detalle={!suelta} /></figure>;

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

/** Una pieza por su cuenta, para un bloque de Visuales. */
export function PiezaSuelta({ pieza, contexto, opcion, onOpcion }: {
  pieza: IdPieza;
  contexto: ContextoFicha;
  opcion?: string;
  onOpcion?: (valor: string) => void;
}) {
  const ficha = PIEZAS_FICHA.find((p) => p.id === pieza);
  const datos = useDatosFicha(contexto, ficha?.eventos ?? false, ficha?.roles ?? false);
  return <PiezaFicha pieza={pieza} datos={datos} opcion={opcion} onOpcion={onOpcion} suelta />;
}
