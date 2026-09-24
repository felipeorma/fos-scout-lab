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

export type Compuesta = {
  id: string; etiqueta: string; corta: string; columnas: string[];
  /** Las de SkillCorner solo salen si la base tiene su capa enlazada. */
  fuente?: "statsbomb" | "skillcorner";
};

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
  // SkillCorner: lo que StatsBomb no ve. Solo con su capa enlazada a la base;
  // un jugador sin ella no tiene estas familias, no un cero.
  { id: "fisico", etiqueta: "Físico", corta: "Físico", fuente: "skillcorner",
    columnas: ["PSV-99 (SC)", "Meters per minute (SC)", "HSR distance (SC)", "Sprints (SC)", "Explosive accels to sprint (SC)"] },
  { id: "movimiento_sc", etiqueta: "Movimiento sin balón", corta: "Mov. sin balón", fuente: "skillcorner",
    columnas: ["Off ball runs P30 (SC)", "Runs in behind P30 (SC)", "Dangerous runs behind P30 (SC)", "Runs received P30 (SC)", "Support runs P30 (SC)"] },
  { id: "bajo_presion", etiqueta: "Juego bajo presión", corta: "Bajo presión", fuente: "skillcorner",
    columnas: ["Retention under pressure % (SC)", "Receptions under pressure P30 (SC)", "Progressive under pressure P30 (SC)", "Escaped pressure P30 (SC)", "Dangerous under pressure P30 (SC)"] },
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

// ---- Roles en la secuencia -------------------------------------------------

/**
 * Los roles que el puente asigna a cada intervención en una secuencia de juego
 * abierto (ver _rol_de_intervencion en scripts/bg-server.py), en el orden en
 * que se leen. `perfil` es cómo se llama al jugador cuando ese rol es el que
 * más destaca.
 */
export const ROLES_SECUENCIA: Array<{ id: string; etiqueta: string; perfil: string; descripcion: string }> = [
  { id: "iniciador", etiqueta: "Iniciador", perfil: "Iniciador", descripcion: "Arranca la secuencia." },
  { id: "control", etiqueta: "Control", perfil: "Organizador", descripcion: "Recibe y la juega de lado o atrás." },
  { id: "enlace", etiqueta: "Enlace", perfil: "Enlace", descripcion: "Juega hacia delante sin llegar a progresar." },
  { id: "progresor", etiqueta: "Progresor", perfil: "Progresor", descripcion: "Pase completado que acerca un 25 % a la portería." },
  { id: "conductor", etiqueta: "Conductor", perfil: "Conductor", descripcion: "Conducción que gana campo o regate completado." },
  { id: "vertical", etiqueta: "Vertical", perfil: "Lanzador", descripcion: "Pase largo hacia delante." },
  { id: "apoyo", etiqueta: "Apoyo", perfil: "Apoyo", descripcion: "Recibe un pase que le llega de lado o de atrás." },
  { id: "remate", etiqueta: "Remate", perfil: "Rematador", descripcion: "Tira o recibe en el área." },
];

/** Mínimo de intervenciones para entrar en el grupo: con menos, los porcentajes bailan. */
export const MIN_INTERVENCIONES = 60;

const normalizar = (nombre: unknown) => String(nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export type RolFrenteAlGrupo = { id: string; etiqueta: string; parte: number; percentil: number; n: number };

/**
 * Los roles del jugador frente a su grupo de posición: qué parte de sus
 * intervenciones es cada rol y en qué percentil queda esa parte entre los
 * del grupo con al menos MIN_INTERVENCIONES. El perfil es el rol con mayor
 * percentil entre los que pesan al menos un 5 %; si el segundo está a menos
 * de 8 puntos, van los dos.
 */
export function rolesFrenteAlGrupo(
  rows: DataRow[],
  indicesGrupo: number[],
  objetivo: number,
  jugadores: Array<{ jugador: string; equipo: string; intervenciones: number; roles: Record<string, number> }>,
) {
  const porNombre = new Map<string, (typeof jugadores)[number]>();
  for (const j of jugadores) {
    const clave = normalizar(j.jugador);
    const previo = porNombre.get(clave);
    // Homónimos o dos equipos en la temporada: se queda el de más intervenciones.
    if (!previo || previo.intervenciones < j.intervenciones) porNombre.set(clave, j);
  }
  const partes = (i: number) => {
    const j = porNombre.get(normalizar(rows[i]?.Player));
    if (!j || !j.intervenciones) return null;
    return { total: j.intervenciones, parte: (id: string) => (j.roles[id] ?? 0) / j.intervenciones };
  };
  const delObjetivo = partes(objetivo);
  if (!delObjetivo) return null;
  const grupo = [...new Set([...indicesGrupo, objetivo])]
    .map((i) => ({ i, p: partes(i) }))
    .filter((x): x is { i: number; p: NonNullable<ReturnType<typeof partes>> } => Boolean(x.p) && (x.i === objetivo || x.p!.total >= MIN_INTERVENCIONES));
  const filas: RolFrenteAlGrupo[] = ROLES_SECUENCIA.map((rol) => {
    const suya = delObjetivo.parte(rol.id);
    const todas = grupo.map((x) => x.p.parte(rol.id));
    const debajo = todas.filter((v) => v < suya).length;
    const iguales = todas.filter((v) => v === suya).length;
    return {
      id: rol.id, etiqueta: rol.etiqueta, parte: suya,
      percentil: todas.length ? Math.round(((debajo + iguales / 2) / todas.length) * 100) : 0,
      n: Math.round(suya * delObjetivo.total),
    };
  });
  const candidatos = filas.filter((f) => f.parte >= 0.05).sort((a, b) => b.percentil - a.percentil);
  const nombre = (id: string) => ROLES_SECUENCIA.find((r) => r.id === id)!.perfil;
  const perfil = !candidatos.length ? "" : candidatos[1] && candidatos[0].percentil - candidatos[1].percentil < 8
    ? `${nombre(candidatos[0].id)} · ${nombre(candidatos[1].id)}`
    : nombre(candidatos[0].id);
  return { filas, perfil, intervenciones: delObjetivo.total, grupo: grupo.length };
}

// ---- Etiquetas de los gráficos de puntos ------------------------------------

/** Un rectángulo en unidades del SVG. */
export type Caja = { x0: number; y0: number; x1: number; y1: number };

const solapan = (a: Caja, b: Caja, holgura = 1) => a.x0 < b.x1 + holgura && b.x0 < a.x1 + holgura && a.y0 < b.y1 + holgura && b.y0 < a.y1 + holgura;

/** Ancho aproximado de un texto: Barlow ronda medio cuerpo por letra; se estima por arriba. */
export const anchoDeTexto = (texto: string, tamano: number) => texto.length * tamano * 0.56;

export type PuntoConEtiqueta = {
  id: number;
  x: number;
  y: number;
  /** Radio del punto: la etiqueta se separa de él. */
  r: number;
  texto: string;
  tamano: number;
  /** Se colocan primero las de más prioridad; las demás, si queda sitio. */
  prioridad: number;
  /** Sale aunque no haya un hueco limpio (el jugador del informe y sus parecidos). */
  forzar?: boolean;
};

export type EtiquetaColocada = {
  id: number;
  x: number;
  y: number;
  ancla: "start" | "middle" | "end";
  /** Quedó lejos de su punto: se dibuja una línea guía hasta él. */
  guia: boolean;
};

/**
 * Coloca los nombres junto a sus puntos sin que se pisen. Prueba ocho sitios
 * alrededor de cada punto —derecha, izquierda, arriba, abajo y diagonales— y
 * se queda con el primero que cabe en el gráfico, no toca otra etiqueta y, a
 * poder ser, no tapa otro punto. Si no hay hueco al lado, prueba un anillo
 * más alejado con línea guía; una etiqueta forzada (el jugador del informe y
 * sus parecidos) sigue alejándose hasta encontrar sitio, y una sin forzar que
 * tampoco cabe ahí se omite. Determinista: el mismo gráfico sale igual cada vez.
 */
export function colocarEtiquetas(puntos: PuntoConEtiqueta[], limites: Caja, obstaculos: Array<{ x: number; y: number; r: number }> = []): EtiquetaColocada[] {
  const ocupadas: Caja[] = [];
  const colocadas: EtiquetaColocada[] = [];
  const orden = [...puntos].sort((a, b) => b.prioridad - a.prioridad || a.id - b.id);
  for (const p of orden) {
    const ancho = anchoDeTexto(p.texto, p.tamano), alto = p.tamano;
    type Candidato = Omit<EtiquetaColocada, "id">;
    const anillo = (k: number): Candidato[] => {
      const d = p.r + 2.5 + k * (alto + 3), dd = d * 0.75, guia = k > 0;
      return [
        { x: p.x + d, y: p.y + alto * 0.35, ancla: "start", guia },
        { x: p.x - d, y: p.y + alto * 0.35, ancla: "end", guia },
        { x: p.x, y: p.y - d, ancla: "middle", guia },
        { x: p.x, y: p.y + d + alto * 0.8, ancla: "middle", guia },
        { x: p.x + dd, y: p.y - dd, ancla: "start", guia },
        { x: p.x - dd, y: p.y - dd, ancla: "end", guia },
        { x: p.x + dd, y: p.y + dd + alto * 0.7, ancla: "start", guia },
        { x: p.x - dd, y: p.y + dd + alto * 0.7, ancla: "end", guia },
      ];
    };
    const caja = (c: Candidato): Caja => {
      const x0 = c.ancla === "start" ? c.x : c.ancla === "end" ? c.x - ancho : c.x - ancho / 2;
      return { x0, x1: x0 + ancho, y0: c.y - alto * 0.8, y1: c.y + alto * 0.2 };
    };
    const dentro = (k: Caja) => k.x0 >= limites.x0 && k.x1 <= limites.x1 && k.y0 >= limites.y0 && k.y1 <= limites.y1;
    const tapa = (k: Caja, q: { x: number; y: number; r: number }) => k.x0 < q.x + q.r && q.x - q.r < k.x1 && k.y0 < q.y + q.r && q.y - q.r < k.y1;
    const tapaPunto = (k: Caja) => puntos.some((q) => q.id !== p.id && tapa(k, q)) || obstaculos.some((q) => tapa(k, q));
    let elegido: Candidato | undefined;
    for (let k = 0; k < (p.forzar ? 8 : 2) && !elegido; k += 1) {
      const libres = anillo(k).filter((c) => { const kj = caja(c); return dentro(kj) && !ocupadas.some((o) => solapan(o, kj)); });
      elegido = libres.find((c) => !tapaPunto(caja(c))) ?? libres[0];
    }
    if (!elegido && p.forzar) elegido = anillo(0).find((c) => dentro(caja(c))) ?? anillo(0)[0];
    if (!elegido) continue;
    ocupadas.push(caja(elegido));
    colocadas.push({ id: p.id, ...elegido });
  }
  return colocadas;
}

/**
 * Reparte etiquetas en carriles horizontales: cada una va centrada sobre su
 * punto (sin salirse de [x0, x1]) en el carril más bajo donde no pisa a otra.
 * Es lo que usa el enjambre, donde los puntos están demasiado juntos para
 * poner el nombre al lado y va encima, con una línea guía.
 *
 * Se colocan primero las forzadas y luego por prioridad; una sin forzar que
 * necesitaría pasar de `maximo` carriles se omite, para que la fila no crezca
 * sin fin cuando el grupo es grande.
 */
export function carriles(
  etiquetas: Array<{ id: number; x: number; ancho: number; prioridad?: number; forzar?: boolean }>,
  x0: number,
  x1: number,
  { hueco = 5, maximo = Number.POSITIVE_INFINITY }: { hueco?: number; maximo?: number } = {},
) {
  const ocupados: Array<Array<[number, number]>> = [];
  const salida = new Map<number, { x: number; carril: number }>();
  const orden = [...etiquetas].sort((a, b) => Number(Boolean(b.forzar)) - Number(Boolean(a.forzar))
    || (b.prioridad ?? 0) - (a.prioridad ?? 0) || a.x - b.x || a.id - b.id);
  for (const e of orden) {
    const centro = Math.max(x0 + e.ancho / 2, Math.min(x1 - e.ancho / 2, e.x));
    const desde = centro - e.ancho / 2, hasta = centro + e.ancho / 2;
    const cabe = (tramos: Array<[number, number]>) => tramos.every(([a, b]) => hasta + hueco <= a || desde >= b + hueco);
    let carril = ocupados.findIndex(cabe);
    if (carril < 0) {
      if (ocupados.length >= maximo && !e.forzar) continue;
      carril = ocupados.length;
      ocupados.push([]);
    }
    ocupados[carril].push([desde, hasta]);
    salida.set(e.id, { x: centro, carril });
  }
  return { posiciones: salida, total: ocupados.length };
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
