/**
 * Las fases del juego de un equipo, como las entrega un analista a su cuerpo
 * técnico: con balón, transición tras pérdida, sin balón, transición tras
 * robo y balón parado. Cada número es la media por partido de su temporada,
 * con su puesto dentro de SU liga y una lectura en palabras (alto, medio,
 * bajo) por tercios de esa liga. Así dos equipos de ligas distintas se leen
 * igual: "defiende alto para su liga", y el nivel de cada liga va aparte.
 *
 * Fuentes: las estadísticas de equipo por partido de StatsBomb
 * (/api/statsbomb/team-matches) y la forma de cada equipo en cada partido
 * (/api/statsbomb/team-shape), que el puente saca de los eventos: dónde
 * defiende, dónde presiona, cuánto mide su bloque, dónde recupera y por dónde
 * ataca. Sin StatsBomb 360 el largo y el ancho del bloque son una estimación
 * con la posición de sus acciones defensivas y de presión, y se dice.
 */

import type { LigaPartidos } from "./partido.ts";

export type FormaEquipoPartido = {
  alturaDefensa: number | null;
  alturaPresion: number | null;
  largoEstimado: number | null;
  anchoEstimado: number | null;
  recuperacionesAltas: number | null;
  recuperacionesCampoRival: number | null;
  contrapresiones: number;
  balonLargo: number | null;
  cambiosDeOrientacion: number;
  alturaPosesion: number | null;
  amplitud: number | null;
  pasesUltimoTercio: number;
  /** Con StatsBomb 360: la última línea y el largo y el ancho reales del bloque. */
  lineaReal?: number | null;
  largoReal?: number | null;
  anchoReal?: number | null;
};

export type LigaForma = { partidos: Array<{ partido: number; fecha: string; equipos: Record<string, FormaEquipoPartido> }>; con360: number; fallidos: number };

export type Fuente = "stats" | "forma" | "inclinacion";

export type MetricaDeFase = {
  id: string;
  etiqueta: string;
  fuente: Fuente;
  /** El campo: de las estadísticas por partido o de la forma. */
  campo: string;
  formato: "pct" | "m" | "n1" | "n2";
  /** Palabras para el tercio alto, medio y bajo de su liga. */
  palabras: [string, string, string];
  /** Si más es mejor para él (verde) o peor (rojo); sin esto, solo describe. */
  mejor?: "alto" | "bajo";
  /** Lo que explica, para el título al pasar el cursor. */
  ayuda?: string;
};

export type Fase = { id: "con" | "perdida" | "sin" | "robo" | "parado"; nombre: string; metricas: MetricaDeFase[] };

const ALTO_MEDIO_BAJO: [string, string, string] = ["alta", "media", "baja"];
const MUCHO_POCO: [string, string, string] = ["mucho", "normal", "poco"];

export const FASES: Fase[] = [
  { id: "con", nombre: "Con balón", metricas: [
    { id: "posesion", etiqueta: "Posesión", fuente: "stats", campo: "possession", formato: "pct", palabras: ALTO_MEDIO_BAJO },
    { id: "altura_posesion", etiqueta: "Dónde tiene el balón (altura media de sus pases)", fuente: "forma", campo: "alturaPosesion", formato: "m", palabras: ["arriba", "en medio", "atrás"] },
    { id: "inclinacion", etiqueta: "Dominio territorial (pases en el último tercio, suyos sobre los dos)", fuente: "inclinacion", campo: "pasesUltimoTercio", formato: "pct", palabras: ["domina", "reparte", "dominado"], mejor: "alto" },
    { id: "salida_corta", etiqueta: "Saques de puerta en corto", fuente: "stats", campo: "gk_long_pass_ratio", formato: "pct", palabras: ["en corto", "mixto", "en largo"] },
    { id: "balon_largo", etiqueta: "Balón largo (pases de 30 m o más)", fuente: "forma", campo: "balonLargo", formato: "pct", palabras: ["directo", "mixto", "elaborado"] },
    { id: "amplitud", etiqueta: "Amplitud (recepciones en banda en campo rival)", fuente: "forma", campo: "amplitud", formato: "pct", palabras: ["muy abierto", "normal", "por dentro"] },
    { id: "cambios", etiqueta: "Cambios de orientación", fuente: "forma", campo: "cambiosDeOrientacion", formato: "n1", palabras: MUCHO_POCO },
    { id: "progresiones", etiqueta: "Progresiones al último tercio", fuente: "stats", campo: "deep_progressions", formato: "n1", palabras: MUCHO_POCO, mejor: "alto" },
    { id: "centros", etiqueta: "Centros al área", fuente: "stats", campo: "crosses_into_box", formato: "n1", palabras: MUCHO_POCO },
    { id: "xg_juego", etiqueta: "xG en juego abierto", fuente: "stats", campo: "op_xg", formato: "n2", palabras: MUCHO_POCO, mejor: "alto" },
    { id: "xg_tiro", etiqueta: "xG por tiro", fuente: "stats", campo: "np_xg_per_shot", formato: "n2", palabras: ["buenas", "normales", "lejanas"], mejor: "alto" },
  ] },
  { id: "perdida", nombre: "Tras perder el balón", metricas: [
    { id: "contrapresiones", etiqueta: "Contrapresiones", fuente: "forma", campo: "contrapresiones", formato: "n1", palabras: MUCHO_POCO },
    { id: "contra_concedidos", etiqueta: "Tiros al contragolpe concedidos", fuente: "stats", campo: "counter_attacking_shots_conceded", formato: "n2", palabras: MUCHO_POCO, mejor: "bajo" },
  ] },
  { id: "sin", nombre: "Sin balón", metricas: [
    { id: "altura_defensa", etiqueta: "Altura de la defensa (distancia media de sus acciones defensivas a su portería)", fuente: "stats", campo: "defensive_distance", formato: "m", palabras: ["bloque alto", "bloque medio", "bloque bajo"] },
    { id: "altura_presion", etiqueta: "Altura de la presión", fuente: "forma", campo: "alturaPresion", formato: "m", palabras: ["arriba", "en medio", "abajo"] },
    { id: "ppda", etiqueta: "PPDA (pases que deja dar por acción defensiva; menos es más presión)", fuente: "stats", campo: "ppda", formato: "n1", palabras: ["deja jugar", "normal", "aprieta"] },
    { id: "presion_rival", etiqueta: "Presiones en campo rival", fuente: "stats", campo: "fhalf_pressures_ratio", formato: "pct", palabras: ALTO_MEDIO_BAJO },
    { id: "largo_bloque", etiqueta: "Largo del bloque (de la primera a la última línea)", fuente: "forma", campo: "largo", formato: "m", palabras: ["largo", "medio", "compacto"] },
    { id: "ancho_bloque", etiqueta: "Ancho del bloque", fuente: "forma", campo: "ancho", formato: "m", palabras: ["abierto", "medio", "estrecho"] },
    { id: "recuperacion_alta", etiqueta: "Recuperaciones en campo rival", fuente: "forma", campo: "recuperacionesCampoRival", formato: "pct", palabras: ALTO_MEDIO_BAJO, mejor: "alto" },
    { id: "xg_contra", etiqueta: "xG concedido en juego abierto", fuente: "stats", campo: "op_xg_conceded", formato: "n2", palabras: MUCHO_POCO, mejor: "bajo" },
  ] },
  { id: "robo", nombre: "Tras robar el balón", metricas: [
    { id: "contragolpe", etiqueta: "Tiros al contragolpe", fuente: "stats", campo: "counter_attacking_shots", formato: "n2", palabras: MUCHO_POCO, mejor: "alto" },
    { id: "robo_alto", etiqueta: "Tiros tras robo alto", fuente: "stats", campo: "high_press_shots", formato: "n2", palabras: MUCHO_POCO, mejor: "alto" },
    { id: "velocidad", etiqueta: "Velocidad hacia portería (m/s)", fuente: "stats", campo: "pace_towards_goal", formato: "n2", palabras: ["rápido", "normal", "pausado"] },
  ] },
  { id: "parado", nombre: "Balón parado", metricas: [
    { id: "parado_favor", etiqueta: "xG a balón parado", fuente: "stats", campo: "sp_xg", formato: "n2", palabras: MUCHO_POCO, mejor: "alto" },
    { id: "parado_contra", etiqueta: "xG a balón parado concedido", fuente: "stats", campo: "sp_xg_conceded", formato: "n2", palabras: MUCHO_POCO, mejor: "bajo" },
    { id: "corners", etiqueta: "Córners", fuente: "stats", campo: "corners", formato: "n1", palabras: MUCHO_POCO },
    { id: "xg_corner", etiqueta: "xG por córner", fuente: "stats", campo: "xg_per_corner", formato: "n2", palabras: ["peligroso", "normal", "inofensivo"], mejor: "alto" },
  ] },
];

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

/** Lo que vale cada métrica de cada equipo en un partido. */
function valorEnPartido(metrica: MetricaDeFase, stats: Record<string, number>, forma: FormaEquipoPartido | undefined, formaRival: FormaEquipoPartido | undefined) {
  if (metrica.fuente === "stats") {
    const v = num(stats[metrica.campo]);
    // StatsBomb da la proporción de saques largos del portero: aquí se cuenta la de cortos.
    return metrica.id === "salida_corta" && Number.isFinite(v) ? 1 - v : v;
  }
  if (!forma) return Number.NaN;
  if (metrica.fuente === "inclinacion") {
    const suyos = num(forma.pasesUltimoTercio);
    const delRival = num(formaRival?.pasesUltimoTercio);
    return suyos + delRival > 0 ? suyos / (suyos + delRival) : Number.NaN;
  }
  // El largo y el ancho: el real del 360 si lo hay; si no, el estimado.
  if (metrica.campo === "largo") return num(forma.largoReal ?? forma.largoEstimado);
  if (metrica.campo === "ancho") return num(forma.anchoReal ?? forma.anchoEstimado);
  return num((forma as Record<string, unknown>)[metrica.campo]);
}

export type LecturaDeMetrica = {
  metrica: MetricaDeFase;
  valor: number;
  mediaLiga: number;
  /** 1 = el que más de su liga. */
  puesto: number;
  equipos: number;
  /** 0 = tercio alto de su liga, 1 = medio, 2 = bajo. */
  tercio: 0 | 1 | 2 | null;
  palabra: string;
};

/**
 * Las medias por partido de cada equipo de la liga en cada métrica de las
 * fases, y con ellas el puesto y el tercio de cada uno.
 */
export function fasesDeLiga(liga: LigaPartidos, forma: LigaForma | null) {
  const formaDe = new Map<number, Record<string, FormaEquipoPartido>>();
  for (const p of forma?.partidos ?? []) formaDe.set(p.partido, p.equipos);
  const porEquipo = new Map<number, Map<string, number[]>>();
  const anotar = (equipo: number, id: string, v: number) => {
    if (!Number.isFinite(v)) return;
    const mapa = porEquipo.get(equipo) ?? new Map<string, number[]>();
    mapa.set(id, [...(mapa.get(id) ?? []), v]);
    porEquipo.set(equipo, mapa);
  };
  for (const p of liga.partidos) {
    const formas = formaDe.get(p.partido);
    for (const [suyo, otro] of [[p.local, p.visita], [p.visita, p.local]] as const) {
      for (const fase of FASES) {
        for (const metrica of fase.metricas) {
          anotar(suyo.equipo, metrica.id, valorEnPartido(metrica, suyo.stats ?? {}, formas?.[String(suyo.equipo)], formas?.[String(otro.equipo)]));
        }
      }
    }
  }
  const medias = new Map<number, Record<string, number>>();
  for (const [equipo, mapa] of porEquipo) {
    medias.set(equipo, Object.fromEntries([...mapa.entries()].map(([id, xs]) => [id, media(xs)])));
  }
  return medias;
}

/** La lectura de un equipo, fase por fase, contra los equipos de su liga. */
export function lecturaDeFases(medias: Map<number, Record<string, number>>, equipo: number): Array<{ fase: Fase; lecturas: LecturaDeMetrica[] }> {
  const suyo = medias.get(equipo);
  if (!suyo) return [];
  const todos = [...medias.values()];
  return FASES.map((fase) => ({
    fase,
    lecturas: fase.metricas.flatMap((metrica) => {
      const valor = suyo[metrica.id];
      if (!Number.isFinite(valor)) return [];
      const valores = todos.map((m) => m[metrica.id]).filter(Number.isFinite);
      const puesto = 1 + valores.filter((v) => v > valor).length;
      const tercio: LecturaDeMetrica["tercio"] = valores.length >= 3 ? (puesto <= Math.ceil(valores.length / 3) ? 0 : puesto > Math.floor((2 * valores.length) / 3) ? 2 : 1) : null;
      return [{ metrica, valor, mediaLiga: media(valores), puesto, equipos: valores.length, tercio, palabra: tercio === null ? "" : metrica.palabras[tercio] }];
    }),
  })).filter(({ lecturas }) => lecturas.length);
}

/** La lectura de una métrica concreta de un equipo, o null. */
export function lecturaDe(lecturas: Array<{ lecturas: LecturaDeMetrica[] }>, id: string) {
  for (const { lecturas: l } of lecturas) {
    const encontrada = l.find((x) => x.metrica.id === id);
    if (encontrada) return encontrada;
  }
  return null;
}

/** Los últimos partidos de un equipo, del más reciente al más viejo: lo que dice cómo viene. */
export function formaReciente(liga: LigaPartidos, equipo: number, cuantos = 5) {
  return liga.partidos
    .filter((p) => p.local.equipo === equipo || p.visita.equipo === equipo)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, cuantos)
    .map((p) => {
      const enCasa = p.local.equipo === equipo;
      const suyo = enCasa ? p.local : p.visita;
      const otro = enCasa ? p.visita : p.local;
      return {
        fecha: p.fecha, enCasa, rival: otro.nombre, gf: suyo.goles, gc: otro.goles,
        resultado: suyo.goles > otro.goles ? "G" as const : suyo.goles < otro.goles ? "P" as const : "E" as const,
        xg: num(suyo.stats?.np_xg), xgContra: num(otro.stats?.np_xg), formacion: suyo.formacion,
      };
    });
}
