/**
 * SkillCorner en El partido: lo que el tracking ve y StatsBomb no.
 *
 * Dos capas, las dos de la temporada entera:
 *  - game intelligence por equipo (desmarques, pases que rompen líneas,
 *    presión sin balón y qué pasa con ella), que SkillCorner solo publica en
 *    CPL y MLS Next Pro 2026. Viene como promedio por jugador y partido, así
 *    que se normaliza por cada 30 minutos con balón (tip) o sin él (otip),
 *    como lo hace SkillCorner;
 *  - el físico de sus jugadores (velocidad punta PSV-99, metros a más de
 *    20 km/h, sprints a más de 25 km/h), que publica en todas sus ligas.
 *
 * Los dos se suman a las medias de la liga de lib/fases.ts, así que salen en
 * la tabla de fases con su puesto y su tercio, y los consejos de la pizarra
 * los usan como prueba. Un equipo sin SkillCorner no tiene esas filas: la
 * ausencia es un hueco, no un cero.
 *
 * Validado con los duelos reales de 2026 (validar-velocidad.mjs): la
 * velocidad punta no predice quién gana un regate ni un aéreo (el más rápido
 * gana el 58 % de los regates, igual que el más lento). Por eso el físico
 * informa de la carrera —quién llega antes a la espalda—, no del duelo.
 */

import { mismoEquipo } from "./estiloEquipo.ts";

type Fila = Record<string, unknown>;

const num = (v: unknown) => (v === "" || v === null || v === undefined ? Number.NaN : Number(v));
const cociente = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : Number.NaN);
const porTreinta = (f: Fila, campo: string, fase: "tip" | "otip") => cociente(num(f[campo]), num(f[`minutes_${fase}`])) * 30;

/** Cada métrica de game intelligence, de la fila de SkillCorner del equipo. */
const GAME_INTELLIGENCE: Record<string, (f: Fila) => number> = {
  sc_rupturas: (f) => porTreinta(f, "behindrun_count", "tip"),
  sc_rupturas_peligrosas: (f) => porTreinta(f, "behindrun_count_dangerous", "tip"),
  sc_sirve_rupturas: (f) => cociente(num(f.behindrun_count_targeted), num(f.behindrun_count)),
  sc_rompe_lineas: (f) => porTreinta(f, "pass_count_linebreak_completed", "tip"),
  sc_retencion: (f) => num(f.possession_pct_drawnpressure_retained) / 100,
  sc_presiones: (f) => porTreinta(f, "onballengagement_count", "otip"),
  sc_cadenas: (f) => cociente(num(f.onballengagement_count_pressingchain), num(f.onballengagement_count)),
  sc_hacia_atras: (f) => num(f.onballengagement_pct_forcedbackward) / 100,
  sc_superado_movimiento: (f) => num(f.onballengagement_pct_beatenbymovement) / 100,
  sc_peligro_cortado: (f) => num(f.onballengagement_pct_dangermitigated) / 100,
};

const CENTRALES = new Set(["CB", "LCB", "RCB"]);
const ATACANTES = new Set(["CF", "LF", "RF", "LW", "RW", "AM", "LM", "RM"]);
const MINUTOS_FISICO = 300;

/** Media ponderada por minutos de una columna, en los jugadores que cumple `quien`. */
function mediaPonderada(jugadores: Fila[], columna: string, quien: (posicion: string) => boolean) {
  let suma = 0, peso = 0;
  for (const j of jugadores) {
    const minutos = num(j["Minutes played"]);
    const valor = num(j[columna]);
    if (!(minutos >= MINUTOS_FISICO) || !Number.isFinite(valor) || !quien(String(j.Position ?? ""))) continue;
    suma += valor * minutos;
    peso += minutos;
  }
  return peso > 0 ? suma / peso : Number.NaN;
}

const FISICO: Record<string, (jugadores: Fila[]) => number> = {
  fis_vel_ataque: (j) => mediaPonderada(j, "PSV-99 (SC)", (p) => ATACANTES.has(p)),
  fis_vel_centrales: (j) => mediaPonderada(j, "PSV-99 (SC)", (p) => CENTRALES.has(p)),
  fis_hsr: (j) => mediaPonderada(j, "HSR distance (SC)", (p) => p !== "" && p !== "GK"),
  fis_sprints: (j) => mediaPonderada(j, "Sprints (SC)", (p) => p !== "" && p !== "GK"),
};

export type EquipoDeLaLiga = { id: number; nombre: string };

/**
 * Los valores de SkillCorner de cada equipo de la liga, por su id de
 * StatsBomb, casando los nombres (SkillCorner escribe "Inter Toronto Football
 * Club" donde StatsBomb pone "Inter Toronto").
 */
export function valoresSkillcorner(equipos: EquipoDeLaLiga[], filasEquipo: Fila[], jugadores: Fila[]): Map<number, Record<string, number>> {
  const salida = new Map<number, Record<string, number>>();
  for (const equipo of equipos) {
    const valores: Record<string, number> = {};
    const fila = filasEquipo.find((f) => mismoEquipo(String(f.team_name ?? ""), equipo.nombre));
    if (fila) for (const [id, calcular] of Object.entries(GAME_INTELLIGENCE)) {
      const v = calcular(fila);
      if (Number.isFinite(v)) valores[id] = v;
    }
    const suyos = jugadores.filter((j) => mismoEquipo(String(j.Team ?? ""), equipo.nombre));
    if (suyos.length) for (const [id, calcular] of Object.entries(FISICO)) {
      const v = calcular(suyos);
      if (Number.isFinite(v)) valores[id] = v;
    }
    if (Object.keys(valores).length) salida.set(equipo.id, valores);
  }
  return salida;
}

/** Las medias de la liga (lib/fases.ts) con las de SkillCorner añadidas. */
export function conSkillcorner(medias: Map<number, Record<string, number>>, sc: Map<number, Record<string, number>>) {
  if (!sc.size) return medias;
  const salida = new Map(medias);
  for (const [equipo, valores] of sc) salida.set(equipo, { ...(salida.get(equipo) ?? {}), ...valores });
  return salida;
}

// ---- El físico de cada jugador, para la pizarra y los duelos ------------------------------

export type FisicoDeJugador = {
  /** Velocidad punta (percentil 99 de sus velocidades), km/h. */
  psv99: number;
  /** Metros a más de 20 km/h, por 90′. */
  hsr: number;
  sprints: number;
  aceleraciones: number;
  /** Desmarques de ruptura por 30′ con balón, si su liga trae game intelligence. */
  rupturas: number;
  rupturasPeligrosas: number;
};

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Un buscador del físico por nombre. SkillCorner acorta los nombres ("Phillip
 * Goodrum" por "Phillip Joseph Goodrum"): primero el nombre completo; si no,
 * apellido e inicial, solo si es único en la liga.
 */
export function buscadorDeFisico(jugadores: Fila[]) {
  const porNombre = new Map<string, FisicoDeJugador>();
  const porApellido = new Map<string, FisicoDeJugador | null>();
  for (const j of jugadores) {
    const psv99 = num(j["PSV-99 (SC)"]);
    if (!Number.isFinite(psv99)) continue;
    const fisico: FisicoDeJugador = {
      psv99, hsr: num(j["HSR distance (SC)"]), sprints: num(j["Sprints (SC)"]), aceleraciones: num(j["Explosive accels to sprint (SC)"]),
      rupturas: num(j["Runs in behind P30 (SC)"]), rupturasPeligrosas: num(j["Dangerous runs behind P30 (SC)"]),
    };
    const nombre = normal(String(j.Player ?? ""));
    if (!nombre) continue;
    porNombre.set(nombre, fisico);
    const partes = nombre.split(" ");
    const clave = `${partes.at(-1)}|${partes[0][0]}`;
    porApellido.set(clave, porApellido.has(clave) ? null : fisico);
  }
  return (nombre: string): FisicoDeJugador | null => {
    const n = normal(nombre);
    if (!n) return null;
    const exacto = porNombre.get(n);
    if (exacto) return exacto;
    const partes = n.split(" ");
    return porApellido.get(`${partes.at(-1)}|${partes[0][0]}`) ?? null;
  };
}
