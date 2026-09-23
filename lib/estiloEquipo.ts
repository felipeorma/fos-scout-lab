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

export type FilaEquipo = Record<string, unknown> & {
  team_id: number;
  team_name: string;
  competition_id: number;
  competition_name: string;
  season_id: number;
  season_name: string;
  team_season_matches?: number;
};

export type FamiliaEstilo = "construccion" | "circulacion" | "ataque" | "defensa";

export const FAMILIAS: Array<{ id: FamiliaEstilo; nombre: string }> = [
  { id: "construccion", nombre: "Construcción" },
  { id: "circulacion", nombre: "Circulación" },
  { id: "ataque", nombre: "Ataque" },
  { id: "defensa", nombre: "Defensa" },
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
};

const num = (fila: FilaEquipo, campo: string) => {
  const valor = fila[campo];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : Number.NaN;
};
const cociente = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : Number.NaN);

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
  valores: Record<string, ValorEstilo>;
};

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
      valores,
    };
  });
}

/**
 * Cuánto se parecen dos equipos en cómo juegan, de 0 a 100.
 *
 * Coseno entre sus perfiles en desviaciones típicas, solo con las métricas de
 * estilo: dos equipos que presionan arriba y salen en corto se parecen aunque
 * uno meta el doble de goles. 100 es la misma forma de jugar, 50 no tener
 * nada que ver, 0 jugar al revés.
 */
export function parecidoDeEstilo(a: PerfilEquipo, b: PerfilEquipo): number {
  let producto = 0, normaA = 0, normaB = 0, comunes = 0;
  for (const metrica of METRICAS_ESTILO) {
    if (!metrica.estilo) continue;
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
    .map((otro) => ({ perfil: otro, parecido: parecidoDeEstilo(objetivo, otro) }))
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
