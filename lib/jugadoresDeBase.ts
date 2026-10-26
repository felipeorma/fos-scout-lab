/**
 * Jugadores de la base en la pizarra: los de un equipo de los datos cargados,
 * puestos en las fichas por su puesto, y una tarjeta con tres números suyos.
 *
 * Los puestos de Wyscout ("LCB, CB", "RCMF, DMF") son los mismos códigos con
 * los que la pizarra dibuja los sistemas (lib/pizarra.ts), y las fichas llevan
 * su rótulo corto (DFC, MC, EI…), así que se emparejan sin adivinar: primero
 * quien juega exactamente ese puesto, después quien lo tiene entre los suyos,
 * después alguien de la misma línea; siempre el que más minutos ha jugado.
 */

import type { Ficha } from "./abp.ts";
import { findColumn, percentile, type DataRow } from "./scouting.ts";

export type Linea = "portero" | "defensa" | "medio" | "ataque";

export type JugadorDeBase = {
  /** El nombre tal como viene en la base ("L. Messi"). */
  nombre: string;
  equipo: string;
  /** Sus puestos, el principal primero. */
  puestos: string[];
  minutos: number;
  edad: number | null;
  /** Su fila en la base, para leer sus métricas. */
  fila: number;
};

const LINEA_DE_PUESTO: Record<string, Linea> = {
  GK: "portero",
  LB: "defensa", RB: "defensa", LCB: "defensa", CB: "defensa", RCB: "defensa", LWB: "defensa", RWB: "defensa", LB5: "defensa", RB5: "defensa", LCB3: "defensa", RCB3: "defensa",
  LDMF: "medio", DMF: "medio", RDMF: "medio", LCMF: "medio", CMF: "medio", RCMF: "medio", LM: "medio", RM: "medio", LAMF: "medio", AMF: "medio", RAMF: "medio", LCMF3: "medio", RCMF3: "medio",
  LW: "ataque", RW: "ataque", LWF: "ataque", RWF: "ataque", SS: "ataque", LCF: "ataque", CF: "ataque", RCF: "ataque",
};

/** Los puestos de Wyscout que encajan con el rótulo de una ficha, del más al menos exacto. */
const CODIGOS_DE_ROL: Record<string, string[]> = {
  POR: ["GK"], PORTERO: ["GK"],
  LI: ["LB", "LWB", "LB5"], LD: ["RB", "RWB", "RB5"], CAI: ["LWB", "LB", "LB5"], CAD: ["RWB", "RB", "RB5"],
  DFC: ["LCB", "CB", "RCB", "LCB3", "RCB3"], CENTRAL: ["CB", "LCB", "RCB"],
  MCD: ["DMF", "LDMF", "RDMF"], PIVOTE: ["DMF", "LDMF", "RDMF"],
  MC: ["LCMF", "CMF", "RCMF", "LCMF3", "RCMF3"], INTERIOR: ["LCMF", "RCMF", "CMF"],
  MI: ["LM", "LW", "LAMF"], MD: ["RM", "RW", "RAMF"], MP: ["AMF", "LAMF", "RAMF"],
  EI: ["LW", "LWF", "LM", "LAMF"], ED: ["RW", "RWF", "RM", "RAMF"], EXTREMO: ["LW", "RW", "LWF", "RWF"],
  SD: ["SS", "AMF", "CF"], DC: ["CF", "LCF", "RCF", "SS"], PUNTA: ["CF", "LCF", "RCF"],
};

const sinTildes = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Los puestos que encajan con una ficha, por su rol; vacío si el rol no es un puesto (un «Lanzador»). */
export function puestosDeFicha(ficha: Ficha): string[] {
  const rol = sinTildes(ficha.rol).trim().toUpperCase();
  return CODIGOS_DE_ROL[rol] ?? (LINEA_DE_PUESTO[rol] ? [rol] : []);
}

export const lineaDe = (puestos: string[]): Linea | null => {
  for (const p of puestos) if (LINEA_DE_PUESTO[p]) return LINEA_DE_PUESTO[p];
  return null;
};

const numero = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const encabezados = (rows: DataRow[]) => [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))];

const PLAYER = ["player", "jugador", "player name", "nombre jugador"];
const TEAM = ["team within selected timeframe", "equipo durante el periodo seleccionado", "team", "equipo"];
const POSITION = ["position", "posicion especifica", "posicion"];
const MINUTES = ["minutes played", "minutes", "mins", "minutos jugados", "minutos"];
const AGE = ["age", "edad"];

/** Los jugadores de la base, con su equipo, sus puestos y sus minutos. */
export function jugadoresDeBase(rows: DataRow[]): JugadorDeBase[] {
  if (!rows.length) return [];
  const h = encabezados(rows);
  const [cJugador, cEquipo, cPuesto, cMinutos, cEdad] = [PLAYER, TEAM, POSITION, MINUTES, AGE].map((a) => findColumn(h, a));
  if (!cJugador || !cEquipo) return [];
  return rows.flatMap((r, fila) => {
    const nombre = String(r[cJugador] ?? "").trim(), equipo = String(r[cEquipo] ?? "").trim();
    if (!nombre || !equipo) return [];
    const puestos = String(cPuesto ? r[cPuesto] ?? "" : "").toUpperCase().split(/[,;/]\s*/).map((p) => p.trim()).filter(Boolean);
    const minutos = cMinutos ? numero(r[cMinutos]) : NaN, edad = cEdad ? numero(r[cEdad]) : NaN;
    return [{ nombre, equipo, puestos, minutos: Number.isFinite(minutos) ? minutos : 0, edad: Number.isFinite(edad) ? edad : null, fila }];
  });
}

/** Los equipos de la base, por orden alfabético. */
export const equiposDeBase = (jugadores: JugadorDeBase[]) => [...new Set(jugadores.map((j) => j.equipo))].sort((a, b) => a.localeCompare(b, "es"));

/**
 * Los jugadores de un equipo, el que más minutos tiene primero. Si un jugador
 * sale varias veces (dos temporadas cruzadas), cuenta la fila con más minutos.
 */
export function plantillaDe(jugadores: JugadorDeBase[], equipo: string): JugadorDeBase[] {
  const mejores = new Map<string, JugadorDeBase>();
  for (const j of jugadores) {
    if (j.equipo !== equipo) continue;
    const antes = mejores.get(j.nombre);
    if (!antes || j.minutos > antes.minutos) mejores.set(j.nombre, j);
  }
  return [...mejores.values()].sort((a, b) => b.minutos - a.minutos);
}

/**
 * Quién va en cada ficha: por cada ficha, el jugador libre que mejor encaja
 * con su puesto, y entre los que encajan igual, el de más minutos. Primero se
 * reparten los encajes exactos (su puesto principal), después los parecidos
 * (lo juega a veces), después los de la misma línea y, al final, lo que quede
 * —salvo en la portería, que solo la ocupa un portero—.
 */
export function ponerPorPuestos(fichas: Ficha[], plantilla: JugadorDeBase[]): Map<string, JugadorDeBase> {
  const asignados = new Map<string, JugadorDeBase>();
  const libres = [...plantilla];
  const tomar = (fichaId: string, j: JugadorDeBase) => { asignados.set(fichaId, j); libres.splice(libres.indexOf(j), 1); };
  const pasadas: Array<(ficha: Ficha, j: JugadorDeBase) => boolean> = [
    (f, j) => puestosDeFicha(f).includes(j.puestos[0]),
    (f, j) => j.puestos.some((p) => puestosDeFicha(f).includes(p)),
    (f, j) => { const l = lineaDe(puestosDeFicha(f)); return Boolean(l) && l === lineaDe(j.puestos.slice(0, 1)); },
    (f, j) => (lineaDe(puestosDeFicha(f)) === "portero") === (lineaDe(j.puestos.slice(0, 1)) === "portero"),
  ];
  for (const encaja of pasadas) {
    for (const f of fichas) {
      if (asignados.has(f.id)) continue;
      const j = libres.find((x) => encaja(f, x));
      if (j) tomar(f.id, j);
    }
  }
  return asignados;
}

/** El apellido, que es lo que se lee bajo una ficha. */
export const apellido = (nombre: string) => nombre.trim().split(/\s+/).slice(-1)[0] ?? nombre;

type DefMetrica = { nombre: string; aliases: string[]; inversa?: boolean };
/** Tres números que dicen algo de cada línea, con los nombres de columna de Wyscout en inglés y en español. */
const METRICAS: Record<Linea, DefMetrica[]> = {
  portero: [
    { nombre: "Paradas, %", aliases: ["save rate %", "paradas %", "porcentaje de atajadas %"] },
    { nombre: "Goles evitados /90", aliases: ["prevented goals per 90", "goles evitados 90"] },
    { nombre: "Goles concedidos /90", aliases: ["conceded goals per 90", "goles recibidos 90", "goles concedidos 90"], inversa: true },
  ],
  defensa: [
    { nombre: "Duelos defensivos ganados, %", aliases: ["defensive duels won %", "duelos defensivos ganados %"] },
    { nombre: "Duelos aéreos ganados, %", aliases: ["aerial duels won %", "duelos aereos ganados %"] },
    { nombre: "Pases progresivos /90", aliases: ["progressive passes per 90", "pases progresivos 90"] },
    { nombre: "Intercepciones /90", aliases: ["interceptions per 90", "interceptaciones 90", "intercepciones 90"] },
  ],
  medio: [
    { nombre: "Pases progresivos /90", aliases: ["progressive passes per 90", "pases progresivos 90"] },
    { nombre: "Pases precisos, %", aliases: ["accurate passes %", "precision pases %", "pases precisos %"] },
    { nombre: "Pases clave /90", aliases: ["key passes per 90", "jugadas claves 90", "pases clave 90"] },
    { nombre: "Acciones defensivas /90", aliases: ["successful defensive actions per 90", "acciones defensivas realizadas 90", "acciones defensivas exitosas 90"] },
  ],
  ataque: [
    { nombre: "xG /90", aliases: ["xg per 90", "xg 90"] },
    { nombre: "Goles /90", aliases: ["goals per 90", "goles 90"] },
    { nombre: "xA /90", aliases: ["xa per 90", "xa 90"] },
    { nombre: "Regates /90", aliases: ["dribbles per 90", "regates 90"] },
  ],
};

export type Tarjeta = {
  jugador: JugadorDeBase;
  linea: Linea | null;
  /** Hasta tres números, con su percentil entre los de su misma línea de la base. */
  metricas: Array<{ nombre: string; valor: number; percentil: number }>;
};

/** La tarjeta de un jugador: tres números suyos y dónde quedan entre los de su línea en la base. */
export function tarjetaDe(rows: DataRow[], todos: JugadorDeBase[], jugador: JugadorDeBase): Tarjeta {
  const linea = lineaDe(jugador.puestos.slice(0, 1)) ?? lineaDe(jugador.puestos);
  if (!linea) return { jugador, linea: null, metricas: [] };
  const h = encabezados(rows);
  const deSuLinea = todos.filter((j) => (lineaDe(j.puestos.slice(0, 1)) ?? lineaDe(j.puestos)) === linea);
  const metricas: Tarjeta["metricas"] = [];
  for (const def of METRICAS[linea]) {
    if (metricas.length >= 3) break;
    const columna = findColumn(h, def.aliases);
    if (!columna) continue;
    const valor = numero(rows[jugador.fila]?.[columna]);
    if (!Number.isFinite(valor)) continue;
    const valores = deSuLinea.map((j) => numero(rows[j.fila]?.[columna])).filter(Number.isFinite);
    metricas.push({ nombre: def.nombre, valor, percentil: percentile(valor, valores, def.inversa) });
  }
  return { jugador, linea, metricas };
}

/** El jugador de la base que va en una ficha: por su nombre completo, en el equipo elegido si lo hay. */
export function jugadorDeFicha(ficha: Ficha, jugadores: JugadorDeBase[], equipo?: string): JugadorDeBase | null {
  if (!ficha.jugador) return null;
  const mismos = jugadores.filter((j) => j.nombre === ficha.jugador);
  const delEquipo = equipo ? mismos.filter((j) => j.equipo === equipo) : [];
  return [...(delEquipo.length ? delEquipo : mismos)].sort((a, b) => b.minutos - a.minutos)[0] ?? null;
}
