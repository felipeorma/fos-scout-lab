/**
 * Ficha ampliada: la página 2 del dossier de Julio Costa con nuestros datos.
 *
 * Dos partes. Las familias compuestas ("Build play", "Link up play"…) salen
 * de las estadísticas de temporada de StatsBomb: cada una es la media de las
 * desviaciones típicas de tres o cuatro métricas contra los jugadores de la
 * misma posición en la base cargada. Los mapas salen de los eventos partido a
 * partido, que el puente baja y recorta.
 *
 * Diferencias con el dossier, dichas: StatsBomb no publica xG a balón parado
 * por jugador, así que "Set Play Finishing" pasa a "Juego aéreo", y
 * "Finishing Crosses" se mide con el volumen y la precisión de los centros.
 */

import { cohortOf, detectCoreColumns, headersOf, numeric, peerCohort, positionColumnOf, type DataRow } from "./scouting.ts";

export type Compuesta = { id: string; etiqueta: string; corta: string; columnas: string[] };

// Ninguna columna se repite entre familias: si una misma métrica entrara en
// dos, las dos familias se moverían juntas y el radar diría dos veces lo mismo.
export const COMPUESTAS: Compuesta[] = [
  { id: "construccion", etiqueta: "Construcción", corta: "Construcción", columnas: ["OP passes (SB)", "Passing % (SB)", "Pressured pass % (SB)", "OP xG buildup (SB)"] },
  { id: "asociacion", etiqueta: "Asociación", corta: "Asociación", columnas: ["OP F3 passes (SB)", "Pass OBV (SB)"] },
  { id: "progresion", etiqueta: "Progresión", corta: "Progresión", columnas: ["Deep progressions (SB)", "Carries (SB)", "Dribble carry OBV (SB)", "Forward pass % (SB)"] },
  { id: "creacion_juego", etiqueta: "Creación en juego", corta: "Creación juego", columnas: ["OP key passes (SB)", "OP xG assisted (SB)", "OP passes into box (SB)", "Through balls (SB)"] },
  { id: "creacion_parado", etiqueta: "Creación a balón parado", corta: "Creación parado", columnas: ["SP key passes (SB)", "SP xG assisted (SB)", "SP passes into box (SB)"] },
  { id: "amenaza", etiqueta: "Amenaza", corta: "Amenaza", columnas: ["Touches in box (SB)", "OP xG chain (SB)", "Deep completions (SB)"] },
  { id: "finalizacion", etiqueta: "Finalización", corta: "Finalización", columnas: ["xG (SB)", "NP shots (SB)", "xG per shot (SB)", "Shot OBV (SB)"] },
  { id: "aereo", etiqueta: "Juego aéreo", corta: "Aéreo", columnas: ["Aerial wins (SB)", "Aerial win % (SB)"] },
  { id: "centros", etiqueta: "Centros", corta: "Centros", columnas: ["Crosses (SB)", "Cross completion % (SB)", "Box cross % (SB)"] },
  { id: "defensa_rival", etiqueta: "Defensa en campo rival", corta: "Def. campo rival", columnas: ["Opp half pressures (SB)", "Opp half ball recoveries (SB)", "Opp half counterpressures (SB)"] },
  { id: "defensa_propia", etiqueta: "Defensa en campo propio", corta: "Def. campo propio", columnas: ["PAdj tackles interceptions (SB)", "Defensive action regains (SB)", "Tackle dribbled past % (SB)"] },
  { id: "defensa_area", etiqueta: "Defensa del área", corta: "Def. del área", columnas: ["PAdj clearances (SB)", "Blocks per shot (SB)"] },
  { id: "defensa_juego", etiqueta: "Defensa en juego abierto", corta: "Def. juego abierto", columnas: ["Defensive action OBV (SB)", "Pressure regains (SB)", "Counterpressure regains (SB)"] },
];

export type ValorCompuesto = { z: number; percentil: number };

export type GrupoCompuesto = {
  /** Filas del grupo de referencia: misma posición, con el mínimo de minutos. */
  indices: number[];
  /** Por fila, el z de cada familia. El objetivo va aunque no llegue a los minutos. */
  valores: Map<number, Record<string, ValorCompuesto>>;
};

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Las familias de todos los jugadores de la posición del objetivo.
 *
 * Cada métrica se estandariza contra ese grupo; la familia es la media de las
 * que el jugador tenga (al menos la mitad: con una sola de cuatro, el número
 * sería esa métrica y no la familia). El percentil es contra el mismo grupo.
 */
export function familiasCompuestas(rows: DataRow[], cohorte: string, minutosMin: number, objetivo = -1): GrupoCompuesto {
  const cabeceras = headersOf(rows);
  const core = detectCoreColumns(cabeceras);
  const columnaPosicion = positionColumnOf(cabeceras);
  const grupo = peerCohort(cohorte);
  const indices = rows
    .map((_, i) => i)
    .filter((i) => cohortOf(columnaPosicion ? rows[i][columnaPosicion] : "") === grupo
      && (minutosMin <= 0 || numeric(rows[i][core.minutes]) >= minutosMin));

  const escalas = new Map<string, { m: number; sd: number }>();
  for (const columna of new Set(COMPUESTAS.flatMap((c) => c.columnas))) {
    if (!cabeceras.includes(columna)) continue;
    const valores = indices.map((i) => numeric(rows[i][columna])).filter(Number.isFinite);
    if (valores.length < 5) continue;
    const m = media(valores);
    const sd = Math.sqrt(media(valores.map((v) => (v - m) ** 2)));
    if (sd > 0) escalas.set(columna, { m, sd });
  }

  const zDe = (i: number): Record<string, number> => {
    const salida: Record<string, number> = {};
    for (const comp of COMPUESTAS) {
      const zs = comp.columnas.map((columna) => {
        const escala = escalas.get(columna);
        const v = numeric(rows[i]?.[columna]);
        return escala && Number.isFinite(v) ? (v - escala.m) / escala.sd : Number.NaN;
      }).filter(Number.isFinite);
      if (zs.length >= Math.ceil(comp.columnas.length / 2)) salida[comp.id] = media(zs);
    }
    return salida;
  };

  const crudos = new Map<number, Record<string, number>>();
  for (const i of indices) crudos.set(i, zDe(i));
  if (objetivo >= 0 && !crudos.has(objetivo)) crudos.set(objetivo, zDe(objetivo));

  const ordenados = new Map(COMPUESTAS.map((comp) => [
    comp.id,
    indices.map((i) => crudos.get(i)![comp.id]).filter(Number.isFinite).sort((a, b) => a - b),
  ]));
  const valores = new Map<number, Record<string, ValorCompuesto>>();
  for (const [i, zs] of crudos) {
    const fila: Record<string, ValorCompuesto> = {};
    for (const [id, z] of Object.entries(zs)) {
      const lista = ordenados.get(id)!;
      const debajo = lista.filter((v) => v < z).length;
      const iguales = lista.filter((v) => v === z).length;
      fila[id] = { z, percentil: lista.length ? Math.round(((debajo + iguales / 2) / lista.length) * 100) : 0 };
    }
    valores.set(i, fila);
  }
  return { indices, valores };
}

// ---- Eventos --------------------------------------------------------------

/** Un evento recortado por el puente. Coordenadas de StatsBomb: 120 × 80, atacando hacia x = 120. */
export type EventoSB = {
  t: string;
  j: string;
  l?: [number, number, number?] | null;
  e?: [number, number, number?] | null;
  pp?: string | null;
  xg?: number | null;
  o?: string | null;
  st?: string | null;
  pt?: string | null;
  cr?: boolean;
  sa?: boolean;
  ga?: boolean;
  dt?: string | null;
  aw?: boolean;
  // Solo en las recepciones ("Ball Receipt*"): el pase que se la da.
  /** Recibió presionado. */
  up?: boolean;
  /** Desde dónde salió el pase. */
  de?: [number, number, number?] | null;
  /** Quién se la dio. */
  dj?: string | null;
  /** Altura del pase: Ground Pass, Low Pass, High Pass. */
  h?: string | null;
  /** Técnica del pase: Through Ball, Inswinging… */
  tq?: string | null;
  /** Cambio de orientación. */
  sw?: boolean;
};

export type EventosJugador = {
  jugador: string;
  partidos: number;
  partidosEquipo: number;
  dorsal: number | null;
  /** Código de posición → minutos. */
  posiciones: Record<string, number>;
  eventos: EventoSB[];
};

/** Las jugadas a balón parado; lo que no es esto, es juego abierto. */
const TIPOS_PARADO = new Set(["Corner", "Free Kick", "Throw-in", "Goal Kick", "Kick Off"]);
export const esPaseEnJuego = (e: EventoSB) => e.t === "Pass" && !(e.pt && TIPOS_PARADO.has(e.pt));
export const esJuegoAbierto = (e: EventoSB) => !/Corner|Free Kick|Throw In|Goal Kick|Kick Off/i.test(e.pp ?? "");

export type Punto = [number, number];

// ---- Recepciones -----------------------------------------------------------

export type AgrupacionRecepcion = "tipo" | "presion" | "altura" | "direccion";

/**
 * Las formas de agrupar dónde recibe. Cada grupo lleva su color: el mismo en
 * el mapa, en la leyenda y en las barras, para leer las tres cosas de un vistazo.
 */
export const AGRUPACIONES_RECEPCION: Array<{
  id: AgrupacionRecepcion;
  etiqueta: string;
  grupos: Array<{ id: string; etiqueta: string; color: string }>;
}> = [
  {
    id: "tipo", etiqueta: "Tipo de pase", grupos: [
      { id: "al_pie", etiqueta: "Al pie", color: "#2f9e62" },
      { id: "por_alto", etiqueta: "Por alto", color: "#3b7dd8" },
      { id: "al_espacio", etiqueta: "Al espacio", color: "#7b61d1" },
      { id: "cambio", etiqueta: "Cambio de orientación", color: "#1f9aa6" },
      { id: "centro", etiqueta: "Centro", color: "#e08a2e" },
      { id: "parado", etiqueta: "Balón parado", color: "#8a8f98" },
    ],
  },
  {
    id: "presion", etiqueta: "Presión", grupos: [
      { id: "libre", etiqueta: "Sin presión", color: "#2f9e62" },
      { id: "presionado", etiqueta: "Presionado", color: "#d0503f" },
    ],
  },
  {
    id: "altura", etiqueta: "Altura del pase", grupos: [
      { id: "raso", etiqueta: "Raso", color: "#2f9e62" },
      { id: "media", etiqueta: "A media altura", color: "#e08a2e" },
      { id: "alto", etiqueta: "Por alto", color: "#3b7dd8" },
    ],
  },
  {
    id: "direccion", etiqueta: "Dirección del pase", grupos: [
      { id: "adelante", etiqueta: "Pase adelante", color: "#2f9e62" },
      { id: "horizontal", etiqueta: "Pase lateral", color: "#e08a2e" },
      { id: "atras", etiqueta: "Pase atrás", color: "#d0503f" },
    ],
  },
];

export const agrupacionRecepcion = (id: unknown) => AGRUPACIONES_RECEPCION.find((a) => a.id === id) ?? AGRUPACIONES_RECEPCION[0];

export const esRecepcion = (e: EventoSB) => e.t === "Ball Receipt*" && Boolean(e.l);

/**
 * El grupo de una recepción. En "tipo" manda lo más específico: un saque de
 * banda por alto es balón parado, un centro raso es centro y un cambio de
 * orientación por alto es cambio; solo lo que no es nada de eso se reparte
 * entre al pie y por alto. Sin el pase de origen no hay grupo.
 */
export function grupoDeRecepcion(e: EventoSB, por: AgrupacionRecepcion): string | null {
  if (por === "presion") return e.up ? "presionado" : "libre";
  if (!e.de && !e.h && !e.pt) return null;
  if (por === "altura") return e.h === "High Pass" ? "alto" : e.h === "Low Pass" ? "media" : e.h === "Ground Pass" ? "raso" : null;
  if (por === "direccion") {
    if (!e.de || !e.l) return null;
    const dx = e.l[0] - e.de[0], dy = Math.abs(e.l[1] - e.de[1]);
    const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
    return angulo < 45 ? "adelante" : angulo > 135 ? "atras" : "horizontal";
  }
  if (e.pt && TIPOS_PARADO.has(e.pt)) return "parado";
  if (e.cr) return "centro";
  if (e.sw) return "cambio";
  if (e.tq === "Through Ball") return "al_espacio";
  return e.h === "High Pass" ? "por_alto" : "al_pie";
}

const aPorteria = (p: [number, number, number?]) => Math.hypot(120 - p[0], 40 - p[1]);

/**
 * Lo que se cuenta de sus recepciones. Progresiva: el pase le deja al menos un
 * 25 % más cerca de la portería rival que desde donde salió.
 */
export function resumenRecepciones(eventos: EventoSB[], por: AgrupacionRecepcion) {
  const lista = eventos.filter(esRecepcion);
  const conteo = new Map<string, number>();
  const pasadores = new Map<string, number>();
  let fallidas = 0, presionadas = 0, ultimoTercio = 0, area = 0, progresivas = 0;
  for (const e of lista) {
    const [x, y] = e.l!;
    if (e.o === "Incomplete") fallidas += 1;
    if (e.up) presionadas += 1;
    if (x >= 80) ultimoTercio += 1;
    if (x >= 102 && y >= 18 && y <= 62) area += 1;
    if (e.de && aPorteria(e.l!) <= 0.75 * aPorteria(e.de)) progresivas += 1;
    const grupo = grupoDeRecepcion(e, por);
    if (grupo) conteo.set(grupo, (conteo.get(grupo) ?? 0) + 1);
    if (e.dj) pasadores.set(e.dj, (pasadores.get(e.dj) ?? 0) + 1);
  }
  return {
    lista,
    total: lista.length,
    fallidas,
    presionadas,
    ultimoTercio,
    area,
    progresivas,
    grupos: agrupacionRecepcion(por).grupos.map((g) => ({ ...g, n: conteo.get(g.id) ?? 0 })),
    pasadores: [...pasadores.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, n })),
    origenes: lista.filter((e) => e.de).map((e) => [e.de![0], e.de![1]] as Punto),
  };
}

/**
 * Cuenta por zonas del campo en vertical: columnas a lo ancho, filas a lo
 * largo, la fila 0 junto a la portería rival. Es la rejilla de "Pass Starts",
 * "Pass Ending" y "Defending" del dossier.
 */
export function rejilla(puntos: Punto[], columnas = 5, filas = 6) {
  const conteos = Array.from({ length: filas }, () => Array(columnas).fill(0) as number[]);
  let total = 0;
  for (const [x, y] of puntos) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fila = Math.min(filas - 1, Math.max(0, Math.floor(((120 - x) / 120) * filas)));
    const columna = Math.min(columnas - 1, Math.max(0, Math.floor((y / 80) * columnas)));
    conteos[fila][columna] += 1;
    total += 1;
  }
  return { conteos, total, columnas, filas };
}

/** Mapa de calor: histograma fino suavizado con un núcleo 3 × 3, normalizado a 1. */
export function densidad(puntos: Punto[], columnas = 16, filas = 24) {
  const base = rejilla(puntos, columnas, filas).conteos;
  const suave = base.map((fila, f) => fila.map((_, c) => {
    let suma = 0, peso = 0;
    for (let df = -1; df <= 1; df += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const w = df === 0 && dc === 0 ? 4 : df === 0 || dc === 0 ? 2 : 1;
        const valor = base[f + df]?.[c + dc];
        if (valor === undefined) continue;
        suma += valor * w; peso += w;
      }
    }
    return suma / peso;
  }));
  const max = Math.max(0, ...suave.flat());
  return { celdas: suave.map((fila) => fila.map((v) => (max ? v / max : 0))), columnas, filas };
}

/** Dónde se dibuja cada puesto en el campo vertical (unidades de StatsBomb, ataque hacia arriba). */
export const POSICION_EN_CAMPO: Record<string, Punto> = {
  GK: [40, 113], RB: [68, 92], RCB: [52, 100], CB: [40, 100], LCB: [28, 100], LB: [12, 92],
  RWB: [72, 80], LWB: [8, 80], RDMF: [52, 84], DMF: [40, 84], LDMF: [28, 84],
  RCMF: [55, 71], CMF: [40, 71], LCMF: [25, 71], RM: [70, 64], LM: [10, 64],
  RAMF: [60, 52], AMF: [40, 54], LAMF: [20, 52], RW: [70, 40], LW: [10, 40],
  RCF: [50, 28], CF: [40, 26], LCF: [30, 28], SS: [40, 40],
};

/** StatsBomb (x a lo largo, y a lo ancho) → campo vertical con el ataque hacia arriba. */
export const aVertical = ([x, y]: [number, number, number?]): Punto => [y, 120 - x];

/**
 * Un enjambre en una fila: cada punto se coloca en su x y se desplaza en y lo
 * justo para no pisar a los ya colocados. Determinista: el mismo grupo da
 * siempre el mismo dibujo, que en un informe impreso importa.
 */
export function enjambre(xs: number[], radio: number) {
  const orden = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const colocados: Array<{ x: number; y: number }> = [];
  const ys = new Array(xs.length).fill(0);
  for (const { x, i } of orden) {
    let y = 0;
    for (let paso = 0; paso < 60; paso += 1) {
      const candidato = paso === 0 ? 0 : (paso % 2 ? 1 : -1) * Math.ceil(paso / 2) * radio * 1.9;
      if (colocados.every((o) => Math.abs(o.x - x) >= radio * 1.9 || Math.abs(o.y - candidato) >= radio * 1.9)) { y = candidato; break; }
    }
    colocados.push({ x, y });
    ys[i] = y;
  }
  return ys;
}

/** De la columna "Data sources", la competición y temporada de StatsBomb del jugador. */
export function fuenteStatsbomb(fuentes: unknown): { liga: string; temporada: string } | null {
  for (const parte of String(fuentes ?? "").split(",")) {
    const limpia = parte.trim();
    if (!limpia.startsWith("StatsBomb · ")) continue;
    const resto = limpia.slice("StatsBomb · ".length).trim();
    const corte = resto.lastIndexOf(" ");
    if (corte < 0) continue;
    return { liga: resto.slice(0, corte), temporada: resto.slice(corte + 1) };
  }
  return null;
}
