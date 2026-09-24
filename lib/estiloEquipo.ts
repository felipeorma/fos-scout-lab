/**
 * Estilo de juego de un equipo, y cuánto se parece al nuestro.
 *
 * Réplica del "Team Style Fit" del dossier de Julio Costa (página 7): el
 * perfil de un equipo en veintitantas métricas, agrupadas en cuatro familias
 * —construcción, circulación, ataque y defensa—, cada una en desviaciones
 * típicas y percentil contra todos los equipos del grupo de referencia.
 *
 * Lo que se añade aquí, y que la página no hace, es separar CÓMO juega un
 * equipo de QUÉ TAN BIEN le va. Para decidir si un jugador encaja lo que
 * importa es lo primero: un lateral que viene de un equipo que presiona arriba
 * y sale en corto se adapta antes a un equipo que hace lo mismo, sea mejor o
 * peor. Por eso cada métrica dice si es de estilo o de rendimiento, y el
 * parecido entre equipos se calcula solo con las de estilo.
 *
 * Los datos son las estadísticas de temporada por equipo de StatsBomb
 * (endpoint team-stats v2, 181 campos por equipo). Todo va por partido.
 */

import { clubsMatch } from "./scouting.ts";

/** El equipo con el que se mide el encaje. */
export const EQUIPO_PROPIO = "Cavalry";

export type FilaEquipo = Record<string, unknown> & {
  team_id: number;
  team_name: string;
  competition_id: number;
  competition_name: string;
  season_id: number;
  season_name: string;
  team_season_matches?: number;
};

export type FamiliaEstilo = "construccion" | "circulacion" | "ataque" | "defensa" | "movimiento" | "presion";

export const FAMILIAS: Array<{ id: FamiliaEstilo; nombre: string }> = [
  { id: "construccion", nombre: "Construcción" },
  { id: "circulacion", nombre: "Circulación" },
  { id: "ataque", nombre: "Ataque" },
  { id: "defensa", nombre: "Defensa" },
  { id: "movimiento", nombre: "Movimiento sin balón" },
  { id: "presion", nombre: "Presión sin balón" },
];

export type MetricaEstilo = {
  id: string;
  /** En español; la pantalla la traduce con t(). */
  etiqueta: string;
  /** Para la rosa, donde veinticuatro nombres largos no caben sin pisarse. */
  corta?: string;
  familia: FamiliaEstilo;
  valor: (fila: FilaEquipo) => number;
  /**
   * Menos es más. Se invierte el signo para que, en todas las métricas, a la
   * derecha esté siempre "más de lo que la etiqueta dice": más presión, menos
   * tiros concedidos.
   */
  invertida?: boolean;
  /** Describe cómo juega. Si no, describe cuánto rinde y no entra en el parecido. */
  estilo: boolean;
  formato: "pct" | "n1" | "n2" | "n3";
  /** De dónde sale. Las de SkillCorner solo existen en las ligas que cubre. */
  fuente?: "statsbomb" | "skillcorner";
};

const num = (fila: FilaEquipo, campo: string) => {
  const valor = fila[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : Number.NaN;
};
const cociente = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : Number.NaN);

/*
 * SkillCorner por equipo da el promedio por jugador y partido, no el total.
 * Se normaliza como lo hace SkillCorner: por cada 30 minutos con balón (tip)
 * o sin balón (otip). Así la métrica no premia al que tiene más posesión.
 */
const sc = (f: FilaEquipo, campo: string) => num(f, `sc_${campo}`);
const porTreinta = (f: FilaEquipo, valor: number, fase: "tip" | "otip") => cociente(valor, sc(f, `minutes_${fase}`)) * 30;
const sumaSc = (f: FilaEquipo, ...campos: string[]) => campos.reduce((suma, campo) => suma + sc(f, campo), 0);

/*
 * Cada métrica, con la equivalencia en la página 7 cuando la hay. Donde el
 * dossier usa algo que StatsBomb no publica por equipo —el reparto de pases
 * por carriles, las secuencias de más de cuatro pases— se usa lo más cercano
 * que sí existe, y la etiqueta dice lo que mide de verdad, no lo que imita.
 */
export const METRICAS_ESTILO: MetricaEstilo[] = [
  // ---- Construcción ----
  { id: "salida_corta", etiqueta: "Salida corta del portero %", corta: "Salida corta %", familia: "construccion", estilo: true, formato: "pct",
    valor: (f) => 1 - num(f, "team_season_gk_long_pass_ratio") },
  { id: "pases_posesion", etiqueta: "Pases por posesión", corta: "Pases/posesión", familia: "construccion", estilo: true, formato: "n2",
    valor: (f) => cociente(num(f, "team_season_passes_pg"), num(f, "team_season_possessions")) },
  { id: "posesion", etiqueta: "Posesión %", familia: "construccion", estilo: true, formato: "pct",
    valor: (f) => num(f, "team_season_possession") },
  { id: "directo", etiqueta: "Juego directo", familia: "construccion", estilo: true, formato: "n3",
    valor: (f) => num(f, "team_season_directness") },
  { id: "ritmo", etiqueta: "Velocidad hacia portería (m/s)", corta: "Velocidad de ataque", familia: "construccion", estilo: true, formato: "n2",
    valor: (f) => num(f, "team_season_pace_towards_goal") },

  // ---- Circulación ----
  { id: "precision_rival", etiqueta: "Precisión en campo rival %", corta: "Precisión en campo rival", familia: "circulacion", estilo: true, formato: "pct",
    valor: (f) => num(f, "team_season_opp_passing_ratio") },
  { id: "progresiones", etiqueta: "Progresiones al último tercio", corta: "Progresiones", familia: "circulacion", estilo: true, formato: "n1",
    valor: (f) => num(f, "team_season_deep_progressions_pg") },
  { id: "llegadas", etiqueta: "Pases completados cerca del área", corta: "Llegadas al área", familia: "circulacion", estilo: false, formato: "n1",
    valor: (f) => num(f, "team_season_deep_completions_pg") },
  { id: "pases_area", etiqueta: "Pases dentro del área", corta: "Pases en el área", familia: "circulacion", estilo: true, formato: "n1",
    valor: (f) => num(f, "team_season_passes_inside_box_pg") },

  // ---- Ataque ----
  { id: "centros", etiqueta: "Centros al área", familia: "ataque", estilo: true, formato: "n1",
    valor: (f) => num(f, "team_season_crosses_into_box_pg") },
  { id: "contragolpe", etiqueta: "Tiros al contragolpe", corta: "Contragolpe", familia: "ataque", estilo: true, formato: "n2",
    valor: (f) => num(f, "team_season_counter_attacking_shots_pg") },
  { id: "tiros_area", etiqueta: "Tiros desde dentro del área %", corta: "Tiros en el área %", familia: "ataque", estilo: true, formato: "pct",
    valor: (f) => 1 - cociente(num(f, "team_season_op_shots_outside_box_pg"), num(f, "team_season_op_shots_pg")) },
  { id: "tiros", etiqueta: "Tiros", familia: "ataque", estilo: false, formato: "n1",
    valor: (f) => num(f, "team_season_np_shots_pg") },
  { id: "xg_juego", etiqueta: "xG en juego abierto", corta: "xG en juego", familia: "ataque", estilo: false, formato: "n2",
    valor: (f) => num(f, "team_season_op_xg_pg") },
  { id: "xg_parado", etiqueta: "xG a balón parado", corta: "xG parado", familia: "ataque", estilo: false, formato: "n2",
    valor: (f) => num(f, "team_season_sp_xg_pg") },
  { id: "xg_tiro", etiqueta: "xG por tiro", familia: "ataque", estilo: false, formato: "n3",
    valor: (f) => num(f, "team_season_np_xg_per_shot") },

  // ---- Defensa ----
  { id: "ppda", etiqueta: "Presión (PPDA)", familia: "defensa", estilo: true, formato: "n1", invertida: true,
    valor: (f) => num(f, "team_season_ppda") },
  { id: "altura", etiqueta: "Altura de la defensa (m)", corta: "Altura defensa", familia: "defensa", estilo: true, formato: "n1",
    valor: (f) => num(f, "team_season_defensive_distance") },
  { id: "presion_rival", etiqueta: "Presiones en campo rival %", corta: "Presión en campo rival", familia: "defensa", estilo: true, formato: "pct",
    valor: (f) => num(f, "team_season_fhalf_pressures_ratio") },
  { id: "contrapresion", etiqueta: "Contrapresiones", familia: "defensa", estilo: true, formato: "n1",
    valor: (f) => num(f, "team_season_counterpressures_pg") },
  { id: "robo_alto", etiqueta: "Tiros tras robo alto", corta: "Robo alto", familia: "defensa", estilo: true, formato: "n2",
    valor: (f) => num(f, "team_season_high_press_shots_pg") },
  { id: "tiros_contra", etiqueta: "Tiros concedidos", familia: "defensa", estilo: false, formato: "n1", invertida: true,
    valor: (f) => num(f, "team_season_np_shots_conceded_pg") },
  { id: "xg_tiro_contra", etiqueta: "xG por tiro concedido", corta: "xG/tiro concedido", familia: "defensa", estilo: false, formato: "n3", invertida: true,
    valor: (f) => num(f, "team_season_np_xg_per_shot_conceded") },
  { id: "llegadas_contra", etiqueta: "Llegadas concedidas cerca del área", corta: "Llegadas concedidas", familia: "defensa", estilo: false, formato: "n1", invertida: true,
    valor: (f) => num(f, "team_season_deep_completions_conceded_pg") },

  // ---- Movimiento sin balón (SkillCorner) ----
  { id: "sc_rupturas", etiqueta: "Rupturas a la espalda", corta: "Rupturas", familia: "movimiento", estilo: true, formato: "n2", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sc(f, "behindrun_count"), "tip") },
  { id: "sc_apoyos", etiqueta: "Desmarques de apoyo", corta: "Apoyos", familia: "movimiento", estilo: true, formato: "n2", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sumaSc(f, "comingshortrun_count", "droppingoffrun_count", "supportrun_count"), "tip") },
  { id: "sc_abriendo", etiqueta: "Desmarques abriendo el campo", corta: "Abriendo", familia: "movimiento", estilo: true, formato: "n2", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sumaSc(f, "overlaprun_count", "underlaprun_count", "pullingwiderun_count", "pullinghalfspacerun_count"), "tip") },
  { id: "sc_al_area", etiqueta: "Carreras al área para el centro", corta: "Al área", familia: "movimiento", estilo: true, formato: "n2", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sc(f, "crossreceiverrun_count"), "tip") },
  { id: "sc_sirve", etiqueta: "Sirve la carrera %", corta: "Sirve la carrera", familia: "movimiento", estilo: true, formato: "pct", fuente: "skillcorner",
    valor: (f) => cociente(sc(f, "pass_count_torun_attempted"), sc(f, "passopportunity_count_torun")) },
  { id: "sc_rompe_lineas", etiqueta: "Pases rompe-líneas", corta: "Rompe-líneas", familia: "movimiento", estilo: true, formato: "n2", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sc(f, "pass_count_linebreak_completed"), "tip") },
  { id: "sc_retencion", etiqueta: "Retención bajo presión %", corta: "Retiene presionado", familia: "movimiento", estilo: false, formato: "pct", fuente: "skillcorner",
    valor: (f) => sc(f, "possession_pct_drawnpressure_retained") / 100 },

  // ---- Presión sin balón (SkillCorner) ----
  { id: "sc_presiones", etiqueta: "Presiones sobre el balón", corta: "Presiones", familia: "presion", estilo: true, formato: "n1", fuente: "skillcorner",
    valor: (f) => porTreinta(f, sc(f, "onballengagement_count"), "otip") },
  // Descriptiva, no de estilo: sobre los 37 equipos con SkillCorner va con
  // "Presiones en campo rival %" de StatsBomb a 0,80, y contarla también en
  // el parecido sería contar dos veces la misma presión.
  { id: "sc_cadenas", etiqueta: "Presiones en cadena %", corta: "En cadena", familia: "presion", estilo: false, formato: "pct", fuente: "skillcorner",
    valor: (f) => cociente(sc(f, "onballengagement_count_pressingchain"), sc(f, "onballengagement_count")) },
  { id: "sc_robo_directo", etiqueta: "Robo directo al presionar %", corta: "Robo directo", familia: "presion", estilo: false, formato: "pct", fuente: "skillcorner",
    valor: (f) => sc(f, "onballengagement_pct_directregain") / 100 },
  { id: "sc_hacia_atras", etiqueta: "Obliga a jugar hacia atrás %", corta: "Hacia atrás", familia: "presion", estilo: false, formato: "pct", fuente: "skillcorner",
    valor: (f) => sc(f, "onballengagement_pct_forcedbackward") / 100 },
];

/**
 * Partidos mínimos para que la temporada de un equipo cuente.
 *
 * Con cinco, un equipo de la Eerste Divisie en la jornada seis encabezaba los
 * tiros al contragolpe con z +6,45: la muestra hablando, no el estilo.
 */
export const PARTIDOS_MINIMOS = 10;

/**
 * Una temporada por equipo y competición.
 *
 * Las ligas de otoño a primavera tienen dos temporadas en curso a la vez
 * —2025/2026 acabándose, 2026/2027 empezando— y la app carga las dos. Con
 * ambas, Ajax II o Almere salían dos veces y esas ligas contaban doble en las
 * medias. Se queda la más reciente si ya tiene muestra; si no, la que más
 * partidos tiene, que suele ser la que acaba de terminar.
 */
export function unaTemporadaPorEquipo(filas: FilaEquipo[]): FilaEquipo[] {
  const grupos = new Map<string, FilaEquipo[]>();
  for (const fila of filas) {
    const clave = `${fila.competition_id}:${fila.team_id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
  }
  return [...grupos.values()].map((lista) => {
    const recientes = [...lista].sort((a, b) => String(b.season_name).localeCompare(String(a.season_name), "en", { numeric: true }));
    return recientes.find((fila) => (fila.team_season_matches ?? 0) >= PARTIDOS_MINIMOS)
      ?? recientes.reduce((a, b) => ((b.team_season_matches ?? 0) > (a.team_season_matches ?? 0) ? b : a));
  });
}

/**
 * Quién entra en el grupo de referencia.
 *
 * Las medias y desviaciones salen de los equipos profesionales masculinos. La
 * NCAA y las ligas femeninas se pueden puntuar —se les calcula el perfil
 * contra ese mismo grupo—, pero no lo forman: setenta y tres equipos
 * universitarios moverían las medias hacia un fútbol que no es el nuestro.
 */
export function entraEnReferencia(fila: FilaEquipo) {
  return !/NCAA|\(W\)|women|femen/i.test(`${fila.competition_name}`) && (fila.team_season_matches ?? 0) >= PARTIDOS_MINIMOS;
}

export type ValorEstilo = { id: string; bruto: number; z: number; percentil: number };

export type PerfilEquipo = {
  clave: string;
  equipo: string;
  competicion: string;
  temporada: string;
  partidos: number;
  /** Si forma parte del grupo de referencia (profesional, masculino, con muestra). */
  referencia: boolean;
  /** Si su liga tiene datos de equipo de SkillCorner. */
  conSkillcorner: boolean;
  valores: Record<string, ValorEstilo>;
};

/**
 * El valor de una familia en el radar de seis aristas: la media de los
 * percentiles de sus métricas (las invertidas ya vienen invertidas). Sin
 * ninguna métrica con dato —un equipo sin SkillCorner en movimiento y presión
 * sin balón— no hay valor: la arista no se dibuja en vez de caer a cero.
 */
export function valorDeFamilia(perfil: PerfilEquipo, familia: FamiliaEstilo): { percentil: number; metricas: number } | null {
  const percentiles = METRICAS_ESTILO
    .filter((metrica) => metrica.familia === familia && perfil.valores[metrica.id])
    .map((metrica) => perfil.valores[metrica.id].percentil);
  if (!percentiles.length) return null;
  return { percentil: Math.round(percentiles.reduce((s, p) => s + p, 0) / percentiles.length), metricas: percentiles.length };
}

export const claveEquipo = (fila: FilaEquipo) => `${fila.competition_id}:${fila.season_id}:${fila.team_id}`;

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * El perfil de cada equipo, en desviaciones típicas y percentil contra el
 * grupo de referencia. El signo ya lleva aplicada la inversión.
 */
export function perfilesDeEstilo(todas: FilaEquipo[]): PerfilEquipo[] {
  const filas = unaTemporadaPorEquipo(todas);
  const referencia = filas.filter(entraEnReferencia);
  const base = referencia.length >= 10 ? referencia : filas;
  const escalas = new Map<string, { media: number; sd: number; ordenados: number[] }>();
  for (const metrica of METRICAS_ESTILO) {
    const valores = base.map(metrica.valor).filter(Number.isFinite);
    if (valores.length < 5) continue;
    const m = media(valores);
    const sd = Math.sqrt(media(valores.map((v) => (v - m) ** 2)));
    escalas.set(metrica.id, { media: m, sd, ordenados: [...valores].sort((a, b) => a - b) });
  }
  return filas.map((fila) => {
    const valores: Record<string, ValorEstilo> = {};
    for (const metrica of METRICAS_ESTILO) {
      const escala = escalas.get(metrica.id);
      const bruto = metrica.valor(fila);
      if (!escala || !Number.isFinite(bruto) || !(escala.sd > 0)) continue;
      const signo = metrica.invertida ? -1 : 1;
      const z = signo * (bruto - escala.media) / escala.sd;
      const debajo = escala.ordenados.filter((v) => v < bruto).length;
      const iguales = escala.ordenados.filter((v) => v === bruto).length;
      const rango = Math.round(((debajo + iguales / 2) / escala.ordenados.length) * 100);
      valores[metrica.id] = { id: metrica.id, bruto, z, percentil: metrica.invertida ? 100 - rango : rango };
    }
    return {
      clave: claveEquipo(fila),
      equipo: String(fila.team_name),
      competicion: String(fila.competition_name),
      temporada: String(fila.season_name),
      partidos: Number(fila.team_season_matches ?? 0),
      referencia: entraEnReferencia(fila),
      conSkillcorner: Number.isFinite(num(fila, "sc_minutes_tip")),
      valores,
    };
  });
}

export type Fuente = "statsbomb" | "skillcorner";

/**
 * Cuánto se parecen dos equipos en cómo juegan, de 0 a 100.
 *
 * Coseno entre sus perfiles en desviaciones típicas, solo con las métricas de
 * estilo: dos equipos que presionan arriba y salen en corto se parecen aunque
 * uno meta el doble de goles. 100 es la misma forma de jugar, 50 no tener
 * nada que ver, 0 jugar al revés.
 *
 * Por defecto, solo StatsBomb. SkillCorner por equipo cubre la CPL y la MLS
 * Next Pro —37 de 224 equipos— y meterlo en el parecido que ordena sesgaba la
 * lista: un equipo sin SkillCorner se comparaba en menos dimensiones, y con
 * menos dimensiones es más fácil coincidir. Los diez que "jugaban como
 * Cavalry" salían todos de ligas sin SkillCorner. Con las dos fuentes solo se
 * calcula cuando los dos equipos las tienen, y se enseña aparte.
 */
export function parecidoDeEstilo(a: PerfilEquipo, b: PerfilEquipo, fuentes: Fuente[] = ["statsbomb"]): number {
  if (fuentes.includes("skillcorner") && !(a.conSkillcorner && b.conSkillcorner)) return Number.NaN;
  let producto = 0, normaA = 0, normaB = 0, comunes = 0;
  for (const metrica of METRICAS_ESTILO) {
    if (!metrica.estilo || !fuentes.includes(metrica.fuente ?? "statsbomb")) continue;
    const va = a.valores[metrica.id]?.z, vb = b.valores[metrica.id]?.z;
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    producto += va! * vb!; normaA += va! ** 2; normaB += vb! ** 2; comunes += 1;
  }
  if (comunes < 5 || !normaA || !normaB) return Number.NaN;
  const coseno = producto / Math.sqrt(normaA * normaB);
  return Math.round(((coseno + 1) / 2) * 1000) / 10;
}

/** Los equipos que más se parecen a uno, del más al menos parecido. */
export function equiposParecidos(objetivo: PerfilEquipo, perfiles: PerfilEquipo[], cuantos = 10) {
  return perfiles
    .filter((otro) => otro.clave !== objetivo.clave)
    .map((otro) => ({
      perfil: otro,
      parecido: parecidoDeEstilo(objetivo, otro),
      /** Con SkillCorner también, cuando los dos equipos lo tienen. */
      conSkillcorner: parecidoDeEstilo(objetivo, otro, ["statsbomb", "skillcorner"]),
    }))
    .filter((fila) => Number.isFinite(fila.parecido))
    .sort((x, y) => y.parecido - x.parecido)
    .slice(0, cuantos);
}

/** Métrica a métrica, quién de los dos va por delante y por cuánto (en desviaciones típicas). */
export function cabezaACabeza(a: PerfilEquipo, b: PerfilEquipo) {
  return METRICAS_ESTILO
    .filter((metrica) => a.valores[metrica.id] && b.valores[metrica.id])
    .map((metrica) => {
      const za = a.valores[metrica.id].z, zb = b.valores[metrica.id].z;
      return { metrica, za, zb, lider: za >= zb ? "a" as const : "b" as const, diferencia: Math.abs(za - zb) };
    });
}

// ---- Encaje de estilo de un jugador --------------------------------------

/** El nombre de un club en la forma que usa clubsMatch: minúsculas, sin tildes ni signos. */
export function normalizarEquipo(nombre: string) {
  return String(nombre ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Lo que distingue a un filial de su primer equipo. clubsMatch acepta que un
// nombre sea subconjunto del otro —"Vancouver FC" ≡ "Vancouver Football
// Club"—, y con esa regla "Toronto FC" casaba con "Toronto FC II".
const MARCAS_DE_FILIAL = new Set(["ii", "iii", "b", "2", "u23", "u21", "u19", "reserves", "reserve", "academy", "youth"]);
const marcasDe = (nombre: string) => normalizarEquipo(nombre).split(" ").filter((token) => MARCAS_DE_FILIAL.has(token)).sort().join(" ");

/** ¿Son el mismo club? Igual nombre, o el mismo según clubsMatch sin mezclar filiales. */
export function mismoEquipo(a: string, b: string) {
  const na = normalizarEquipo(a), nb = normalizarEquipo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (marcasDe(a) !== marcasDe(b)) return false;
  return clubsMatch(na, nb);
}

/**
 * Busca el perfil de estilo del club de un jugador.
 *
 * Primero por nombre idéntico —las bases de StatsBomb escriben el club igual
 * que sus estadísticas de equipo—, después por clubsMatch, que es lo que casa
 * las grafías de Wyscout. Si hay más de uno, gana el que forma parte de la
 * referencia. Se recuerda por nombre: un ranking pregunta por el mismo club
 * decenas de veces.
 */
export function crearBuscadorDeEquipos(perfiles: PerfilEquipo[]) {
  const exactos = new Map<string, PerfilEquipo>();
  for (const perfil of perfiles) {
    const clave = normalizarEquipo(perfil.equipo);
    const previo = exactos.get(clave);
    if (!previo || (perfil.referencia && !previo.referencia)) exactos.set(clave, perfil);
  }
  const memoria = new Map<string, PerfilEquipo | null>();
  return (equipo: string): PerfilEquipo | null => {
    const clave = normalizarEquipo(equipo);
    if (!clave) return null;
    if (memoria.has(clave)) return memoria.get(clave)!;
    let hallado = exactos.get(clave) ?? null;
    if (!hallado) {
      const candidatos = perfiles.filter((perfil) => mismoEquipo(perfil.equipo, equipo));
      hallado = candidatos.find((perfil) => perfil.referencia) ?? candidatos[0] ?? null;
    }
    memoria.set(clave, hallado);
    return hallado;
  };
}

export type EncajeDeEstilo = { valor: number; equipo: string } | null;

/**
 * Cuánto se parece el estilo del club de un jugador al del nuestro.
 *
 * Null si no hay perfil de su club —liga sin estadísticas de equipo en
 * StatsBomb, o un nombre que no casa—: la ausencia se enseña como tal, no
 * como un cero.
 */
export function crearEncaje(perfiles: PerfilEquipo[], propio: string = EQUIPO_PROPIO) {
  const buscar = crearBuscadorDeEquipos(perfiles);
  const nuestro = buscar(propio) ?? perfiles.find((perfil) => normalizarEquipo(perfil.equipo).includes(normalizarEquipo(propio))) ?? null;
  return (equipo: string): EncajeDeEstilo => {
    if (!nuestro) return null;
    const perfil = buscar(equipo);
    if (!perfil) return null;
    const valor = perfil.clave === nuestro.clave ? 100 : parecidoDeEstilo(perfil, nuestro);
    return Number.isFinite(valor) ? { valor, equipo: perfil.equipo } : null;
  };
}

/** Tramo para pintarlo: alto desde 75, medio desde 60. */
export const tramoDeEncaje = (valor: number) => (valor >= 75 ? "alto" : valor >= 60 ? "medio" : "bajo");

/**
 * Pega los datos de equipo de SkillCorner a los de StatsBomb de la misma
 * competición, casando por nombre (mismoEquipo). Cada campo entra con prefijo
 * sc_ para que no pise nada. Un club que solo esté en un proveedor queda como
 * estaba: sin las métricas de SkillCorner, que es lo honesto.
 */
export function fusionarSkillcorner(filas: FilaEquipo[], deSkillcorner: Array<Record<string, unknown>>): FilaEquipo[] {
  return filas.map((fila) => {
    const suya = deSkillcorner.find((otra) => mismoEquipo(String(otra.team_name ?? ""), String(fila.team_name)));
    if (!suya) return fila;
    const extra: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(suya)) {
      if (typeof valor === "number" && Number.isFinite(valor)) extra[`sc_${campo}`] = valor;
    }
    return { ...fila, ...extra };
  });
}
