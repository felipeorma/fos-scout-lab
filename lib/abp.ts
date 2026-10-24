/**
 * El cuaderno de balón parado: cada jugada en 3D, por fases.
 *
 * Una jugada es un reparto de fichas (las nuestras y las del rival) y una
 * sucesión de fases. Cada fase guarda dónde empieza cada ficha y el balón, y
 * lo que pasa durante ella: las carreras de los jugadores y, como mucho, un
 * pase. Reproducir una fase es llevar cada ficha de su sitio al final de su
 * carrera; la fase siguiente empieza donde terminó la anterior.
 *
 * Las medidas van en metros sobre un campo de 105 × 68 con el centro en el
 * origen: `x` a lo largo (atacamos hacia +x, la portería rival está en
 * x = 52,5) y `z` a lo ancho (+z es la derecha de quien ataca). Así la escena
 * 3D usa los mismos números que el modelo y no hay conversiones que se
 * desajusten.
 */

export type Punto = { x: number; z: number };
export type Equipo = "local" | "rival";
export type Ficha = { id: string; equipo: Equipo; dorsal: string; rol: string };
/** Una carrera dentro de una fase: de donde empieza la ficha a `hasta`. `curva`, en metros, la abre a un lado. */
export type Carrera = { fichaId: string; hasta: Punto; curva: number };
export type Pase = { hasta: Punto; tipo: "aereo" | "raso" };
export type EstiloZona = "translucida" | "rayas" | "borde";
export type Anotacion =
  | { id: string; tipo: "flecha"; a: Punto; b: Punto; color: string }
  | { id: string; tipo: "rect" | "zona"; a: Punto; b: Punto; color: string; estilo: EstiloZona }
  | { id: string; tipo: "texto" | "etiqueta"; a: Punto; texto: string; color: string };
export type Fase = {
  id: string;
  nombre: string;
  pos: Record<string, Punto>;
  balon: Punto;
  carreras: Carrera[];
  pase: Pase | null;
  anotaciones: Anotacion[];
  /** Segundos que dura al reproducirla. */
  duracion: number;
};
export type TipoABP = "corner_der" | "corner_izq" | "falta_frontal" | "falta_lateral" | "banda" | "salida" | "libre";
export type Colores = {
  /** null: el color del espacio de trabajo (rojo en Cavalry, verde en Maldonado). */
  local: string | null;
  rival: string;
  anotacion: string;
};
export type Jugada = { id: string; nombre: string; tipo: TipoABP; colores: Colores; fichas: Ficha[]; fases: Fase[] };
export type Cuaderno = { version: 1; activa: string; jugadas: Jugada[] };

export const CAMPO = { largo: 105, ancho: 68 } as const;
/** Cuánto puede salirse una ficha del rectángulo de juego: el lanzador de un córner o el que saca de banda están fuera. */
const MARGEN = 4;
export const DURACION_POR_DEFECTO = 3;
export const COLORES_POR_DEFECTO: Colores = { local: null, rival: "#e8e8ed", anotacion: "#f3b64c" };

export const TIPOS_ABP: Array<{ id: TipoABP; nombre: string }> = [
  { id: "corner_der", nombre: "Córner derecho" },
  { id: "corner_izq", nombre: "Córner izquierdo" },
  { id: "falta_frontal", nombre: "Falta frontal" },
  { id: "falta_lateral", nombre: "Falta lateral" },
  { id: "banda", nombre: "Saque de banda" },
  { id: "salida", nombre: "Salida de balón" },
  { id: "libre", nombre: "Pizarra libre" },
];

export const nombreDeTipo = (tipo: TipoABP) => TIPOS_ABP.find((x) => x.id === tipo)?.nombre ?? "Pizarra libre";

/**
 * Los nombres de serie —jugadas, fases y roles— en inglés.
 *
 * Tiene su propio diccionario porque el general ya usa algunas de estas
 * palabras con otro sentido: allí «Remate» es un grupo de métricas («Box
 * threat») y «Portero», una familia («Goalkeeping»). Lo que escribe el
 * usuario no está aquí y se enseña tal cual.
 */
const EN_ABP: Record<string, string> = {
  "Córner derecho": "Right corner", "Córner izquierdo": "Left corner", "Falta frontal": "Central free kick", "Falta lateral": "Wide free kick",
  "Saque de banda": "Throw-in", "Salida de balón": "Goal-kick build-up", "Pizarra libre": "Blank board",
  "Preparación": "Set-up", "Ataque de zonas": "Attacking the zones", "Finalización": "Finish", "Golpeo": "Strike", "Desmarques": "Movement",
  "Saque": "Throw", "Continuación": "Follow-up", "Abrir": "Spread out", "Salida": "Build-up", "Progresión": "Progression", "Fase 1": "Phase 1",
  "Lanzador": "Taker", "Primer palo": "Near post", "Segundo palo": "Far post", "Remate": "Header", "Arrastre": "Decoy", "Bloqueo": "Screen",
  "Rechace": "Second ball", "Vigilancia": "Rest defence", "Portero": "Goalkeeper", "Palo": "Post", "Zona": "Zonal", "Marca": "Marker",
  "Frontal": "Edge of box", "Contra": "Counter", "Línea": "Line", "Barrera": "Wall", "Amago": "Dummy", "Sacador": "Thrower", "Apoyo": "Support",
  "Desmarque": "Check run", "Profundidad": "Run in behind", "Interior": "Midfielder", "Mediapunta": "No. 10", "Lateral": "Full-back",
  "Medio": "Midfielder", "Central": "Centre-back", "Extremo": "Winger", "Pivote": "Holding mid", "Delantero": "Striker",
};

/** Un nombre de serie en el idioma pedido; cualquier otro texto, sin tocar. */
export const deSerie = (texto: string, idioma: "es" | "en") => (idioma === "en" ? EN_ABP[texto] ?? texto : texto);

let contador = 0;
/** Un id corto que no se repite en la sesión ni entre sesiones. */
export function nuevoId(prefijo: string) {
  contador += 1;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function limitar(p: Punto): Punto {
  const mx = CAMPO.largo / 2 + MARGEN, mz = CAMPO.ancho / 2 + MARGEN;
  return { x: Math.max(-mx, Math.min(mx, p.x)), z: Math.max(-mz, Math.min(mz, p.z)) };
}

export const distancia = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.z - a.z);
const igual = (a: Punto | undefined, b: Punto | undefined) => Boolean(a && b) && distancia(a!, b!) < 1e-6;

// ---- El movimiento ------------------------------------------------------------------------

/** Aceleración y frenada suaves: nadie arranca ni se para en seco. */
export const suavizar = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};

/** El punto de control de la curva: en el medio, desplazado `curva` metros hacia la izquierda del recorrido. */
export function controlDe(desde: Punto, hasta: Punto, curva: number): Punto {
  const largo = distancia(desde, hasta) || 1;
  const nx = -(hasta.z - desde.z) / largo, nz = (hasta.x - desde.x) / largo;
  return { x: (desde.x + hasta.x) / 2 + nx * curva, z: (desde.z + hasta.z) / 2 + nz * curva };
}

/** Un punto de la curva cuadrática que va de `desde` a `hasta`. */
export function enCurva(desde: Punto, hasta: Punto, curva: number, t: number): Punto {
  const c = controlDe(desde, hasta, curva);
  const u = 1 - t;
  return { x: u * u * desde.x + 2 * u * t * c.x + t * t * hasta.x, z: u * u * desde.z + 2 * u * t * c.z + t * t * hasta.z };
}

export const carreraDe = (fase: Fase, fichaId: string) => fase.carreras.find((c) => c.fichaId === fichaId);

/** Dónde acaba una ficha al terminar la fase. */
export function posFinal(fase: Fase, fichaId: string): Punto | undefined {
  return carreraDe(fase, fichaId)?.hasta ?? fase.pos[fichaId];
}

export const balonFinal = (fase: Fase) => fase.pase?.hasta ?? fase.balon;

/** Dónde está una ficha en el instante `t` (0–1) de la fase. */
export function posicionEn(fase: Fase, fichaId: string, t: number): Punto | undefined {
  const desde = fase.pos[fichaId];
  const carrera = carreraDe(fase, fichaId);
  if (!desde || !carrera) return desde;
  return enCurva(desde, carrera.hasta, carrera.curva, suavizar(t));
}

/** Cuánto sube un balón aéreo: más cuanto más lejos va, sin pasar de un globo razonable. */
export const alturaDePase = (desde: Punto, pase: Pase) => (pase.tipo === "raso" ? 0 : Math.max(2.5, Math.min(10, distancia(desde, pase.hasta) * 0.22)));

/** El balón en el instante `t`: en el suelo o en su parábola. */
export function balonEn(fase: Fase, t: number): Punto & { y: number } {
  if (!fase.pase) return { ...fase.balon, y: 0 };
  // El balón va a velocidad constante: un pase no acelera como un jugador.
  const u = Math.max(0, Math.min(1, t));
  const p = { x: fase.balon.x + (fase.pase.hasta.x - fase.balon.x) * u, z: fase.balon.z + (fase.pase.hasta.z - fase.balon.z) * u };
  return { ...p, y: alturaDePase(fase.balon, fase.pase) * 4 * u * (1 - u) };
}

// ---- Las fases ----------------------------------------------------------------------------

/** Una fase nueva que arranca donde acaba `fase`: cada ficha al final de su carrera, el balón donde llegó. */
export function faseSiguiente(fase: Fase, nombre: string): Fase {
  const pos: Record<string, Punto> = {};
  for (const id of Object.keys(fase.pos)) pos[id] = { ...posFinal(fase, id)! };
  return { id: nuevoId("f"), nombre, pos, balon: { ...balonFinal(fase) }, carreras: [], pase: null, anotaciones: [], duracion: fase.duracion };
}

/**
 * Lleva un cambio hacia delante. Si una ficha empezaba la fase siguiente justo
 * donde acababa la anterior, al mover ese final se mueve también el arranque:
 * si no, al reproducir daría un salto. Lo que el usuario ya separó a mano (una
 * ficha que empieza en otro sitio) se respeta.
 */
export function conContinuidad(antes: Jugada, despues: Jugada, desde: number): Jugada {
  const fases = despues.fases.map((f) => ({ ...f, pos: { ...f.pos } }));
  for (let k = desde + 1; k < fases.length && k < antes.fases.length; k += 1) {
    const previaAntes = antes.fases[k - 1], previaDespues = fases[k - 1];
    for (const id of Object.keys(fases[k].pos)) {
      if (igual(antes.fases[k].pos[id], posFinal(previaAntes, id))) fases[k].pos[id] = { ...posFinal(previaDespues, id)! };
    }
    if (igual(antes.fases[k].balon, balonFinal(previaAntes))) fases[k].balon = { ...balonFinal(previaDespues) };
  }
  return { ...despues, fases };
}

const conFase = (jugada: Jugada, indice: number, cambio: (fase: Fase) => Fase) =>
  conContinuidad(jugada, { ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? cambio(f) : f)) }, indice);

export const moverFicha = (jugada: Jugada, indice: number, fichaId: string, p: Punto) =>
  conFase(jugada, indice, (f) => ({ ...f, pos: { ...f.pos, [fichaId]: limitar(p) } }));

export const moverBalon = (jugada: Jugada, indice: number, p: Punto) => conFase(jugada, indice, (f) => ({ ...f, balon: limitar(p) }));

/** Una carrera por ficha y fase: marcar otra la sustituye. Si el destino es el sitio de partida, la quita. */
export function fijarCarrera(jugada: Jugada, indice: number, fichaId: string, hasta: Punto, curva?: number) {
  return conFase(jugada, indice, (f) => {
    const resto = f.carreras.filter((c) => c.fichaId !== fichaId);
    const desde = f.pos[fichaId];
    if (!desde || distancia(desde, hasta) < 0.5) return { ...f, carreras: resto };
    return { ...f, carreras: [...resto, { fichaId, hasta: limitar(hasta), curva: curva ?? carreraDe(f, fichaId)?.curva ?? 0 }] };
  });
}

export const curvarCarrera = (jugada: Jugada, indice: number, fichaId: string, curva: number) =>
  conFase(jugada, indice, (f) => ({ ...f, carreras: f.carreras.map((c) => (c.fichaId === fichaId ? { ...c, curva } : c)) }));

export const quitarCarrera = (jugada: Jugada, indice: number, fichaId: string) =>
  conFase(jugada, indice, (f) => ({ ...f, carreras: f.carreras.filter((c) => c.fichaId !== fichaId) }));

/** Un pase por fase: el balón sale de donde está y llega a `hasta`. */
export const fijarPase = (jugada: Jugada, indice: number, hasta: Punto, tipo: Pase["tipo"]) =>
  conFase(jugada, indice, (f) => ({ ...f, pase: distancia(f.balon, hasta) < 0.5 ? null : { hasta: limitar(hasta), tipo } }));

export const tipoDePase = (jugada: Jugada, indice: number, tipo: Pase["tipo"]) =>
  conFase(jugada, indice, (f) => ({ ...f, pase: f.pase ? { ...f.pase, tipo } : null }));

export const quitarPase = (jugada: Jugada, indice: number) => conFase(jugada, indice, (f) => ({ ...f, pase: null }));

/** El primer dorsal libre del equipo, contando desde el 1. */
export function dorsalLibre(jugada: Jugada, equipo: Equipo) {
  const usados = new Set(jugada.fichas.filter((f) => f.equipo === equipo).map((f) => f.dorsal));
  let n = 1;
  while (usados.has(String(n))) n += 1;
  return String(n);
}

/** Una ficha nueva aparece en todas las fases, en el mismo sitio. */
export function agregarFicha(jugada: Jugada, equipo: Equipo, p: Punto): [Jugada, string] {
  const id = nuevoId(equipo === "local" ? "L" : "R");
  const sitio = limitar(p);
  return [{
    ...jugada,
    fichas: [...jugada.fichas, { id, equipo, dorsal: dorsalLibre(jugada, equipo), rol: "" }],
    fases: jugada.fases.map((f) => ({ ...f, pos: { ...f.pos, [id]: { ...sitio } } })),
  }, id];
}

export const cambiarFicha = (jugada: Jugada, id: string, cambios: Partial<Pick<Ficha, "dorsal" | "rol" | "equipo">>) =>
  ({ ...jugada, fichas: jugada.fichas.map((f) => (f.id === id ? { ...f, ...cambios } : f)) });

export function quitarFicha(jugada: Jugada, id: string): Jugada {
  return {
    ...jugada,
    fichas: jugada.fichas.filter((f) => f.id !== id),
    fases: jugada.fases.map((f) => {
      const pos = { ...f.pos };
      delete pos[id];
      return { ...f, pos, carreras: f.carreras.filter((c) => c.fichaId !== id) };
    }),
  };
}

export const agregarAnotacion = (jugada: Jugada, indice: number, anotacion: Anotacion) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, anotaciones: [...f.anotaciones, anotacion] } : f)) });

export function cambiarAnotacion(jugada: Jugada, indice: number, id: string, cambios: Partial<{ texto: string; color: string; estilo: EstiloZona }>): Jugada {
  return {
    ...jugada,
    fases: jugada.fases.map((f, i) => (i !== indice ? f : {
      ...f,
      anotaciones: f.anotaciones.map((a) => (a.id !== id ? a : { ...a, ...cambios } as Anotacion)),
    })),
  };
}

/** Mueve una anotación entera `dx`, `dz` metros: la flecha o la zona se arrastran sin deformarse. */
export function desplazarAnotacion(jugada: Jugada, indice: number, id: string, dx: number, dz: number): Jugada {
  const mover = (p: Punto) => limitar({ x: p.x + dx, z: p.z + dz });
  return {
    ...jugada,
    fases: jugada.fases.map((f, i) => (i !== indice ? f : {
      ...f,
      anotaciones: f.anotaciones.map((a) => (a.id !== id ? a : "b" in a ? { ...a, a: mover(a.a), b: mover(a.b) } : { ...a, a: mover(a.a) })),
    })),
  };
}

export const quitarAnotacion = (jugada: Jugada, indice: number, id: string) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, anotaciones: f.anotaciones.filter((a) => a.id !== id) } : f)) });

/** Añade una fase después de `indice`, arrancando donde aquella acaba. */
export function agregarFase(jugada: Jugada, indice: number, nombre: string): Jugada {
  const nueva = faseSiguiente(jugada.fases[indice], nombre);
  const fases = [...jugada.fases];
  fases.splice(indice + 1, 0, nueva);
  return { ...jugada, fases };
}

/** Una copia exacta, justo después: para probar una variante sin perder la buena. */
export function duplicarFase(jugada: Jugada, indice: number, nombre: string): Jugada {
  const original = jugada.fases[indice];
  const copia: Fase = structuredClone({ ...original, id: nuevoId("f"), nombre });
  copia.anotaciones = copia.anotaciones.map((a) => ({ ...a, id: nuevoId("a") }));
  const fases = [...jugada.fases];
  fases.splice(indice + 1, 0, copia);
  return { ...jugada, fases };
}

/** Quita una fase; la última no se quita, que una jugada sin fases no se puede dibujar. */
export function quitarFase(jugada: Jugada, indice: number): Jugada {
  if (jugada.fases.length <= 1) return jugada;
  return { ...jugada, fases: jugada.fases.filter((_, i) => i !== indice) };
}

export const renombrarFase = (jugada: Jugada, indice: number, nombre: string) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, nombre } : f)) });

export const cambiarDuracion = (jugada: Jugada, indice: number, segundos: number) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, duracion: Math.max(0.5, Math.min(15, segundos)) } : f)) });

export const duracionTotal = (jugada: Jugada) => jugada.fases.reduce((s, f) => s + f.duracion, 0);

/** El segundo de la jugada en que empieza la fase `indice`. */
export const inicioDeFase = (jugada: Jugada, indice: number) => jugada.fases.slice(0, indice).reduce((s, f) => s + f.duracion, 0);

/** En qué fase y en qué punto de ella cae el segundo `s` de la jugada entera. */
export function instanteEn(jugada: Jugada, s: number): { fase: number; t: number } {
  let resto = Math.max(0, s);
  for (let i = 0; i < jugada.fases.length; i += 1) {
    const d = jugada.fases[i].duracion;
    if (resto < d || i === jugada.fases.length - 1) return { fase: i, t: d > 0 ? Math.min(1, resto / d) : 1 };
    resto -= d;
  }
  return { fase: 0, t: 0 };
}

// ---- Qué hay bajo el puntero -------------------------------------------------------------

/** La ficha más cercana a `p` dentro de `radio` metros, en su sitio de partida de la fase. */
export function fichaCerca(fase: Fase, p: Punto, radio = 1.6): string | null {
  let mejor: string | null = null, dMejor = radio;
  for (const [id, sitio] of Object.entries(fase.pos)) {
    const d = distancia(sitio, p);
    if (d <= dMejor) { mejor = id; dMejor = d; }
  }
  return mejor;
}

function aSegmento(p: Punto, a: Punto, b: Punto) {
  const lx = b.x - a.x, lz = b.z - a.z;
  const l2 = lx * lx + lz * lz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * lx + (p.z - a.z) * lz) / l2)) : 0;
  return distancia(p, { x: a.x + lx * t, z: a.z + lz * t });
}

/** La anotación que se toca en `p`: la última dibujada gana, como en cualquier editor. */
export function anotacionCerca(fase: Fase, p: Punto, tolerancia = 1.2): string | null {
  for (let i = fase.anotaciones.length - 1; i >= 0; i -= 1) {
    const a = fase.anotaciones[i];
    if (!("b" in a)) {
      if (distancia(a.a, p) <= tolerancia * 2.5) return a.id;
    } else if (a.tipo === "flecha") {
      if (aSegmento(p, a.a, a.b) <= tolerancia) return a.id;
    } else {
      const x0 = Math.min(a.a.x, a.b.x), x1 = Math.max(a.a.x, a.b.x), z0 = Math.min(a.a.z, a.b.z), z1 = Math.max(a.a.z, a.b.z);
      if (a.tipo === "rect") {
        if (p.x >= x0 - tolerancia && p.x <= x1 + tolerancia && p.z >= z0 - tolerancia && p.z <= z1 + tolerancia) return a.id;
      } else {
        const rx = Math.max((x1 - x0) / 2, 0.01) + tolerancia, rz = Math.max((z1 - z0) / 2, 0.01) + tolerancia;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (((p.x - cx) / rx) ** 2 + ((p.z - cz) / rz) ** 2 <= 1) return a.id;
      }
    }
  }
  return null;
}

// ---- Las plantillas ----------------------------------------------------------------------

type Sitio = [dorsal: string, rol: string, x: number, z: number];
type DefFase = { nombre: string; carreras?: Record<string, [number, number, number?]>; pase?: [number, number, Pase["tipo"]] };
type DefJugada = { local: Sitio[]; rival: Sitio[]; balon: [number, number]; fases: DefFase[] };

/*
 * Las jugadas de partida. No pretenden ser LA forma de sacar un córner: son un
 * reparto creíble —el lanzador, los que atacan cada palo, el del rechace, la
 * vigilancia— para no empezar con el campo vacío. Los ids son el equipo y el
 * dorsal ("L9", "R1") para que las fases se puedan escribir a mano.
 */
const CORNER_DERECHO: DefJugada = {
  balon: [52.2, 33.7],
  local: [
    ["10", "Lanzador", 53.2, 34.6], ["4", "Primer palo", 38.5, 7], ["9", "Remate", 39.5, -1], ["5", "Segundo palo", 40, -8],
    ["7", "Arrastre", 37, 2.5], ["3", "Bloqueo", 45.5, 9.5], ["8", "Rechace", 33.5, 0], ["2", "Vigilancia", 14, -12], ["6", "Vigilancia", 14, 10],
  ],
  rival: [
    ["1", "Portero", 51.6, 0.5], ["2", "Palo", 51.2, 4.6], ["4", "Zona", 47.2, 4.5], ["5", "Zona", 47.2, 0], ["6", "Zona", 47.2, -4.5],
    ["3", "Marca", 39.2, 6], ["8", "Marca", 40.2, -1.6], ["7", "Marca", 40.8, -7.2], ["10", "Frontal", 35.5, 2.5], ["9", "Contra", 16, 0],
  ],
  fases: [
    { nombre: "Preparación", carreras: { L3: [46.8, 6.2], L7: [38.5, 5], R3: [39.5, 6.8] } },
    {
      nombre: "Ataque de zonas",
      carreras: { L4: [47.8, 3.6, -2], L9: [46.3, -0.3, 2], L5: [48.4, -4.8], L7: [44.2, 9.5], L8: [36.5, 2], R3: [46.4, 4.4], R8: [45.2, -0.9], R7: [47, -5.4] },
      pase: [46.3, -0.3, "aereo"],
    },
    { nombre: "Finalización", carreras: { L8: [41, 1.5], L9: [47.4, -0.8], R1: [51.9, -1.2] }, pase: [52.7, -2.4, "raso"] },
  ],
};

const FALTA_LATERAL: DefJugada = {
  balon: [40, 27],
  local: [
    ["10", "Lanzador", 40.6, 28.4], ["4", "Primer palo", 35.5, 10], ["9", "Remate", 35, 4], ["5", "Segundo palo", 35.5, -2.5],
    ["7", "Arrastre", 36, 15], ["8", "Rechace", 30, 6], ["2", "Vigilancia", 12, -8], ["6", "Vigilancia", 14, 12],
  ],
  rival: [
    ["1", "Portero", 50.8, 1.5], ["7", "Barrera", 43.5, 18.9], ["8", "Barrera", 44.3, 18.3], ["2", "Línea", 37.5, 16.5], ["4", "Línea", 37.5, 12.5],
    ["5", "Línea", 37.5, 7.5], ["6", "Línea", 37.5, 2.5], ["3", "Línea", 37.5, -2.5], ["10", "Frontal", 30.5, 9], ["9", "Contra", 14, 0],
  ],
  fases: [
    { nombre: "Preparación", carreras: { L7: [37, 13] } },
    {
      nombre: "Ataque de zonas",
      carreras: { L4: [46.5, 5.5, -2], L9: [46, 0.5, 1.5], L5: [47.5, -5], L7: [44, 11], L8: [35, 4], R4: [44, 9], R5: [44.5, 5], R6: [45, 1], R3: [45.5, -3.5] },
      pase: [46, 0.5, "aereo"],
    },
    { nombre: "Finalización", carreras: { L8: [40, 2], R1: [51.6, 1.4] }, pase: [52.7, 2.2, "raso"] },
  ],
};

const FALTA_FRONTAL: DefJugada = {
  balon: [31, 3],
  local: [
    ["10", "Lanzador", 29.8, 4.4], ["11", "Amago", 30, 1.4], ["9", "Barrera", 40, -0.2], ["4", "Remate", 36, 7],
    ["7", "Rechace", 37, 12], ["8", "Rechace", 37, -9], ["2", "Vigilancia", 12, -6], ["5", "Vigilancia", 12, 8],
  ],
  rival: [
    ["1", "Portero", 51.6, -0.8], ["2", "Barrera", 39.94, 0.85], ["3", "Barrera", 40.02, 1.44], ["4", "Barrera", 40.1, 2.04], ["5", "Barrera", 40.18, 2.63],
    ["6", "Marca", 37.8, 7.6], ["8", "Marca", 38, -8.4], ["10", "Frontal", 33, 9], ["9", "Contra", 16, 0],
  ],
  fases: [
    { nombre: "Preparación", carreras: { L11: [32.2, 2.6, 1], L9: [40.3, -0.6] } },
    { nombre: "Golpeo", carreras: { L7: [45, 6], L8: [45, -6], L4: [44, 3.5], R6: [44.5, 5.5], R8: [44.5, -5.5] }, pase: [52.6, -2.9, "aereo"] },
  ],
};

const SAQUE_DE_BANDA: DefJugada = {
  balon: [25, 34.2],
  local: [
    ["3", "Sacador", 25, 34.8], ["7", "Apoyo", 21, 29], ["9", "Desmarque", 30, 28], ["11", "Profundidad", 33, 31], ["8", "Interior", 24, 22], ["10", "Mediapunta", 30, 18],
  ],
  rival: [
    ["2", "Lateral", 31, 29.5], ["6", "Marca", 22, 27.5], ["8", "Medio", 25, 20], ["4", "Central", 36, 22], ["11", "Extremo", 22, 31], ["5", "Central", 37, 12],
  ],
  fases: [
    { nombre: "Desmarques", carreras: { L9: [28, 31.5, 2], L11: [40, 31], L7: [19.5, 31.5], R2: [29, 30.6] } },
    { nombre: "Saque", carreras: { L11: [44, 29], L8: [27, 25], R4: [41, 25] }, pase: [28, 31.5, "aereo"] },
    { nombre: "Continuación", carreras: { L10: [40, 16, -3], L9: [32, 27] }, pase: [43.5, 29.2, "raso"] },
  ],
};

const SALIDA_DE_BALON: DefJugada = {
  balon: [-48, 1],
  local: [
    ["1", "Portero", -49, 0], ["4", "Central", -46, -9], ["5", "Central", -46, 9], ["2", "Lateral", -38, -26], ["3", "Lateral", -38, 26], ["6", "Pivote", -38, 0],
    ["8", "Interior", -28, -10], ["10", "Interior", -28, 10], ["7", "Extremo", -18, -28], ["11", "Extremo", -18, 28], ["9", "Delantero", -10, 0],
  ],
  rival: [
    ["9", "Delantero", -33, -3], ["10", "Mediapunta", -30, 6], ["7", "Extremo", -30, -18], ["11", "Extremo", -30, 18], ["8", "Medio", -22, -6], ["6", "Medio", -22, 6],
  ],
  fases: [
    { nombre: "Abrir", carreras: { L4: [-48.5, -15], L5: [-48.5, 15], L6: [-42, 0], L2: [-33, -30], L3: [-33, 30], R9: [-40, -6], R10: [-38, 4] } },
    { nombre: "Salida", carreras: { L3: [-36, 31], R11: [-40, 22, 2], L10: [-30, 20] }, pase: [-48.5, 15, "raso"] },
    { nombre: "Progresión", carreras: { L10: [-24, 22], L11: [-10, 30] }, pase: [-36, 31, "raso"] },
  ],
};

const PIZARRA_LIBRE: DefJugada = { balon: [0, 0], local: [], rival: [], fases: [{ nombre: "Fase 1" }] };

const espejo = (def: DefJugada): DefJugada => ({
  balon: [def.balon[0], -def.balon[1]],
  local: def.local.map(([d, r, x, z]) => [d, r, x, -z]),
  rival: def.rival.map(([d, r, x, z]) => [d, r, x, -z]),
  fases: def.fases.map((f) => ({
    ...f,
    carreras: f.carreras && Object.fromEntries(Object.entries(f.carreras).map(([id, [x, z, c]]) => [id, [x, -z, c === undefined ? undefined : -c]])),
    pase: f.pase && [f.pase[0], -f.pase[1], f.pase[2]],
  })),
});

const DEFINICIONES: Record<TipoABP, DefJugada> = {
  corner_der: CORNER_DERECHO,
  corner_izq: espejo(CORNER_DERECHO),
  falta_frontal: FALTA_FRONTAL,
  falta_lateral: FALTA_LATERAL,
  banda: SAQUE_DE_BANDA,
  salida: SALIDA_DE_BALON,
  libre: PIZARRA_LIBRE,
};

/** Una jugada de partida del tipo pedido, lista para editar. */
export function plantilla(tipo: TipoABP): Jugada {
  const def = DEFINICIONES[tipo] ?? PIZARRA_LIBRE;
  const fichas: Ficha[] = [
    ...def.local.map(([dorsal, rol]) => ({ id: `L${dorsal}`, equipo: "local" as const, dorsal, rol })),
    ...def.rival.map(([dorsal, rol]) => ({ id: `R${dorsal}`, equipo: "rival" as const, dorsal, rol })),
  ];
  let pos: Record<string, Punto> = Object.fromEntries([
    ...def.local.map(([d, , x, z]) => [`L${d}`, { x, z }]),
    ...def.rival.map(([d, , x, z]) => [`R${d}`, { x, z }]),
  ]);
  let balon: Punto = { x: def.balon[0], z: def.balon[1] };
  const fases: Fase[] = def.fases.map((d) => {
    const fase: Fase = {
      id: nuevoId("f"),
      nombre: d.nombre,
      pos,
      balon,
      carreras: Object.entries(d.carreras ?? {}).map(([fichaId, [x, z, curva]]) => ({ fichaId, hasta: { x, z }, curva: curva ?? 0 })),
      pase: d.pase ? { hasta: { x: d.pase[0], z: d.pase[1] }, tipo: d.pase[2] } : null,
      anotaciones: [],
      duracion: DURACION_POR_DEFECTO,
    };
    const siguiente = faseSiguiente(fase, "");
    pos = siguiente.pos;
    balon = siguiente.balon;
    return fase;
  });
  return { id: nuevoId("j"), nombre: nombreDeTipo(tipo), tipo, colores: { ...COLORES_POR_DEFECTO }, fichas, fases };
}

export const cuadernoInicial = (): Cuaderno => {
  const jugada = plantilla("corner_der");
  return { version: 1, activa: jugada.id, jugadas: [jugada] };
};

// ---- Lo guardado ---------------------------------------------------------------------------

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const esPunto = (v: unknown): v is Punto => Boolean(v) && esNumero((v as Punto).x) && esNumero((v as Punto).z);
const texto = (v: unknown, respaldo = "") => (typeof v === "string" ? v.slice(0, 80) : respaldo);
const color = (v: unknown, respaldo: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : respaldo);

function anotacionValida(v: unknown): Anotacion | null {
  const a = v as Record<string, unknown>;
  if (!a || typeof a.id !== "string" || !esPunto(a.a)) return null;
  const c = color(a.color, COLORES_POR_DEFECTO.anotacion);
  if (a.tipo === "texto" || a.tipo === "etiqueta") return { id: a.id, tipo: a.tipo, a: a.a, texto: texto(a.texto), color: c };
  if (!esPunto(a.b)) return null;
  if (a.tipo === "flecha") return { id: a.id, tipo: "flecha", a: a.a, b: a.b, color: c };
  if (a.tipo === "rect" || a.tipo === "zona") {
    const estilo = a.estilo === "rayas" || a.estilo === "borde" ? a.estilo : "translucida";
    return { id: a.id, tipo: a.tipo, a: a.a, b: a.b, color: c, estilo };
  }
  return null;
}

function jugadaValida(v: unknown): Jugada | null {
  const j = v as Record<string, unknown>;
  if (!j || typeof j.id !== "string" || !Array.isArray(j.fichas) || !Array.isArray(j.fases) || j.fases.length === 0) return null;
  const fichas: Ficha[] = (j.fichas as Array<Record<string, unknown>>)
    .filter((f) => f && typeof f.id === "string" && (f.equipo === "local" || f.equipo === "rival"))
    .map((f) => ({ id: f.id as string, equipo: f.equipo as Equipo, dorsal: texto(f.dorsal).slice(0, 3), rol: texto(f.rol).slice(0, 24) }));
  const ids = new Set(fichas.map((f) => f.id));
  const fases: Fase[] = [];
  for (const bruta of j.fases as Array<Record<string, unknown>>) {
    if (!bruta || !esPunto(bruta.balon)) return null;
    const pos: Record<string, Punto> = {};
    for (const id of ids) {
      const sitio = (bruta.pos as Record<string, unknown> | undefined)?.[id];
      // Una ficha sin sitio en alguna fase la dejaría flotando en otra: se
      // pone donde estaba en la fase anterior o, si es la primera, en el centro.
      pos[id] = esPunto(sitio) ? limitar(sitio) : (fases.length ? posFinal(fases[fases.length - 1], id) : undefined) ?? { x: 0, z: 0 };
    }
    const carreras = Array.isArray(bruta.carreras) ? (bruta.carreras as Array<Record<string, unknown>>)
      .filter((c) => c && ids.has(c.fichaId as string) && esPunto(c.hasta))
      .map((c) => ({ fichaId: c.fichaId as string, hasta: limitar(c.hasta as Punto), curva: esNumero(c.curva) ? Math.max(-30, Math.min(30, c.curva)) : 0 })) : [];
    const pase = bruta.pase && esPunto((bruta.pase as Pase).hasta)
      ? { hasta: limitar((bruta.pase as Pase).hasta), tipo: (bruta.pase as Pase).tipo === "raso" ? "raso" as const : "aereo" as const }
      : null;
    fases.push({
      id: typeof bruta.id === "string" ? bruta.id : nuevoId("f"),
      nombre: texto(bruta.nombre, `Fase ${fases.length + 1}`),
      pos,
      balon: limitar(bruta.balon as Punto),
      carreras,
      pase,
      anotaciones: Array.isArray(bruta.anotaciones) ? (bruta.anotaciones as unknown[]).map(anotacionValida).filter((a): a is Anotacion => a !== null) : [],
      duracion: esNumero(bruta.duracion) ? Math.max(0.5, Math.min(15, bruta.duracion)) : DURACION_POR_DEFECTO,
    });
  }
  const colores = (j.colores ?? {}) as Record<string, unknown>;
  const tipo = TIPOS_ABP.some((x) => x.id === j.tipo) ? j.tipo as TipoABP : "libre";
  return {
    id: j.id,
    nombre: texto(j.nombre, nombreDeTipo(tipo)),
    tipo,
    colores: {
      local: colores.local === null ? null : color(colores.local, "") || null,
      rival: color(colores.rival, COLORES_POR_DEFECTO.rival),
      anotacion: color(colores.anotacion, COLORES_POR_DEFECTO.anotacion),
    },
    fichas,
    fases,
  };
}

/**
 * Lo que se lee del almacenamiento, comprobado. Viene de una versión anterior
 * o de otra pestaña: lo que no se entiende se descarta en vez de romper la
 * pantalla, y si no queda ninguna jugada se devuelve null.
 */
export function normalizarCuaderno(v: unknown): Cuaderno | null {
  const c = v as Record<string, unknown>;
  if (!c || c.version !== 1 || !Array.isArray(c.jugadas)) return null;
  const jugadas = (c.jugadas as unknown[]).map(jugadaValida).filter((j): j is Jugada => j !== null);
  if (!jugadas.length) return null;
  const activa = jugadas.some((j) => j.id === c.activa) ? c.activa as string : jugadas[0].id;
  return { version: 1, activa, jugadas };
}
