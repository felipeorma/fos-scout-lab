/**
 * El partido: cómo va a salir cada equipo y qué se espera cuando se crucen.
 *
 * Todo sale de sus partidos de la temporada (StatsBomb, partido a partido,
 * del puente: /api/statsbomb/team-matches): la formación y los puestos con que
 * salió cada día, y sus estadísticas de equipo y las de su rival. Con eso:
 *
 *  - La formación probable: la más usada, pesando más los últimos partidos.
 *  - La estructura de su once: centrales, laterales, pivotes... de los
 *    puestos reales de la alineación, no adivinada del número de la formación.
 *  - El choque de dibujos: dónde tiene cada uno superioridad numérica. Es
 *    pizarra, no datos: dice qué permite el dibujo, no lo que pasará.
 *  - Lo esperado en el partido: lo que suele hacer cada equipo, corregido por
 *    lo que suele conceder el rival. La corrección está calibrada con partidos
 *    reales (ver PREDICCION_CALIBRADA).
 *  - Las ventajas: dónde lo fuerte de uno coincide con lo flojo del otro.
 */

export type LadoPartido = {
  equipo: number;
  nombre: string;
  goles: number;
  /** El código de StatsBomb del once inicial: "4231". */
  formacion: string | null;
  /** Cambios tácticos durante el partido. */
  cambios: number;
  /** Los puestos del once inicial, de la alineación: ["CF", "GK", "LB", ...]. */
  once: string[];
  /** El once inicial con nombres: [["GK", "Marco Carducci"], ...]. */
  titulares?: Array<[string, string]>;
  /** Estadísticas de equipo del partido, sin el prefijo team_match_. */
  stats: Record<string, number>;
};

export type PartidoLiga = { partido: number; fecha: string; jornada: number | null; local: LadoPartido; visita: LadoPartido };
export type PartidoPendiente = { fecha: string; local: { equipo: number; nombre: string }; visita: { equipo: number; nombre: string } };
export type LigaPartidos = { partidos: PartidoLiga[]; fallidos: number; pendientes?: PartidoPendiente[] };

/** El próximo partido de un equipo que aún no se ha jugado, si el calendario lo trae. */
export function proximoPartido(liga: LigaPartidos, equipo: number): { fecha: string; rival: number; rivalNombre: string; enCasa: boolean } | null {
  const suyo = [...(liga.pendientes ?? [])]
    .filter((p) => p.local.equipo === equipo || p.visita.equipo === equipo)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))[0];
  if (!suyo) return null;
  const enCasa = suyo.local.equipo === equipo;
  const otro = enCasa ? suyo.visita : suyo.local;
  return { fecha: suyo.fecha, rival: otro.equipo, rivalNombre: otro.nombre, enCasa };
}

/** Un partido visto desde un equipo. */
export type PartidoDeEquipo = {
  fecha: string;
  enCasa: boolean;
  rival: string;
  rivalId: number;
  gf: number;
  gc: number;
  formacion: string | null;
  formacionRival: string | null;
  once: string[];
  onceRival: string[];
  titulares: Array<[string, string]>;
  cambios: number;
  propios: Record<string, number>;
  delRival: Record<string, number>;
};

/** Sus partidos de la temporada, del más viejo al más reciente. */
export function partidosDe(liga: LigaPartidos, equipo: number): PartidoDeEquipo[] {
  return liga.partidos
    .filter((p) => p.local.equipo === equipo || p.visita.equipo === equipo)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((p) => {
      const enCasa = p.local.equipo === equipo;
      const suyo = enCasa ? p.local : p.visita;
      const otro = enCasa ? p.visita : p.local;
      return {
        fecha: p.fecha, enCasa, rival: otro.nombre, rivalId: otro.equipo,
        gf: suyo.goles, gc: otro.goles,
        formacion: suyo.formacion, formacionRival: otro.formacion,
        once: suyo.once ?? [], onceRival: otro.once ?? [], titulares: suyo.titulares ?? [], cambios: suyo.cambios ?? 0,
        propios: suyo.stats ?? {}, delRival: otro.stats ?? {},
      };
    });
}

/** Los equipos de la liga, con su nombre. */
export function equiposDeLiga(liga: LigaPartidos): Array<{ equipo: number; nombre: string }> {
  const vistos = new Map<number, string>();
  for (const p of liga.partidos) {
    vistos.set(p.local.equipo, p.local.nombre);
    vistos.set(p.visita.equipo, p.visita.nombre);
  }
  return [...vistos.entries()].map(([equipo, nombre]) => ({ equipo, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** "4231" → "4-2-3-1": así las escribe StatsBomb, sin guiones. */
export const formacionLegible = (codigo: string | null) => (codigo ? codigo.split("").join("-") : "—");

// ---- Formación probable -------------------------------------------------------

/**
 * Cuánto pesa un partido según lo viejo que es: el de hace VIDA_MEDIA
 * partidos vale la mitad que el último. Calibrado (ver PREDICCION_CALIBRADA):
 * con 2 acierta el dibujo exacto del once inicial el 55,3 % de las veces,
 * contra el 51,4 % de "el del último partido" y el 50,4 % de "el más usado".
 * La línea —de 3 o de 4— la acierta el 90 %. El número exacto falla más de
 * lo que parece porque 4-2-3-1, 4-4-1-1 y 4-1-4-1 son a menudo el mismo once
 * con un matiz que el analista de StatsBomb lee distinto.
 */
export const VIDA_MEDIA_FORMACION = 2;

export function formacionProbable(partidos: PartidoDeEquipo[], vidaMedia = VIDA_MEDIA_FORMACION) {
  const conDibujo = partidos.filter((p) => p.formacion);
  const pesos = new Map<string, { peso: number; inicios: number }>();
  let total = 0;
  conDibujo.forEach((p, i) => {
    const edad = conDibujo.length - 1 - i;
    const peso = 0.5 ** (edad / vidaMedia);
    const actual = pesos.get(p.formacion!) ?? { peso: 0, inicios: 0 };
    pesos.set(p.formacion!, { peso: actual.peso + peso, inicios: actual.inicios + 1 });
    total += peso;
  });
  return [...pesos.entries()]
    .map(([formacion, { peso, inicios }]) => ({ formacion, probabilidad: total ? peso / total : 0, inicios }))
    .sort((a, b) => b.probabilidad - a.probabilidad || b.inicios - a.inicios);
}

// ---- Estructura del once ----------------------------------------------------------

export type Estructura = {
  centrales: number;
  laterales: number;
  carrileros: number;
  pivotes: number;
  interiores: number;
  mediapuntas: number;
  /** Extremos y volantes de banda. */
  bandas: number;
  delanteros: number;
};

const PAPEL: Record<string, keyof Estructura> = {
  CB: "centrales", LCB: "centrales", RCB: "centrales",
  LB: "laterales", RB: "laterales",
  LWB: "carrileros", RWB: "carrileros",
  DMF: "pivotes", LDMF: "pivotes", RDMF: "pivotes",
  CMF: "interiores", LCMF: "interiores", RCMF: "interiores",
  AMF: "mediapuntas", LAMF: "mediapuntas", RAMF: "mediapuntas",
  LM: "bandas", RM: "bandas", LW: "bandas", RW: "bandas",
  CF: "delanteros", LCF: "delanteros", RCF: "delanteros", SS: "delanteros",
};

export function estructuraDe(once: string[]): Estructura {
  const e: Estructura = { centrales: 0, laterales: 0, carrileros: 0, pivotes: 0, interiores: 0, mediapuntas: 0, bandas: 0, delanteros: 0 };
  for (const codigo of once) {
    const papel = PAPEL[codigo];
    if (papel) e[papel] += 1;
  }
  return e;
}

/** Jugadores por el centro del campo y por cada banda. */
export const centroDelCampo = (e: Estructura) => e.pivotes + e.interiores + e.mediapuntas;
export const porBanda = (e: Estructura) => (e.laterales + e.carrileros + e.bandas) / 2;

/**
 * El once típico con esa formación: el reparto de puestos que más se repite
 * en los partidos en que salió así. Sin partidos con ese dibujo, null.
 */
export function onceTipico(partidos: PartidoDeEquipo[], formacion: string): string[] | null {
  const cuenta = new Map<string, { once: string[]; veces: number }>();
  for (const p of partidos) {
    if (p.formacion !== formacion || p.once.length < 10) continue;
    const clave = [...p.once].sort().join(",");
    const actual = cuenta.get(clave) ?? { once: [...p.once].sort(), veces: 0 };
    cuenta.set(clave, { ...actual, veces: actual.veces + 1 });
  }
  return [...cuenta.values()].sort((a, b) => b.veces - a.veces)[0]?.once ?? null;
}

/** Línea de 3 (o de 5 con carrileros) o de 4. */
export const lineaDefensiva = (e: Estructura): 3 | 4 => (e.centrales >= 3 ? 3 : 4);

export type ChoqueDeZona = {
  zona: "salida_a" | "salida_b" | "medio" | "bandas";
  /** Jugadores de A y de B en la zona. */
  a: number;
  b: number;
  /** Quién tiene más; null si están igualados. */
  ventaja: "a" | "b" | null;
};

/**
 * El choque de dibujos, zona por zona. Pizarra: cuántos hay de cada uno donde
 * se encuentran, sin contar los movimientos que lo cambian todo en el campo.
 *  - salida_a: los centrales de A contra los delanteros de B (con cuántos
 *    sale A cuando B presiona con sus puntas).
 *  - salida_b: lo mismo para B.
 *  - medio: los de dentro de cada uno.
 *  - bandas: los de cada banda (laterales, carrileros, extremos).
 */
export function choqueDeDibujos(a: Estructura, b: Estructura): ChoqueDeZona[] {
  const zona = (nombre: ChoqueDeZona["zona"], na: number, nb: number): ChoqueDeZona => ({
    zona: nombre, a: na, b: nb, ventaja: na > nb ? "a" : nb > na ? "b" : null,
  });
  return [
    zona("salida_a", a.centrales, b.delanteros),
    zona("salida_b", a.delanteros, b.centrales),
    zona("medio", centroDelCampo(a), centroDelCampo(b)),
    zona("bandas", porBanda(a), porBanda(b)),
  ];
}

// ---- Lo esperado en el partido --------------------------------------------------------

export type MetricaPartido = {
  id: string;
  etiqueta: string;
  /** El campo de las estadísticas por partido. */
  campo: string;
  formato: "pct" | "n1" | "n2";
  /** PPDA: menos es presionar más. */
  menosEsMas?: boolean;
};

export const METRICAS_PARTIDO: MetricaPartido[] = [
  { id: "posesion", etiqueta: "Posesión", campo: "possession", formato: "pct" },
  { id: "xg", etiqueta: "xG sin penaltis", campo: "np_xg", formato: "n2" },
  { id: "tiros", etiqueta: "Tiros", campo: "np_shots", formato: "n1" },
  { id: "ppda", etiqueta: "PPDA (presión)", campo: "ppda", formato: "n1", menosEsMas: true },
  { id: "altura", etiqueta: "Altura de la defensa (m)", campo: "defensive_distance", formato: "n1" },
  { id: "directo", etiqueta: "Juego directo", campo: "directness", formato: "n2" },
  { id: "progresiones", etiqueta: "Progresiones al último tercio", campo: "deep_progressions", formato: "n1" },
  { id: "llegadas", etiqueta: "Pases completados cerca del área", campo: "deep_completions", formato: "n1" },
  { id: "centros", etiqueta: "Centros al área", campo: "crosses_into_box", formato: "n1" },
  { id: "contragolpe", etiqueta: "Tiros al contragolpe", campo: "counter_attacking_shots", formato: "n2" },
  { id: "robo_alto", etiqueta: "Tiros tras robo alto", campo: "high_press_shots", formato: "n2" },
  { id: "parado", etiqueta: "xG a balón parado", campo: "sp_xg", formato: "n2" },
];

/**
 * Cuánto se cree cada parte de la predicción, por métrica, calibrado con
 * partidos reales: lo esperado = media de la liga + k × ((lo que hace el
 * equipo − media) + (lo que concede el rival − media)).
 *
 * Con k = 1 es la suma tal cual de las dos tendencias; k < 1 encoge hacia la
 * media, porque las medias de una temporada llevan ruido. Se ajusta por
 * mínimos cuadrados prediciendo cada partido solo con los anteriores (nunca
 * con el propio ni con los que vinieron después). Ver
 * tests/partido.test.mjs y el comentario de PREDICCION_CALIBRADA.
 */
export const K_PREDICCION: Record<string, number> = {
  possession: 0.76, np_xg: 0.59, np_shots: 0.65, ppda: 0.68, defensive_distance: 0.61, directness: 0.15,
  deep_progressions: 0.69, deep_completions: 0.68, crosses_into_box: 0.62, counter_attacking_shots: 0.29,
  high_press_shots: 0.51, sp_xg: 0.36,
};

/**
 * La validación, el 15 de octubre de 2026: 1.342 partidos (2.684 lados) de
 * siete ligas y temporadas, cada uno predicho SOLO con los partidos jugados
 * antes (con cinco previos de cada equipo como mínimo), y el k de cada liga
 * ajustado con las otras seis, así que cada error es fuera de muestra.
 *
 * Por métrica, el error absoluto medio prediciendo con la media de la liga,
 * con la media del propio equipo y con el modelo. El modelo gana en todas,
 * pero no por igual: posesión −10 %, progresiones −8 %, PPDA −7 %, tiros −6 %,
 * altura de la defensa −5 %, xG −4 %. En contragolpes, juego directo y balón
 * parado apenas mejora (menos del 1,5 %): partido a partido manda el azar, y
 * la pantalla lo dice.
 */
export const PREDICCION_CALIBRADA = {
  fecha: "2026-10-15",
  partidos: 1342,
  ligas: ["Canadian Premier League 2024", "Canadian Premier League 2025", "Canadian Premier League 2026", "MLS Next Pro 2025", "OBOS-ligaen 2025", "Allsvenskan 2025", "Eerste Divisie 2025/2026"],
  errores: {
    possession: { liga: 0.07214, equipo: 0.06624, modelo: 0.05951 },
    np_xg: { liga: 0.5434, equipo: 0.5351, modelo: 0.5127 },
    np_shots: { liga: 4.049, equipo: 3.903, modelo: 3.671 },
    ppda: { liga: 3.427, equipo: 3.273, modelo: 3.04 },
    defensive_distance: { liga: 4.245, equipo: 4.187, modelo: 3.976 },
    directness: { liga: 0.05538, equipo: 0.05679, modelo: 0.05526 },
    deep_progressions: { liga: 10.9, equipo: 10.53, modelo: 9.682 },
    deep_completions: { liga: 2.381, equipo: 2.272, modelo: 2.199 },
    crosses_into_box: { liga: 3.58, equipo: 3.47, modelo: 3.367 },
    counter_attacking_shots: { liga: 0.8809, equipo: 0.9065, modelo: 0.877 },
    high_press_shots: { liga: 1.857, equipo: 1.853, modelo: 1.787 },
    sp_xg: { liga: 0.1966, equipo: 0.1967, modelo: 0.1942 },
  } as Record<string, { liga: number; equipo: number; modelo: number }>,
  formacion: { acierto: 0.553, ultima: 0.514, masUsada: 0.504, linea: 0.9 },
};

/** Cuánto mejora el modelo a la mejor referencia en esa métrica (0,10 = un 10 % menos de error). */
export function mejoraDelModelo(campo: string) {
  const e = PREDICCION_CALIBRADA.errores[campo];
  return e ? 1 - e.modelo / Math.min(e.liga, e.equipo) : Number.NaN;
}

/** Por debajo de esta mejora la métrica se marca como poco predecible partido a partido. */
export const MEJORA_MINIMA = 0.02;

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : Number.NaN);
const valor = (stats: Record<string, number>, campo: string) => {
  const v = stats[campo];
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
};

/** Lo que hace (propio) y lo que concede (lo que hacen sus rivales), de media, en esos partidos. */
export function tendencias(partidos: PartidoDeEquipo[], campos = METRICAS_PARTIDO.map((m) => m.campo)) {
  const propio: Record<string, number> = {};
  const concede: Record<string, number> = {};
  for (const campo of campos) {
    propio[campo] = media(partidos.map((p) => valor(p.propios, campo)).filter(Number.isFinite));
    concede[campo] = media(partidos.map((p) => valor(p.delRival, campo)).filter(Number.isFinite));
  }
  return { propio, concede, partidos: partidos.length };
}

/** La media de la liga por equipo y partido. */
export function mediasDeLiga(liga: LigaPartidos, campos = METRICAS_PARTIDO.map((m) => m.campo)) {
  const salida: Record<string, number> = {};
  for (const campo of campos) {
    salida[campo] = media(liga.partidos.flatMap((p) => [valor(p.local.stats, campo), valor(p.visita.stats, campo)]).filter(Number.isFinite));
  }
  return salida;
}

export const esperado = (mu: number, hace: number, concedeRival: number, k: number) => (
  Number.isFinite(mu) && Number.isFinite(hace) && Number.isFinite(concedeRival) ? mu + k * ((hace - mu) + (concedeRival - mu)) : Number.NaN
);

export type Prediccion = { metrica: MetricaPartido; a: number; b: number; mediaLiga: number };

/** Lo esperado de cada equipo en el cruce, métrica a métrica. La posesión suma 100 %. */
export function prediccionDelPartido(a: PartidoDeEquipo[], b: PartidoDeEquipo[], medias: Record<string, number>, metricas = METRICAS_PARTIDO): Prediccion[] {
  const ta = tendencias(a, metricas.map((m) => m.campo));
  const tb = tendencias(b, metricas.map((m) => m.campo));
  return metricas.map((metrica) => {
    const k = K_PREDICCION[metrica.campo] ?? 0.5;
    const mu = medias[metrica.campo];
    let va = esperado(mu, ta.propio[metrica.campo], tb.concede[metrica.campo], k);
    let vb = esperado(mu, tb.propio[metrica.campo], ta.concede[metrica.campo], k);
    if (metrica.campo === "possession" && Number.isFinite(va) && Number.isFinite(vb) && va + vb > 0) {
      const suma = va + vb;
      va /= suma;
      vb /= suma;
    }
    return { metrica, a: va, b: vb, mediaLiga: mu };
  });
}

// ---- Fuerte contra flojo ----------------------------------------------------------------

export type Dimension = { id: string; etiqueta: string; campo: string };

/** Lo que un equipo genera y su rival concede, en las mismas unidades. */
export const DIMENSIONES: Dimension[] = [
  { id: "juego", etiqueta: "Ataque en juego abierto (xG)", campo: "op_xg" },
  { id: "contragolpe", etiqueta: "Contraataque", campo: "counter_attacking_shots" },
  { id: "robo_alto", etiqueta: "Robo alto que acaba en tiro", campo: "high_press_shots" },
  { id: "parado", etiqueta: "Balón parado (xG)", campo: "sp_xg" },
  { id: "centros", etiqueta: "Centros al área", campo: "crosses_into_box" },
  { id: "progresion", etiqueta: "Llegar al último tercio", campo: "deep_progressions" },
  { id: "area", etiqueta: "Pisar el área con pase", campo: "deep_completions" },
  { id: "regate", etiqueta: "Regate", campo: "completed_dribbles" },
  { id: "lejos", etiqueta: "Tiro de fuera del área", campo: "op_shots_outside_box" },
  { id: "calidad", etiqueta: "Calidad de ocasión (xG por tiro)", campo: "np_xg_per_shot" },
];

export type PerfilDimension = { dimension: Dimension; zHace: number; zConcede: number; puestoHace: number; puestoConcede: number; equipos: number };

/**
 * Cada dimensión de cada equipo, en desviaciones típicas contra los equipos de
 * su liga: cuánto genera (zHace) y cuánto concede (zConcede, positivo = concede
 * más que la media, o sea, flojo ahí). Con el puesto en la liga (1 = el que más).
 */
export function perfilesDeDimension(liga: LigaPartidos, dimensiones = DIMENSIONES) {
  const equipos = equiposDeLiga(liga);
  const tend = new Map(equipos.map(({ equipo }) => [equipo, tendencias(partidosDe(liga, equipo), dimensiones.map((d) => d.campo))]));
  const salida = new Map<number, PerfilDimension[]>();
  for (const { equipo } of equipos) salida.set(equipo, []);
  for (const dimension of dimensiones) {
    const hace = equipos.map(({ equipo }) => tend.get(equipo)!.propio[dimension.campo]);
    const concede = equipos.map(({ equipo }) => tend.get(equipo)!.concede[dimension.campo]);
    const z = (xs: number[]) => {
      const validos = xs.filter(Number.isFinite);
      const m = media(validos);
      const sd = Math.sqrt(media(validos.map((x) => (x - m) ** 2)));
      return xs.map((x) => (Number.isFinite(x) && sd > 0 ? (x - m) / sd : Number.NaN));
    };
    const puesto = (xs: number[], i: number) => 1 + xs.filter((x) => Number.isFinite(x) && x > xs[i]).length;
    const zh = z(hace);
    const zc = z(concede);
    equipos.forEach(({ equipo }, i) => {
      salida.get(equipo)!.push({ dimension, zHace: zh[i], zConcede: zc[i], puestoHace: puesto(hace, i), puestoConcede: puesto(concede, i), equipos: equipos.length });
    });
  }
  return salida;
}

export type Ventaja = { dimension: Dimension; fuerza: number; zHace: number; zConcedeRival: number; puestoHace: number; puestoConcedeRival: number; equipos: number };

/**
 * Dónde lo que A hace bien coincide con lo que B concede: la suma de los dos z,
 * solo cuando los dos son positivos (A por encima de la media generando y B
 * concediendo). Ordenadas de la más clara a la menos.
 */
export function ventajas(a: PerfilDimension[], b: PerfilDimension[], cuantas = 3): Ventaja[] {
  return a.flatMap((pa) => {
    const pb = b.find((x) => x.dimension.id === pa.dimension.id);
    if (!pb || !(pa.zHace > 0.25) || !(pb.zConcede > 0.25)) return [];
    return [{ dimension: pa.dimension, fuerza: pa.zHace + pb.zConcede, zHace: pa.zHace, zConcedeRival: pb.zConcede, puestoHace: pa.puestoHace, puestoConcedeRival: pb.puestoConcede, equipos: pa.equipos }];
  }).sort((x, y) => y.fuerza - x.fuerza).slice(0, cuantas);
}

/** Lo más fuerte y lo más flojo de un equipo en su liga: genera mucho / concede poco, y al revés. */
export function fuertesYFlojos(perfil: PerfilDimension[], cuantos = 3) {
  const lecturas = perfil.flatMap((p) => [
    { dimension: p.dimension, lado: "hace" as const, z: p.zHace, puesto: p.puestoHace, equipos: p.equipos },
    // Conceder poco es fuerza: se cambia el signo para ordenar igual.
    { dimension: p.dimension, lado: "concede" as const, z: -p.zConcede, puesto: p.equipos + 1 - p.puestoConcede, equipos: p.equipos },
  ]).filter((l) => Number.isFinite(l.z));
  const ordenadas = [...lecturas].sort((x, y) => y.z - x.z);
  return {
    fuertes: ordenadas.filter((l) => l.z >= 0.75).slice(0, cuantos),
    flojos: ordenadas.reverse().filter((l) => l.z <= -0.75).slice(0, cuantos),
  };
}

// ---- Contra qué dibujo ----------------------------------------------------------------------

/** Cómo le va contra rivales con línea de 3 y con línea de 4: partidos, puntos y xG a favor y en contra por partido. */
export function rendimientoPorLinea(partidos: PartidoDeEquipo[]) {
  const grupos = { 3: [] as PartidoDeEquipo[], 4: [] as PartidoDeEquipo[] };
  for (const p of partidos) {
    if (p.onceRival.length < 10) continue;
    grupos[lineaDefensiva(estructuraDe(p.onceRival))].push(p);
  }
  const resumen = (lista: PartidoDeEquipo[]) => ({
    partidos: lista.length,
    puntos: lista.reduce((s, p) => s + (p.gf > p.gc ? 3 : p.gf === p.gc ? 1 : 0), 0),
    xg: media(lista.map((p) => valor(p.propios, "np_xg")).filter(Number.isFinite)),
    xgContra: media(lista.map((p) => valor(p.delRival, "np_xg")).filter(Number.isFinite)),
  });
  return { 3: resumen(grupos[3]), 4: resumen(grupos[4]) };
}

/** Los partidos entre los dos en la temporada, del más reciente al más viejo. */
export function enfrentamientos(a: PartidoDeEquipo[], rivalId: number) {
  return a.filter((p) => p.rivalId === rivalId).reverse();
}

// ---- Cruces de estilo (StatsBomb y SkillCorner) --------------------------------------------

/** Lo mínimo de un perfil de estilo que hace falta aquí (ver lib/estiloEquipo: PerfilEquipo). */
type PerfilDeEstilo = { valores: Record<string, { z: number }> };

export type CruceDeEstilo = {
  id: "espalda" | "presion_salida" | "transicion" | "contrapresion";
  /** Las métricas que lo sostienen, con su z (contra todos los equipos profesionales). */
  de: Array<{ metrica: string; z: number; equipo: "a" | "b" }>;
  fuerza: number;
};

const UMBRAL_CRUCE = 0.5;

/**
 * Cuando el estilo de A le hace daño justo a lo que hace B. Reglas escritas a
 * mano y a la vista, cada una con las métricas que la disparan:
 *  - espalda: A ataca la espalda (rupturas de SkillCorner o juego directo) y
 *    B defiende alto.
 *  - presion_salida: A presiona arriba (PPDA) y B sale en corto desde atrás.
 *  - transicion: A corre al contragolpe y B se queda con la pelota.
 *  - contrapresion: A contrapresiona al perderla y B la pierde bajo presión
 *    (retención bajo presión de SkillCorner).
 */
export function crucesDeEstilo(a: PerfilDeEstilo, b: PerfilDeEstilo): CruceDeEstilo[] {
  const z = (perfil: PerfilDeEstilo, id: string) => {
    const v = perfil.valores[id]?.z;
    return typeof v === "number" && Number.isFinite(v) ? v : Number.NaN;
  };
  const alto = (v: number) => v >= UMBRAL_CRUCE;
  const salida: CruceDeEstilo[] = [];
  const ataqueEspalda = Number.isFinite(z(a, "sc_rupturas")) ? { metrica: "sc_rupturas", z: z(a, "sc_rupturas") } : { metrica: "directo", z: z(a, "directo") };
  if (alto(ataqueEspalda.z) && alto(z(b, "altura"))) {
    salida.push({ id: "espalda", de: [{ ...ataqueEspalda, equipo: "a" }, { metrica: "altura", z: z(b, "altura"), equipo: "b" }], fuerza: ataqueEspalda.z + z(b, "altura") });
  }
  if (alto(z(a, "ppda")) && alto(z(b, "salida_corta"))) {
    const de: CruceDeEstilo["de"] = [{ metrica: "ppda", z: z(a, "ppda"), equipo: "a" }, { metrica: "salida_corta", z: z(b, "salida_corta"), equipo: "b" }];
    const retiene = z(b, "sc_retencion");
    if (retiene <= -UMBRAL_CRUCE) de.push({ metrica: "sc_retencion", z: retiene, equipo: "b" });
    salida.push({ id: "presion_salida", de, fuerza: z(a, "ppda") + z(b, "salida_corta") + (retiene <= -UMBRAL_CRUCE ? -retiene : 0) });
  }
  if (alto(z(a, "contragolpe")) && alto(z(b, "posesion"))) {
    salida.push({ id: "transicion", de: [{ metrica: "contragolpe", z: z(a, "contragolpe"), equipo: "a" }, { metrica: "posesion", z: z(b, "posesion"), equipo: "b" }], fuerza: z(a, "contragolpe") + z(b, "posesion") });
  }
  if (alto(z(a, "contrapresion")) && z(b, "sc_retencion") <= -UMBRAL_CRUCE) {
    salida.push({ id: "contrapresion", de: [{ metrica: "contrapresion", z: z(a, "contrapresion"), equipo: "a" }, { metrica: "sc_retencion", z: z(b, "sc_retencion"), equipo: "b" }], fuerza: z(a, "contrapresion") - z(b, "sc_retencion") });
  }
  return salida.sort((x, y) => y.fuerza - x.fuerza);
}

/**
 * Si cambió de dibujo en sus últimos partidos: los tres últimos con el mismo
 * dibujo (o la misma línea, de 3 o de 4) y distinto del que más usó antes.
 */
export function cambioDeDibujo(partidos: PartidoDeEquipo[], ultimos = 3) {
  const conDibujo = partidos.filter((p) => p.formacion);
  if (conDibujo.length < ultimos + 5) return null;
  const recientes = conDibujo.slice(-ultimos);
  const antes = conDibujo.slice(0, -ultimos);
  const masUsada = (lista: PartidoDeEquipo[], clave: (p: PartidoDeEquipo) => string) => {
    const cuenta = new Map<string, number>();
    for (const p of lista) cuenta.set(clave(p), (cuenta.get(clave(p)) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  const linea = (p: PartidoDeEquipo) => (p.once.length >= 10 ? String(lineaDefensiva(estructuraDe(p.once))) : "");
  const dibujoAhora = recientes[0].formacion!;
  const lineaAhora = linea(recientes[0]);
  const mismoDibujo = recientes.every((p) => p.formacion === dibujoAhora);
  const mismaLinea = lineaAhora && recientes.every((p) => linea(p) === lineaAhora);
  const dibujoAntes = masUsada(antes, (p) => p.formacion!);
  const lineaAntes = masUsada(antes.filter((p) => linea(p)), linea);
  if (mismaLinea && lineaAntes && lineaAhora !== lineaAntes) {
    return { tipo: "linea" as const, antes: Number(lineaAntes) as 3 | 4, ahora: Number(lineaAhora) as 3 | 4, dibujoAhora, partidos: ultimos };
  }
  if (mismoDibujo && dibujoAntes && dibujoAhora !== dibujoAntes) {
    return { tipo: "dibujo" as const, antes: dibujoAntes, ahora: dibujoAhora, partidos: ultimos };
  }
  return null;
}
