/**
 * El estudio táctico: cada sistema de juego en 3D, por fases.
 *
 * Empezó como cuaderno de balón parado (de ahí el nombre del archivo) y ahora
 * guarda cualquier sistema: una salida de balón, una presión, un córner o un
 * rondo. Cada uno lleva su ambiente —el césped, si se ve el estadio, las
 * zonas pintadas y el encuadre— para que salga igual al abrirlo otro día.
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

import { DIBUJOS, SITIO } from "./pizarra.ts";
import { aPolilinea, aSegmento, contornoHolgado, ordenarEnLinea } from "./geometria.ts";

export type Punto = { x: number; z: number };
export type Equipo = "local" | "rival";
/** `nombre`: el jugador de verdad (su apellido), que se lee bajo la ficha en vez del rol. */
export type Ficha = { id: string; equipo: Equipo; dorsal: string; rol: string; nombre?: string };
/** Una carrera dentro de una fase: de donde empieza la ficha a `hasta`. `curva`, en metros, la abre a un lado. */
export type Carrera = { fichaId: string; hasta: Punto; curva: number };
export type Pase = { hasta: Punto; tipo: "aereo" | "raso" };
/** "foco": la zona se queda con su color y todo lo de fuera se apaga, para mirar solo ahí. */
export type EstiloZona = "translucida" | "rayas" | "borde" | "foco";
/**
 * Continua: un pase o un movimiento. Discontinua: sin balón. Punteada: una
 * opción, lo que podría pasar. Ondulada: conducción. Línea: una altura o un
 * límite, sin punta. Presión: una cuña que se abre del que presiona hacia el
 * balón, con el ángulo por donde llega.
 */
export type EstiloFlecha = "continua" | "discontinua" | "punteada" | "ondulada" | "linea" | "presion";
/** Cómo acaba una flecha: con punta, con punta en los dos lados, con una barra de parada o sin nada. */
export type Extremo = "punta" | "doble" | "barra" | "nada";
export type Grosor = "fino" | "normal" | "grueso";
/**
 * El bloque: una línea que pasa por los jugadores elegidos y, si se quiere,
 * sombrea su espacio: hacia la portería que defienden (atrás) o a su
 * alrededor (cerrado). Se mueve con ellos.
 */
export type RellenoBloque = "atras" | "cerrado" | "linea";
/** Lo que se puede ocultar de un golpe en toda la jugada, sin borrarlo. */
export type Capa = "recorridos" | "flechas" | "zonas" | "textos" | "medidas";
export type Anotacion =
  | {
    id: string; tipo: "flecha"; a: Punto; b: Punto; color: string; estilo: EstiloFlecha;
    extremo?: Extremo; grosor?: Grosor;
    /** Metros que se abre la flecha hacia su izquierda, como la curva de una carrera. */
    curva?: number;
    /** La ficha de la que sale y a la que llega, si se dibujó sobre ellas: la flecha va con ellas. */
    desde?: string; hasta?: string;
  }
  | { id: string; tipo: "rect" | "zona"; a: Punto; b: Punto; color: string; estilo: EstiloZona }
  | { id: string; tipo: "texto" | "etiqueta"; a: Punto; texto: string; color: string }
  /** Una medida en metros entre dos puntos o dos fichas. */
  | { id: string; tipo: "medida"; a: Punto; b: Punto; color: string; desde?: string; hasta?: string }
  | { id: string; tipo: "bloque"; fichas: string[]; color: string; relleno: RellenoBloque }
  /** Un trazo a mano alzada, en metros, ya sin los puntos que no cambian su forma. */
  | { id: string; tipo: "trazo"; puntos: Punto[]; color: string; grosor?: Grosor; punta?: boolean };
/** El material de entrenamiento, del más pequeño al más grande. */
export type TipoMaterial = "seta" | "cono" | "pica" | "valla" | "aro" | "escalera" | "balon" | "maniqui" | "miniporteria" | "porteria";
/** Una pieza en el césped: dónde, girada cuántos grados y de qué color. */
export type Material = { id: string; tipo: TipoMaterial; p: Punto; giro: number; color: string };
export type Fase = {
  id: string;
  nombre: string;
  pos: Record<string, Punto>;
  balon: Punto;
  carreras: Carrera[];
  pase: Pase | null;
  anotaciones: Anotacion[];
  /** Conos, picas, vallas…: pasan a la fase siguiente al crearla, como en una sesión de verdad. */
  material?: Material[];
  /** Segundos que la pose se queda quieta antes de moverse: lo que tarda en leerse. */
  pausa: number;
  /** Segundos que dura el movimiento. */
  duracion: number;
  /** Una línea que explica el momento: sale bajo el campo, en el PDF y en el vídeo. */
  nota: string;
};
export type TipoABP = "corner_der" | "corner_izq" | "falta_frontal" | "falta_lateral" | "banda" | "salida" | "rondo" | "partido" | "libre";
export type Categoria = "salida" | "presion" | "ataque" | "defensa" | "abp" | "entrenamiento" | "libre";
/** Papel imprime mejor; Retransmisión y Noche se leen como un partido en la tele; Tiza, como la pizarra del vestuario. */
export type Superficie = "noche" | "retransmision" | "papel" | "tiza";
export type Zonas = "ninguna" | "tercios" | "carriles" | "rejilla" | "zonas18";
export type Encuadre = "campo" | "dos_tercios" | "su_mitad" | "nuestra_mitad" | "su_area" | "centro";
export type Ambiente = {
  superficie: Superficie;
  estadio: boolean;
  zonas: Zonas;
  encuadre: Encuadre;
  /** El tablero plano, como una pizarra de análisis, o el campo en 3D. */
  dimension: "2d" | "3d";
  /** Solo en 2D: el campo de lado o de abajo arriba, para el móvil y el vídeo vertical. */
  orientacion: "horizontal" | "vertical";
  /** Qué va dentro de la ficha: el dorsal o el puesto (DFC, MC…). */
  fichas: "dorsal" | "puesto";
  /** Suave: arrancan y frenan como jugadores. Lineal: a ritmo constante. */
  suavizado: "suave" | "lineal";
  /** Una estela que se desvanece detrás de cada ficha y del balón al reproducir. */
  estelas: boolean;
  /** Lo que no se enseña ahora (en el tablero, el vídeo, la imagen y el PDF), sin borrarlo. */
  ocultas?: Capa[];
};
export type Colores = {
  /** null: el color del espacio de trabajo (rojo en Cavalry, verde en Maldonado). */
  local: string | null;
  rival: string;
  anotacion: string;
};
/** El dibujo de la camiseta en la ficha. */
export type Patron = "liso" | "rayas" | "aros" | "mitades" | "banda" | "degradado";
/**
 * La equipación de un equipo: el color principal es el de `colores`; aquí va
 * el dibujo, el segundo color, si el borde de la ficha lleva ese color (el
 * ribete) y de qué color va el dorsal.
 */
export type Equipacion = { patron: Patron; secundario: string; ribete: boolean; dorsal: "auto" | "blanco" | "negro" };
export type Jugada = {
  id: string;
  nombre: string;
  tipo: TipoABP;
  categoria: Categoria;
  colores: Colores;
  /** Sin equipaciones, las fichas van lisas: así se abre lo guardado antes. */
  equipaciones?: Record<Equipo, Equipacion>;
  ambiente: Ambiente;
  fichas: Ficha[];
  fases: Fase[];
  /** Cuándo se tocó por última vez (ms), para ordenar el portal. */
  actualizada: number;
};
export type Cuaderno = { version: 1; activa: string; jugadas: Jugada[] };

export const CAMPO = { largo: 105, ancho: 68 } as const;
const MEDIO_LARGO = CAMPO.largo / 2;
/** Cuánto puede salirse una ficha del rectángulo de juego: el lanzador de un córner o el que saca de banda están fuera. */
const MARGEN = 4;
export const DURACION_POR_DEFECTO = 2.4;
export const PAUSA_POR_DEFECTO = 0.8;
export const COLORES_POR_DEFECTO: Colores = { local: null, rival: "#e8e8ed", anotacion: "#f3b64c" };
export const AMBIENTE_POR_DEFECTO: Ambiente = {
  superficie: "noche", estadio: true, zonas: "ninguna", encuadre: "campo", dimension: "2d", orientacion: "horizontal", fichas: "dorsal",
  suavizado: "suave", estelas: true,
};

export const CATEGORIAS: Array<{ id: Categoria; nombre: string }> = [
  { id: "salida", nombre: "Salida" },
  { id: "presion", nombre: "Presión" },
  { id: "ataque", nombre: "Ataque" },
  { id: "defensa", nombre: "Defensa" },
  { id: "abp", nombre: "Balón parado" },
  { id: "entrenamiento", nombre: "Entrenamiento" },
  { id: "libre", nombre: "Libre" },
];
export const SUPERFICIES: Array<{ id: Superficie; nombre: string }> = [
  { id: "noche", nombre: "Noche" }, { id: "retransmision", nombre: "Retransmisión" }, { id: "papel", nombre: "Papel" }, { id: "tiza", nombre: "Tiza" },
];
export const ZONAS: Array<{ id: Zonas; nombre: string }> = [
  { id: "ninguna", nombre: "Sin zonas" }, { id: "tercios", nombre: "Tercios" }, { id: "carriles", nombre: "Cinco carriles" },
  { id: "rejilla", nombre: "Carriles y tercios" }, { id: "zonas18", nombre: "18 zonas" },
];
export const ENCUADRES: Array<{ id: Encuadre; nombre: string }> = [
  { id: "campo", nombre: "Campo entero" }, { id: "dos_tercios", nombre: "Dos tercios" }, { id: "su_mitad", nombre: "Su mitad" },
  { id: "nuestra_mitad", nombre: "Nuestra mitad" }, { id: "su_area", nombre: "Su área" }, { id: "centro", nombre: "Círculo central" },
];
/**
 * El material, con su tamaño real en metros —largo en el sentido en que se
 * corre, ancho de lado a lado— y su color de serie.
 */
export const MATERIALES: Array<{ id: TipoMaterial; nombre: string; color: string; largo: number; ancho: number }> = [
  { id: "seta", nombre: "Seta", color: "#ff7a1a", largo: 0.4, ancho: 0.4 },
  { id: "cono", nombre: "Cono", color: "#ff5f1f", largo: 0.45, ancho: 0.45 },
  { id: "pica", nombre: "Pica", color: "#f3d34a", largo: 0.12, ancho: 0.12 },
  { id: "valla", nombre: "Valla", color: "#f6c12d", largo: 0.12, ancho: 0.6 },
  { id: "aro", nombre: "Aro", color: "#3aa0ff", largo: 0.7, ancho: 0.7 },
  { id: "escalera", nombre: "Escalera", color: "#f6c12d", largo: 4, ancho: 0.5 },
  { id: "balon", nombre: "Balón suelto", color: "#ffffff", largo: 0.22, ancho: 0.22 },
  { id: "maniqui", nombre: "Maniquí", color: "#ffd23f", largo: 0.3, ancho: 0.6 },
  { id: "miniporteria", nombre: "Miniportería", color: "#ffffff", largo: 0.9, ancho: 1.8 },
  { id: "porteria", nombre: "Portería", color: "#ffffff", largo: 2, ancho: 7.32 },
];
export const PATRONES: Array<{ id: Patron; nombre: string }> = [
  { id: "liso", nombre: "Lisa" }, { id: "rayas", nombre: "Rayas" }, { id: "aros", nombre: "Aros" },
  { id: "mitades", nombre: "Mitades" }, { id: "banda", nombre: "Banda" }, { id: "degradado", nombre: "Degradado" },
];
export const EQUIPACION_LISA: Equipacion = { patron: "liso", secundario: "#ffffff", ribete: false, dorsal: "auto" };
export const equipacionDe = (jugada: Jugada, equipo: Equipo): Equipacion => jugada.equipaciones?.[equipo] ?? EQUIPACION_LISA;
export const cambiarEquipacion = (jugada: Jugada, equipo: Equipo, cambios: Partial<Equipacion>): Jugada => ({
  ...jugada,
  equipaciones: {
    local: equipacionDe(jugada, "local"),
    rival: equipacionDe(jugada, "rival"),
    [equipo]: { ...equipacionDe(jugada, equipo), ...cambios },
  },
});

/** El rectángulo que enseña cada encuadre, en metros. */
export const CAJA_DE_ENCUADRE: Record<Encuadre, { x0: number; x1: number; z0: number; z1: number }> = {
  campo: { x0: -52.5, x1: 52.5, z0: -34, z1: 34 },
  dos_tercios: { x0: -17.5, x1: 52.5, z0: -34, z1: 34 },
  su_mitad: { x0: 0, x1: 52.5, z0: -34, z1: 34 },
  nuestra_mitad: { x0: -52.5, x1: 0, z0: -34, z1: 34 },
  su_area: { x0: 30, x1: 52.5, z0: -24, z1: 24 },
  centro: { x0: -20, x1: 20, z0: -15, z1: 15 },
};

export const TIPOS_ABP: Array<{ id: TipoABP; nombre: string }> = [
  { id: "corner_der", nombre: "Córner derecho" },
  { id: "corner_izq", nombre: "Córner izquierdo" },
  { id: "falta_frontal", nombre: "Falta frontal" },
  { id: "falta_lateral", nombre: "Falta lateral" },
  { id: "banda", nombre: "Saque de banda" },
  { id: "salida", nombre: "Salida de balón" },
  { id: "rondo", nombre: "Rondo 4 contra 2" },
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
  "Rondo 4 contra 2": "Rondo 4 v 2", "Circular": "Move it round", "Cambio de orientación": "Switch of play", "Presión": "Pressing", "Cobertura": "Cover",
  "POR": "GK", "LI": "LB", "LD": "RB", "DFC": "CB", "CAI": "LWB", "CAD": "RWB", "MCD": "DM", "MC": "CM", "MI": "LM", "MD": "RM",
  "MP": "AM", "EI": "LW", "ED": "RW", "SD": "SS", "DC": "ST",
  "Ataque": "Attacking", "Defensa": "Defending", "Balón parado": "Set pieces", "Entrenamiento": "Training", "Libre": "Free",
  "Noche": "Night", "Retransmisión": "Broadcast", "Papel": "Paper", "Tiza": "Chalk",
  "Sin zonas": "No zones", "Tercios": "Thirds", "Cinco carriles": "Five channels", "Carriles y tercios": "Channels and thirds", "18 zonas": "18 zones",
  "Campo entero": "Full pitch", "Dos tercios": "Two thirds", "Su mitad": "Their half", "Nuestra mitad": "Our half", "Su área": "Their box", "Círculo central": "Centre circle",
  "El 3 se pone delante del zonal del primer palo; el 7 arrastra a su marca.": "No. 3 stands in front of the near-post zonal marker; No. 7 drags his man away.",
  "Primer palo, punto de penalti y segundo palo a la vez: el envío va al 9 en el centro.": "Near post, penalty spot and far post at once: the delivery goes to the 9 in the middle.",
  "Remate al palo largo; el 8 cierra el rechace en la frontal.": "Header to the far post; No. 8 covers the second ball at the edge of the box.",
  "Pase al compañero libre; el primero presiona, el segundo tapa la línea de pase interior.": "Pass to the free teammate; the first defender presses, the second blocks the inside lane.",
  "Cuando se cierran por un lado, el balón cruza al apoyo opuesto.": "When they close one side, the ball crosses to the opposite support.",
  // El material de entrenamiento y los dibujos de las camisetas.
  "Seta": "Marker", "Cono": "Cone", "Pica": "Pole", "Valla": "Hurdle", "Aro": "Hoop", "Escalera": "Ladder", "Balón suelto": "Spare ball", "Maniquí": "Mannequin", "Miniportería": "Mini goal", "Portería": "Goal", "Lisa": "Plain", "Rayas": "Stripes", "Aros": "Hoops", "Mitades": "Halves", "Banda": "Sash", "Degradado": "Gradient",
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

/**
 * Aceleración y frenada suaves: nadie arranca ni se para en seco. Es la
 * curva del coseno —más tranquila que una cúbica—, la que da la sensación de
 * película de las pizarras animadas. Con `lineal`, ritmo constante.
 */
export const suavizar = (t: number, lineal = false) => {
  const u = Math.max(0, Math.min(1, t));
  return lineal ? u : 0.5 - 0.5 * Math.cos(Math.PI * u);
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
export function posicionEn(fase: Fase, fichaId: string, t: number, lineal = false): Punto | undefined {
  const desde = fase.pos[fichaId];
  const carrera = carreraDe(fase, fichaId);
  if (!desde || !carrera) return desde;
  return enCurva(desde, carrera.hasta, carrera.curva, suavizar(t, lineal));
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
  return {
    id: nuevoId("f"), nombre, pos, balon: { ...balonFinal(fase) }, carreras: [], pase: null,
    // Lo que marca el campo sigue en la fase siguiente, como el material: las zonas, los bloques, las líneas y las medidas.
    anotaciones: fase.anotaciones.filter(pasaDeFase).map((a) => ({ ...structuredClone(a), id: nuevoId("a") })),
    material: (fase.material ?? []).map((m) => ({ ...m, p: { ...m.p } })), pausa: fase.pausa, duracion: fase.duracion, nota: "",
  };
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

/**
 * Mover una ficha en una pose: es la forma de trabajar de las pizarras
 * animadas. En la primera fase solo la coloca; de la segunda en adelante, si
 * la ficha venía de la fase anterior, el cambio se convierte en su carrera
 * desde allí y el estudio anima la diferencia. Si en esta fase ya se había
 * separado a mano, se respeta y solo se mueve su sitio.
 */
export function posar(jugada: Jugada, indice: number, fichaId: string, p: Punto): Jugada {
  const previa = jugada.fases[indice - 1];
  if (!previa || !igual(jugada.fases[indice].pos[fichaId], posFinal(previa, fichaId))) return moverFicha(jugada, indice, fichaId, p);
  return fijarCarrera(jugada, indice - 1, fichaId, p);
}

/** Lo mismo con el balón: moverlo en una pose es el pase desde la anterior. */
export function posarBalon(jugada: Jugada, indice: number, p: Punto): Jugada {
  const previa = jugada.fases[indice - 1];
  if (!previa || !igual(jugada.fases[indice].balon, balonFinal(previa))) return moverBalon(jugada, indice, p);
  return fijarPase(jugada, indice - 1, p, previa.pase?.tipo ?? "raso");
}

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

export const cambiarFicha = (jugada: Jugada, id: string, cambios: Partial<Pick<Ficha, "dorsal" | "rol" | "equipo" | "nombre">>) =>
  ({ ...jugada, fichas: jugada.fichas.map((f) => (f.id === id ? { ...f, ...cambios } : f)) });

export function quitarFicha(jugada: Jugada, id: string): Jugada {
  return {
    ...jugada,
    fichas: jugada.fichas.filter((f) => f.id !== id),
    fases: jugada.fases.map((f) => {
      const pos = { ...f.pos };
      delete pos[id];
      // Lo que iba pegado a la ficha se queda donde ella estaba; el bloque sigue con los demás.
      const anotaciones = f.anotaciones.map((a) => {
        if (a.tipo === "bloque") return { ...a, fichas: a.fichas.filter((x) => x !== id) };
        if ((a.tipo === "flecha" || a.tipo === "medida") && (a.desde === id || a.hasta === id)) {
          const e = extremosDe(a, f, 0);
          return { ...a, a: e.a, b: e.b, desde: a.desde === id ? undefined : a.desde, hasta: a.hasta === id ? undefined : a.hasta };
        }
        return a;
      }).filter((a) => a.tipo !== "bloque" || a.fichas.length > 0);
      return { ...f, pos, carreras: f.carreras.filter((c) => c.fichaId !== id), anotaciones };
    }),
  };
}

export const agregarAnotacion = (jugada: Jugada, indice: number, anotacion: Anotacion) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, anotaciones: [...f.anotaciones, anotacion] } : f)) });

export type CambiosDeAnotacion = Partial<{
  texto: string; color: string; estilo: EstiloZona; estiloFlecha: EstiloFlecha;
  extremo: Extremo; grosor: Grosor; curva: number; relleno: RellenoBloque; punta: boolean;
  /** Despega la flecha o la medida de sus fichas: se queda donde está ahora. */
  soltar: true;
}>;

export function cambiarAnotacion(jugada: Jugada, indice: number, id: string, cambios: CambiosDeAnotacion): Jugada {
  return {
    ...jugada,
    fases: jugada.fases.map((f, i) => (i !== indice ? f : {
      ...f,
      anotaciones: f.anotaciones.map((a) => (a.id !== id ? a : aplicarCambios(a, f, cambios))),
    })),
  };
}

/** Solo lo que tiene sentido para cada tipo: el estilo de una flecha y el de una zona se llaman igual pero no son lo mismo. */
function aplicarCambios(a: Anotacion, fase: Fase, c: CambiosDeAnotacion): Anotacion {
  const conColor = c.color ? { color: c.color } : {};
  switch (a.tipo) {
    case "flecha": {
      const suelta = c.soltar ? soltar(a, fase) : {};
      return {
        ...a, ...conColor, ...suelta,
        ...(c.estiloFlecha ? { estilo: c.estiloFlecha } : {}),
        ...(c.extremo ? { extremo: c.extremo } : {}),
        ...(c.grosor ? { grosor: c.grosor } : {}),
        ...(c.curva !== undefined ? { curva: Math.max(-20, Math.min(20, c.curva)) } : {}),
      };
    }
    case "medida":
      return { ...a, ...conColor, ...(c.soltar ? soltar(a, fase) : {}) };
    case "rect":
    case "zona":
      return { ...a, ...conColor, ...(c.estilo ? { estilo: c.estilo } : {}) };
    case "texto":
    case "etiqueta":
      return { ...a, ...conColor, ...(c.texto !== undefined ? { texto: c.texto } : {}) };
    case "bloque":
      return { ...a, ...conColor, ...(c.relleno ? { relleno: c.relleno } : {}) };
    case "trazo":
      return { ...a, ...conColor, ...(c.grosor ? { grosor: c.grosor } : {}), ...(c.punta !== undefined ? { punta: c.punta } : {}) };
  }
}

const soltar = (a: { a: Punto; b: Punto; desde?: string; hasta?: string }, fase: Fase) => {
  const e = extremosDe(a, fase, 0);
  return { a: e.a, b: e.b, desde: undefined, hasta: undefined };
};

/**
 * Mueve una anotación entera `dx`, `dz` metros: la flecha o la zona se
 * arrastran sin deformarse. Una flecha pegada a fichas se despega y va donde
 * se la lleve; un bloque no se mueve, que va con sus jugadores.
 */
export function desplazarAnotacion(jugada: Jugada, indice: number, id: string, dx: number, dz: number): Jugada {
  const mover = (p: Punto) => limitar({ x: p.x + dx, z: p.z + dz });
  return {
    ...jugada,
    fases: jugada.fases.map((f, i) => (i !== indice ? f : {
      ...f,
      anotaciones: f.anotaciones.map((a): Anotacion => {
        if (a.id !== id) return a;
        switch (a.tipo) {
          case "flecha":
          case "medida": {
            const e = extremosDe(a, f, 0);
            return { ...a, a: mover(e.a), b: mover(e.b), desde: undefined, hasta: undefined };
          }
          case "rect":
          case "zona":
            return { ...a, a: mover(a.a), b: mover(a.b) };
          case "texto":
          case "etiqueta":
            return { ...a, a: mover(a.a) };
          case "trazo":
            return { ...a, puntos: a.puntos.map(mover) };
          case "bloque":
            return a;
        }
      }),
    })),
  };
}

/** Una copia de la anotación con otro id, `dx`, `dz` metros más allá (para pegar o duplicar). */
export function copiaDeAnotacion(a: Anotacion, fase: Fase, dx: number, dz: number): Anotacion {
  const copia = { ...structuredClone(a), id: nuevoId("a") };
  if (copia.tipo === "bloque") return copia;
  // La copia de algo pegado a fichas va suelta: si no, caería encima del original.
  if (copia.tipo === "flecha" || copia.tipo === "medida") {
    const e = extremosDe(a as typeof copia, fase, 0);
    return { ...copia, desde: undefined, hasta: undefined, ...desplazar({ a: e.a, b: e.b }, dx, dz) };
  }
  if (copia.tipo === "trazo") return { ...copia, puntos: copia.puntos.map((p) => limitar({ x: p.x + dx, z: p.z + dz })) };
  if (copia.tipo === "rect" || copia.tipo === "zona") return { ...copia, ...desplazar({ a: copia.a, b: copia.b }, dx, dz) };
  return { ...copia, a: limitar({ x: copia.a.x + dx, z: copia.a.z + dz }) };
}
const desplazar = (ab: { a: Punto; b: Punto }, dx: number, dz: number) =>
  ({ a: limitar({ x: ab.a.x + dx, z: ab.a.z + dz }), b: limitar({ x: ab.b.x + dx, z: ab.b.z + dz }) });

// ---- La geometría de las anotaciones ---------------------------------------------------------

/** Lo que sigue en la fase siguiente: lo que marca el campo, no lo que pasa en esta fase. */
export const pasaDeFase = (a: Anotacion) =>
  a.tipo === "rect" || a.tipo === "zona" || a.tipo === "bloque" || a.tipo === "medida" || (a.tipo === "flecha" && a.estilo === "linea");

/** En qué capa va cada anotación, para ocultarlas por tipo. */
export function capaDe(a: Anotacion): Capa {
  switch (a.tipo) {
    case "flecha":
    case "trazo":
      return "flechas";
    case "rect":
    case "zona":
    case "bloque":
      return "zonas";
    case "texto":
    case "etiqueta":
      return "textos";
    case "medida":
      return "medidas";
  }
}

export const visible = (ambiente: Ambiente, capa: Capa) => !(ambiente.ocultas ?? []).includes(capa);

/**
 * Los dos extremos de una flecha o una medida en el instante `t`: si está
 * pegada a una ficha, donde va la ficha. `enFichaA` y `enFichaB` dicen si el
 * extremo es una ficha, para empezar el trazo en su borde y no en su centro.
 */
export function extremosDe(
  a: { a: Punto; b: Punto; desde?: string; hasta?: string }, fase: Fase, t: number, lineal = false,
): { a: Punto; b: Punto; enFichaA: boolean; enFichaB: boolean } {
  const pa = a.desde ? posicionEn(fase, a.desde, t, lineal) : undefined;
  const pb = a.hasta ? posicionEn(fase, a.hasta, t, lineal) : undefined;
  return { a: pa ?? a.a, b: pb ?? a.b, enFichaA: Boolean(pa), enFichaB: Boolean(pb) };
}

/** Los puntos de la línea de un bloque en el instante `t`, en el orden en que se leen. */
export function lineaDeBloque(a: { fichas: string[] }, fase: Fase, t: number, lineal = false): Punto[] {
  return ordenarEnLinea(a.fichas.map((id) => posicionEn(fase, id, t, lineal)).filter((p): p is Punto => Boolean(p)));
}

/**
 * La sombra de un bloque: hasta la línea de fondo de la portería que
 * defienden (los nuestros defienden la de la izquierda) o un contorno
 * alrededor de todos. Vacía si solo lleva la línea.
 */
export function sombraDeBloque(a: { fichas: string[]; relleno: RellenoBloque }, jugada: Jugada, fase: Fase, t: number, lineal = false): Punto[] {
  const linea = lineaDeBloque(a, fase, t, lineal);
  if (!linea.length || a.relleno === "linea") return [];
  if (a.relleno === "cerrado") return contornoHolgado(linea, 1.6);
  const equipo = jugada.fichas.find((f) => f.id === a.fichas[0])?.equipo ?? "local";
  const fondo = equipo === "local" ? -MEDIO_LARGO : MEDIO_LARGO;
  // Una línea de lado a lado se cierra contra el fondo; una a lo largo, contra su banda más cercana.
  const xs = linea.map((p) => p.x), zs = linea.map((p) => p.z);
  const deLado = Math.max(...zs) - Math.min(...zs) >= Math.max(...xs) - Math.min(...xs);
  if (deLado) return [...linea, { x: fondo, z: linea[linea.length - 1].z }, { x: fondo, z: linea[0].z }];
  const banda = zs.reduce((s, z) => s + z, 0) / zs.length >= 0 ? CAMPO.ancho / 2 : -CAMPO.ancho / 2;
  return [...linea, { x: linea[linea.length - 1].x, z: banda }, { x: linea[0].x, z: banda }];
}

/** Los puntos de una flecha con su curva, en metros, de `a` a `b`. */
export function puntosDeFlecha(a: Punto, b: Punto, curva = 0, pasos = 24): Punto[] {
  if (!curva) return [a, b];
  return Array.from({ length: pasos + 1 }, (_, k) => enCurva(a, b, curva, k / pasos));
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

// ---- El material de entrenamiento ----------------------------------------------------------

export const datosDeMaterial = (tipo: TipoMaterial) => MATERIALES.find((m) => m.id === tipo) ?? MATERIALES[0];

export const agregarMaterial = (jugada: Jugada, indice: number, piezas: Material[]) =>
  conFase(jugada, indice, (f) => ({ ...f, material: [...(f.material ?? []), ...piezas.map((m) => ({ ...m, p: limitarMaterial(m.p) }))] }));

export const moverMaterial = (jugada: Jugada, indice: number, id: string, p: Punto) =>
  conFase(jugada, indice, (f) => ({ ...f, material: (f.material ?? []).map((m) => (m.id === id ? { ...m, p: limitarMaterial(p) } : m)) }));

export const cambiarMaterial = (jugada: Jugada, indice: number, id: string, cambios: Partial<Pick<Material, "tipo" | "giro" | "color">>) =>
  conFase(jugada, indice, (f) => ({ ...f, material: (f.material ?? []).map((m) => (m.id === id ? { ...m, ...cambios, giro: normalizarGiro(cambios.giro ?? m.giro) } : m)) }));

export const quitarMaterial = (jugada: Jugada, indice: number, id: string) =>
  conFase(jugada, indice, (f) => ({ ...f, material: (f.material ?? []).filter((m) => m.id !== id) }));

/** El material se puede poner algo fuera de las líneas: una portería, un cono de banda. */
const limitarMaterial = (p: Punto): Punto => ({ x: Math.max(-CAMPO.largo / 2 - 4, Math.min(CAMPO.largo / 2 + 4, p.x)), z: Math.max(-CAMPO.ancho / 2 - 4, Math.min(CAMPO.ancho / 2 + 4, p.z)) });
const normalizarGiro = (grados: number) => ((Math.round(grados) % 360) + 360) % 360;

/** La pieza que hay bajo `p`, si hay alguna: la más cercana dentro de su tamaño. */
export function materialCerca(fase: Fase, p: Punto): string | null {
  let mejor: string | null = null, menor = Infinity;
  for (const m of fase.material ?? []) {
    const { largo, ancho } = datosDeMaterial(m.tipo);
    const d = distancia(m.p, p);
    if (d < Math.max(1, Math.max(largo, ancho) / 2 + 0.3) && d < menor) { mejor = m.id; menor = d; }
  }
  return mejor;
}

/**
 * Las piezas para arrastrar de `a` a `b`: una cada `separacion` metros, giradas
 * en el sentido de la fila (una escalera queda a lo largo; una valla, cruzada).
 * En slalom, se alternan a un lado y a otro de la línea.
 */
export function filaDeMaterial(tipo: TipoMaterial, a: Punto, b: Punto, separacion: number, slalom: boolean, color: string): Material[] {
  const largo = distancia(a, b);
  const paso = Math.max(0.5, separacion);
  const cuantas = largo < paso / 2 ? 1 : Math.min(30, Math.floor(largo / paso) + 1);
  const ux = largo ? (b.x - a.x) / largo : 1, uz = largo ? (b.z - a.z) / largo : 0;
  const giro = largo ? normalizarGiro((Math.atan2(uz, ux) * 180) / Math.PI) : 0;
  return Array.from({ length: cuantas }, (_, k) => {
    const lado = slalom && cuantas > 1 ? (k % 2 ? 1 : -1) * 0.8 : 0;
    return { id: nuevoId("m"), tipo, giro, color, p: { x: a.x + ux * paso * k - uz * lado, z: a.z + uz * paso * k + ux * lado } };
  });
}

/**
 * Lleva una fase un puesto antes (-1) o después (+1). Las posiciones no se
 * tocan: cada fase guarda su propia pose, y la animación sale de comparar
 * cada una con la anterior, así que basta con cambiar el orden.
 */
export function moverFase(jugada: Jugada, indice: number, paso: -1 | 1): Jugada {
  const destino = indice + paso;
  if (destino < 0 || destino >= jugada.fases.length) return jugada;
  const fases = [...jugada.fases];
  [fases[indice], fases[destino]] = [fases[destino], fases[indice]];
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
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, duracion: Math.max(0.2, Math.min(15, segundos)) } : f)) });

export const cambiarPausa = (jugada: Jugada, indice: number, segundos: number) =>
  ({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, pausa: Math.max(0, Math.min(6, segundos)) } : f)) });

/** Lo que ocupa una fase en la película: la pausa en su pose y el movimiento. */
const largoDe = (f: Fase) => f.pausa + f.duracion;

export const duracionTotal = (jugada: Jugada) => jugada.fases.reduce((s, f) => s + largoDe(f), 0);

/** El segundo de la jugada en que empieza la fase `indice`. */
export const inicioDeFase = (jugada: Jugada, indice: number) => jugada.fases.slice(0, indice).reduce((s, f) => s + largoDe(f), 0);

/**
 * En qué fase y en qué punto de su movimiento cae el segundo `s` de la
 * jugada entera. Durante la pausa de una fase, `t` es 0: la pose quieta.
 */
export function instanteEn(jugada: Jugada, s: number): { fase: number; t: number } {
  let resto = Math.max(0, s);
  for (let i = 0; i < jugada.fases.length; i += 1) {
    const f = jugada.fases[i];
    if (resto < largoDe(f) || i === jugada.fases.length - 1) {
      const enMovimiento = resto - f.pausa;
      return { fase: i, t: enMovimiento <= 0 ? 0 : f.duracion > 0 ? Math.min(1, enMovimiento / f.duracion) : 1 };
    }
    resto -= largoDe(f);
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

/** La anotación que se toca en `p`: la última dibujada gana, como en cualquier editor. */
export function anotacionCerca(fase: Fase, p: Punto, tolerancia = 1.2, ocultas: Capa[] = []): string | null {
  for (let i = fase.anotaciones.length - 1; i >= 0; i -= 1) {
    const a = fase.anotaciones[i];
    if (ocultas.includes(capaDe(a))) continue;
    if (a.tipo === "texto" || a.tipo === "etiqueta") {
      if (distancia(a.a, p) <= tolerancia * 2.5) return a.id;
    } else if (a.tipo === "flecha") {
      const e = extremosDe(a, fase, 0);
      if (aPolilinea(p, puntosDeFlecha(e.a, e.b, a.curva)) <= tolerancia) return a.id;
    } else if (a.tipo === "medida") {
      const e = extremosDe(a, fase, 0);
      if (aSegmento(p, e.a, e.b) <= tolerancia) return a.id;
    } else if (a.tipo === "trazo") {
      if (aPolilinea(p, a.puntos) <= tolerancia) return a.id;
    } else if (a.tipo === "bloque") {
      // Se toca por su línea, no por su sombra: así no tapa a los jugadores que hay dentro.
      if (aPolilinea(p, lineaDeBloque(a, fase, 0)) <= tolerancia) return a.id;
    } else if (a.tipo === "rect" || a.tipo === "zona") {
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
type DefFase = { nombre: string; nota?: string; carreras?: Record<string, [number, number, number?]>; pase?: [number, number, Pase["tipo"]]; anotaciones?: Anotacion[] };
type DefJugada = { local: Sitio[]; rival: Sitio[]; balon: [number, number]; fases: DefFase[]; material?: Array<[TipoMaterial, number, number, number?]> };

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
    { nombre: "Preparación", nota: "El 3 se pone delante del zonal del primer palo; el 7 arrastra a su marca.", carreras: { L3: [46.8, 6.2], L7: [38.5, 5], R3: [39.5, 6.8] } },
    {
      nombre: "Ataque de zonas",
      nota: "Primer palo, punto de penalti y segundo palo a la vez: el envío va al 9 en el centro.",
      carreras: { L4: [47.8, 3.6, -2], L9: [46.3, -0.3, 2], L5: [48.4, -4.8], L7: [44.2, 9.5], L8: [36.5, 2], R3: [46.4, 4.4], R8: [45.2, -0.9], R7: [47, -5.4] },
      pase: [46.3, -0.3, "aereo"],
    },
    { nombre: "Finalización", nota: "Remate al palo largo; el 8 cierra el rechace en la frontal.", carreras: { L8: [41, 1.5], L9: [47.4, -0.8], R1: [51.9, -1.2] }, pase: [52.7, -2.4, "raso"] },
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

/** Un rondo en un cuadrado de 20 × 20 en el círculo central: cuatro fuera, dos dentro. */
const RONDO: DefJugada = {
  balon: [-9.2, 0.5],
  material: [["seta", -10, -10], ["seta", 10, -10], ["seta", 10, 10], ["seta", -10, 10]],
  local: [["1", "Apoyo", -10.5, 0], ["2", "Apoyo", 0, -10.5], ["3", "Apoyo", 10.5, 0], ["4", "Apoyo", 0, 10.5]],
  rival: [["1", "Presión", -3, 1.5], ["2", "Cobertura", 2.5, -1.5]],
  fases: [
    {
      nombre: "Circular",
      nota: "Pase al compañero libre; el primero presiona, el segundo tapa la línea de pase interior.",
      anotaciones: [{ id: "rejilla", tipo: "rect", a: { x: -10, z: -10 }, b: { x: 10, z: 10 }, color: "#e8e8ed", estilo: "borde" }],
      carreras: { R1: [-3.5, -5], R2: [4, 2] },
      pase: [-0.6, -9.3, "raso"],
    },
    {
      nombre: "Cambio de orientación",
      nota: "Cuando se cierran por un lado, el balón cruza al apoyo opuesto.",
      anotaciones: [{ id: "rejilla2", tipo: "rect", a: { x: -10, z: -10 }, b: { x: 10, z: 10 }, color: "#e8e8ed", estilo: "borde" }],
      carreras: { R1: [3, -6], R2: [6.5, 0.5] },
      pase: [9.3, 0.4, "raso"],
    },
  ],
};

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
  rondo: RONDO,
  partido: PIZARRA_LIBRE,
  libre: PIZARRA_LIBRE,
};

const CATEGORIA_DE_TIPO: Record<TipoABP, Categoria> = {
  corner_der: "abp", corner_izq: "abp", falta_frontal: "abp", falta_lateral: "abp", banda: "abp",
  salida: "salida", rondo: "entrenamiento", partido: "ataque", libre: "libre",
};
const ENCUADRE_DE_TIPO: Record<TipoABP, Encuadre> = {
  corner_der: "su_area", corner_izq: "su_area", falta_frontal: "su_area", falta_lateral: "su_area", banda: "su_mitad",
  salida: "nuestra_mitad", rondo: "centro", partido: "campo", libre: "campo",
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
  const material: Material[] = (def.material ?? []).map(([tipo, x, z, giro]) => ({ id: nuevoId("m"), tipo, p: { x, z }, giro: giro ?? 0, color: datosDeMaterial(tipo).color }));
  const fases: Fase[] = def.fases.map((d) => {
    const fase: Fase = {
      id: nuevoId("f"),
      nombre: d.nombre,
      pos,
      balon,
      carreras: Object.entries(d.carreras ?? {}).map(([fichaId, [x, z, curva]]) => ({ fichaId, hasta: { x, z }, curva: curva ?? 0 })),
      pase: d.pase ? { hasta: { x: d.pase[0], z: d.pase[1] }, tipo: d.pase[2] } : null,
      anotaciones: (d.anotaciones ?? []).map((a) => ({ ...a, id: nuevoId("a") })),
      material: material.map((m) => ({ ...m, p: { ...m.p } })),
      pausa: PAUSA_POR_DEFECTO,
      duracion: DURACION_POR_DEFECTO,
      nota: d.nota ?? "",
    };
    const siguiente = faseSiguiente(fase, "");
    pos = siguiente.pos;
    balon = siguiente.balon;
    return fase;
  });
  return {
    id: nuevoId("j"), nombre: nombreDeTipo(tipo), tipo, categoria: CATEGORIA_DE_TIPO[tipo] ?? "libre",
    colores: { ...COLORES_POR_DEFECTO }, ambiente: { ...AMBIENTE_POR_DEFECTO, encuadre: ENCUADRE_DE_TIPO[tipo] ?? "campo" },
    fichas, fases, actualizada: Date.now(),
  };
}

// ---- Sistemas de partido: dos dibujos frente a frente ------------------------------------

/** Los dibujos que se pueden poner, los de la pizarra del partido. */
export const FORMACIONES = Object.keys(DIBUJOS);
/** "4231" se lee "4-2-3-1". */
export const nombreDeFormacion = (codigo: string) => codigo.split("").join("-");

/** El rótulo corto de cada puesto, en español; el inglés sale de `deSerie`. */
const PUESTO: Record<string, string> = {
  GK: "POR", LB: "LI", RB: "LD", LCB: "DFC", CB: "DFC", RCB: "DFC", LWB: "CAI", RWB: "CAD",
  LDMF: "MCD", DMF: "MCD", RDMF: "MCD", LCMF: "MC", CMF: "MC", RCMF: "MC", LM: "MI", RM: "MD",
  LAMF: "MP", AMF: "MP", RAMF: "MP", LW: "EI", RW: "ED", SS: "SD", LCF: "DC", CF: "DC", RCF: "DC",
};
/** Los dorsales de toda la vida, por puesto; si ya está cogido, el siguiente libre. */
const DORSAL_DE_PUESTO: Record<string, number[]> = {
  GK: [1], RB: [2], RWB: [2], LB: [3], LWB: [3], LCB: [4, 6], CB: [5, 4, 6], RCB: [5, 6], DMF: [6, 5, 8], LDMF: [6, 5], RDMF: [8, 5],
  LCMF: [8, 6, 10], CMF: [8, 6], RCMF: [10, 8, 6], LM: [11, 7], RM: [7, 11], LAMF: [10, 11], AMF: [10, 8], RAMF: [7, 10],
  LW: [11, 7], RW: [7, 11], SS: [10, 9], LCF: [9, 11], CF: [9], RCF: [10, 9],
};

function onceDe(puestos: string[]) {
  const usados = new Set<number>();
  return puestos.map((codigo) => {
    const preferidos = DORSAL_DE_PUESTO[codigo] ?? [];
    let n = preferidos.find((d) => !usados.has(d));
    if (n === undefined) { n = 2; while (usados.has(n)) n += 1; }
    usados.add(n);
    return { codigo, dorsal: String(n), rol: PUESTO[codigo] ?? codigo };
  });
}

/**
 * Dos once frente a frente con sus dibujos. Los sitios salen de la pizarra
 * del partido (lib/pizarra.ts): profundidad desde la propia portería y ancho;
 * nosotros atacamos hacia +x, ellos hacia −x, y los dos dibujos se encajan
 * como en un partido: sus puntas caen sobre nuestros centrales.
 */
export function sistemaDePartido(propia: string, rival: string, balon: "nuestro" | "suyo", categoria: Categoria): Jugada {
  const ponerLado = (codigo: string, equipo: Equipo) => {
    const once = onceDe(DIBUJOS[codigo] ?? DIBUJOS["433"]);
    return once.map(({ codigo: puesto, dorsal, rol }) => {
      const [hondo, ancho] = SITIO[puesto] ?? [50, 40];
      // Profundidad 0–100 a lo largo del campo; el portero, un metro y medio dentro de su línea.
      const x = -MEDIO_LARGO + 1.5 + (hondo / 100) * (CAMPO.largo - 3);
      const z = (ancho / 80) * CAMPO.ancho - CAMPO.ancho / 2;
      return { id: `${equipo === "local" ? "L" : "R"}${dorsal}`, equipo, dorsal, rol, sitio: equipo === "local" ? { x, z } : { x: -x, z: -z } };
    });
  };
  const todos = [...ponerLado(propia, "local"), ...ponerLado(rival, "rival")];
  const pos = Object.fromEntries(todos.map((f) => [f.id, f.sitio]));
  const portero = todos.find((f) => f.equipo === (balon === "nuestro" ? "local" : "rival") && f.rol === "POR");
  const balonEn = portero ? { x: portero.sitio.x + (balon === "nuestro" ? 1.2 : -1.2), z: portero.sitio.z + 0.6 } : { x: 0, z: 0 };
  return {
    id: nuevoId("j"),
    nombre: `${nombreDeFormacion(propia)} vs ${nombreDeFormacion(rival)}`,
    tipo: "partido",
    categoria,
    colores: { ...COLORES_POR_DEFECTO },
    // Como en una pizarra de análisis: la ficha dice el puesto.
    ambiente: { ...AMBIENTE_POR_DEFECTO, fichas: "puesto" },
    fichas: todos.map(({ id, equipo, dorsal, rol }) => ({ id, equipo, dorsal, rol })),
    fases: [{ id: nuevoId("f"), nombre: "Fase 1", pos, balon: balonEn, carreras: [], pase: null, anotaciones: [], pausa: PAUSA_POR_DEFECTO, duracion: DURACION_POR_DEFECTO, nota: "" }],
    actualizada: Date.now(),
  };
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

function materialValido(v: unknown): Material | null {
  const m = v as Record<string, unknown>;
  if (!m || typeof m.id !== "string" || !esPunto(m.p) || !MATERIALES.some((x) => x.id === m.tipo)) return null;
  const tipo = m.tipo as TipoMaterial;
  return { id: m.id, tipo, p: limitarMaterial(m.p), giro: esNumero(m.giro) ? normalizarGiro(m.giro) : 0, color: color(m.color, datosDeMaterial(tipo).color) };
}

function equipacionValida(v: unknown): Equipacion {
  const e = v as Record<string, unknown> | undefined;
  if (!e) return EQUIPACION_LISA;
  return {
    patron: PATRONES.some((x) => x.id === e.patron) ? e.patron as Patron : "liso",
    secundario: color(e.secundario, EQUIPACION_LISA.secundario),
    ribete: e.ribete === true,
    dorsal: e.dorsal === "blanco" || e.dorsal === "negro" ? e.dorsal : "auto",
  };
}

const ESTILOS_FLECHA: EstiloFlecha[] = ["continua", "discontinua", "punteada", "ondulada", "linea", "presion"];
const EXTREMOS: Extremo[] = ["punta", "doble", "barra", "nada"];
const GROSORES: Grosor[] = ["fino", "normal", "grueso"];
const CAPAS: Capa[] = ["recorridos", "flechas", "zonas", "textos", "medidas"];
const uno = <T extends string>(v: unknown, lista: T[]): T | undefined => (lista.includes(v as T) ? v as T : undefined);
const idDeFicha = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 40) : undefined);

function anotacionValida(v: unknown): Anotacion | null {
  const a = v as Record<string, unknown>;
  if (!a || typeof a.id !== "string") return null;
  const c = color(a.color, COLORES_POR_DEFECTO.anotacion);
  if (a.tipo === "bloque") {
    const fichas = Array.isArray(a.fichas) ? (a.fichas as unknown[]).map(idDeFicha).filter((x): x is string => Boolean(x)).slice(0, 22) : [];
    return fichas.length ? { id: a.id, tipo: "bloque", fichas, color: c, relleno: uno(a.relleno, ["atras", "cerrado", "linea"] as RellenoBloque[]) ?? "atras" } : null;
  }
  if (a.tipo === "trazo") {
    const puntos = Array.isArray(a.puntos) ? (a.puntos as unknown[]).filter(esPunto).map(limitar).slice(0, 600) : [];
    return puntos.length >= 2 ? { id: a.id, tipo: "trazo", puntos, color: c, grosor: uno(a.grosor, GROSORES), punta: a.punta === true } : null;
  }
  if (!esPunto(a.a)) return null;
  if (a.tipo === "texto" || a.tipo === "etiqueta") return { id: a.id, tipo: a.tipo, a: a.a, texto: texto(a.texto), color: c };
  if (!esPunto(a.b)) return null;
  const pegada = { ...(idDeFicha(a.desde) ? { desde: idDeFicha(a.desde) } : {}), ...(idDeFicha(a.hasta) ? { hasta: idDeFicha(a.hasta) } : {}) };
  if (a.tipo === "medida") return { id: a.id, tipo: "medida", a: a.a, b: a.b, color: c, ...pegada };
  if (a.tipo === "flecha") {
    const extremo = uno(a.extremo, EXTREMOS), grosor = uno(a.grosor, GROSORES);
    return {
      id: a.id, tipo: "flecha", a: a.a, b: a.b, color: c, estilo: uno(a.estilo, ESTILOS_FLECHA) ?? "continua",
      ...(extremo ? { extremo } : {}), ...(grosor ? { grosor } : {}),
      ...(esNumero(a.curva) && a.curva ? { curva: Math.max(-20, Math.min(20, a.curva)) } : {}),
      ...pegada,
    };
  }
  if (a.tipo === "rect" || a.tipo === "zona") {
    const estilo = a.estilo === "rayas" || a.estilo === "borde" || a.estilo === "foco" ? a.estilo : "translucida";
    return { id: a.id, tipo: a.tipo, a: a.a, b: a.b, color: c, estilo };
  }
  return null;
}

export function jugadaValida(v: unknown): Jugada | null {
  const j = v as Record<string, unknown>;
  if (!j || typeof j.id !== "string" || !Array.isArray(j.fichas) || !Array.isArray(j.fases) || j.fases.length === 0) return null;
  const fichas: Ficha[] = (j.fichas as Array<Record<string, unknown>>)
    .filter((f) => f && typeof f.id === "string" && (f.equipo === "local" || f.equipo === "rival"))
    .map((f) => ({
      id: f.id as string, equipo: f.equipo as Equipo, dorsal: texto(f.dorsal).slice(0, 3), rol: texto(f.rol).slice(0, 24),
      ...(typeof f.nombre === "string" && f.nombre.trim() ? { nombre: f.nombre.trim().slice(0, 24) } : {}),
    }));
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
      material: Array.isArray(bruta.material) ? (bruta.material as unknown[]).map(materialValido).filter((m): m is Material => m !== null).slice(0, 200) : [],
      pausa: esNumero(bruta.pausa) ? Math.max(0, Math.min(6, bruta.pausa)) : PAUSA_POR_DEFECTO,
      duracion: esNumero(bruta.duracion) ? Math.max(0.2, Math.min(15, bruta.duracion)) : DURACION_POR_DEFECTO,
      nota: typeof bruta.nota === "string" ? bruta.nota.slice(0, 160) : "",
    });
  }
  const colores = (j.colores ?? {}) as Record<string, unknown>;
  const ambiente = (j.ambiente ?? {}) as Record<string, unknown>;
  const tipo = TIPOS_ABP.some((x) => x.id === j.tipo) || j.tipo === "partido" ? j.tipo as TipoABP : "libre";
  const elegir = <T extends string>(v: unknown, lista: Array<{ id: T }>, respaldo: T) => (lista.some((x) => x.id === v) ? v as T : respaldo);
  return {
    id: j.id,
    nombre: texto(j.nombre, nombreDeTipo(tipo)),
    tipo,
    // Lo guardado antes de que hubiera categorías y ambiente se abre como estaba: noche, con estadio.
    categoria: elegir(j.categoria, CATEGORIAS, CATEGORIA_DE_TIPO[tipo] ?? "libre"),
    ambiente: {
      superficie: elegir(ambiente.superficie, SUPERFICIES, AMBIENTE_POR_DEFECTO.superficie),
      estadio: typeof ambiente.estadio === "boolean" ? ambiente.estadio : AMBIENTE_POR_DEFECTO.estadio,
      zonas: elegir(ambiente.zonas, ZONAS, AMBIENTE_POR_DEFECTO.zonas),
      encuadre: elegir(ambiente.encuadre, ENCUADRES, AMBIENTE_POR_DEFECTO.encuadre),
      // Lo guardado antes del tablero 2D se hizo en 3D: así se abre.
      dimension: ambiente.dimension === "2d" ? "2d" : "3d",
      orientacion: ambiente.orientacion === "vertical" ? "vertical" : "horizontal",
      fichas: ambiente.fichas === "puesto" ? "puesto" : "dorsal",
      suavizado: ambiente.suavizado === "lineal" ? "lineal" : "suave",
      estelas: typeof ambiente.estelas === "boolean" ? ambiente.estelas : true,
      ...(Array.isArray(ambiente.ocultas) ? { ocultas: CAPAS.filter((c) => (ambiente.ocultas as unknown[]).includes(c)) } : {}),
    },
    actualizada: esNumero(j.actualizada) ? j.actualizada : 0,
    colores: {
      local: colores.local === null ? null : color(colores.local, "") || null,
      rival: color(colores.rival, COLORES_POR_DEFECTO.rival),
      anotacion: color(colores.anotacion, COLORES_POR_DEFECTO.anotacion),
    },
    ...(j.equipaciones && typeof j.equipaciones === "object"
      ? { equipaciones: { local: equipacionValida((j.equipaciones as Record<string, unknown>).local), rival: equipacionValida((j.equipaciones as Record<string, unknown>).rival) } }
      : {}),
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
