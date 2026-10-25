/**
 * La biblioteca del estudio: sistemas ya dibujados, por temas, para abrir,
 * mirar cómo se mueven y usar de base. Ordenada como las bibliotecas de las
 * pizarras de análisis —defensa, salida, presión, ataque y balón parado—,
 * cada sistema contesta una pregunta y va en el idioma de la pantalla.
 *
 * Los sistemas no se guardan hechos: se describen fase a fase (quién se mueve
 * a dónde, adónde va el balón y qué se marca) y se montan con las mismas
 * funciones del cuaderno, así que cada fase empieza donde acabó la anterior.
 * Coordenadas en metros: el campo va de -52,5 a 52,5 a lo largo (atacamos
 * hacia la derecha) y de -34 a 34 a lo ancho (+z, nuestra derecha).
 */

import {
  agregarFase, deSerie, fijarCarrera, fijarPase, nuevoId, plantilla, sistemaDePartido,
  type Ambiente, type Anotacion, type Categoria, type EstiloFlecha, type EstiloZona, type Jugada, type Pase, type Punto, type TipoABP,
} from "./abp.ts";

export type Idioma = "es" | "en";
type Texto = Record<Idioma, string>;
type Sitio = [number, number];

type Marca =
  | { tipo: "zona"; a: Sitio; b: Sitio; estilo: EstiloZona; color?: string }
  | { tipo: "flecha"; a: Sitio; b: Sitio; estilo: EstiloFlecha; color?: string }
  | { tipo: "texto" | "etiqueta"; en: Sitio; texto: Texto; color?: string };

type Paso = {
  nombre: Texto;
  nota: Texto;
  /** Adónde corre cada ficha durante esta fase (y, si se da, con qué curva). */
  mover?: Record<string, Sitio>;
  curvas?: Record<string, number>;
  /** Adónde va el balón, y si va por el suelo o por el aire. */
  pase?: [number, number, Pase["tipo"]];
  marcas?: Marca[];
  duracion?: number;
  pausa?: number;
};

export type SistemaDeBiblioteca = {
  id: string;
  tema: Categoria;
  titulo: Texto;
  pregunta: Texto;
  /** De dónde sale: dos dibujos frente a frente o una plantilla de balón parado. */
  base: { propia: string; rival: string; balon: "nuestro" | "suyo" } | { plantilla: TipoABP };
  /** Dónde está cada ficha al empezar, si no es donde la pone su dibujo. */
  colocar?: Record<string, Sitio>;
  balon?: Sitio;
  ambiente?: Partial<Ambiente>;
  pasos: Paso[];
};

export const TEMAS: Array<{ id: Categoria; nombre: Texto; descripcion: Texto }> = [
  { id: "defensa", nombre: { es: "Defensa", en: "Defending" }, descripcion: { es: "Mantener la forma cuando el balón se mueve: líneas, distancias y quién se ocupa de qué.", en: "Keeping the shape while the ball moves: lines, distances and who deals with what." } },
  { id: "salida", nombre: { es: "Salida", en: "Build-up" }, descripcion: { es: "Llevar el balón desde el portero hasta campo rival sin perderlo.", en: "Taking the ball from the goalkeeper into the other half without losing it." } },
  { id: "presion", nombre: { es: "Presión", en: "Pressing" }, descripcion: { es: "Recuperar el balón a propósito: señales, trampas y lo que cuesta fallar.", en: "Winning the ball back on purpose: triggers, traps and the price of getting it wrong." } },
  { id: "ataque", nombre: { es: "Ataque", en: "Attacking" }, descripcion: { es: "Crear espacio y usarlo en el último tercio contra una defensa ordenada.", en: "Creating space and using it in the final third against a set defence." } },
  { id: "abp", nombre: { es: "Balón parado", en: "Set pieces" }, descripcion: { es: "Jugadas a balón parado y cómo se defienden.", en: "Dead-ball routines and how they are defended." } },
];

const CORAL = "#ff8172";

export const BIBLIOTECA: SistemaDeBiblioteca[] = [
  {
    id: "linea-de-cuatro",
    tema: "defensa",
    titulo: { es: "Bascular en línea de cuatro", en: "Shifting as a back four" },
    pregunta: { es: "¿Cómo se mueve una línea de cuatro cuando el balón cambia de lado?", en: "How does a back four move when the ball changes sides?" },
    base: { propia: "442", rival: "433", balon: "suyo" },
    colocar: {
      L1: [-50, 0], L3: [-30, -22], L4: [-32, -8], L5: [-32, 8], L2: [-30, 22], L11: [-15, -21], L8: [-17, -7], L10: [-17, 7], L7: [-15, 21], L9: [-2, -6], L6: [-2, 6],
      R1: [50, 0], R2: [2, -29], R3: [2, 29], R5: [14, -10], R4: [14, 10], R6: [0, 0], R10: [-9, -11], R8: [-9, 11], R7: [-21, -27], R11: [-21, 27], R9: [-27, 2],
    },
    balon: [-20, -26],
    ambiente: { encuadre: "nuestra_mitad" },
    pasos: [
      {
        nombre: { es: "El balón, en su banda", en: "Ball on their flank" },
        nota: { es: "La línea bascula: el lateral sale y los centrales cierran por dentro.", en: "The line shifts: the full back steps out and the centre backs tuck in." },
        mover: { L3: [-27, -24], L4: [-31, -13], L5: [-31, -2], L2: [-30, 10], L11: [-19, -22], L8: [-19, -11], L10: [-19, 1], L7: [-17, 13], L9: [-6, -9], L6: [-6, 3] },
        marcas: [{ tipo: "flecha", a: [-29, -22], b: [-22, -26], estilo: "presion" }, { tipo: "etiqueta", en: [-37, -4], texto: { es: "Cerrar dentro", en: "Tuck in" } }],
      },
      {
        nombre: { es: "Cambio de orientación", en: "Switch of play" },
        nota: { es: "Mientras el balón viaja, toda la línea se desplaza a la vez.", en: "While the ball travels, the whole line moves together." },
        pase: [-20, 26, "aereo"],
        mover: { L2: [-27, 23], L5: [-31, 12], L4: [-31, 1], L3: [-30, -10], L7: [-19, 21], L10: [-19, 10], L8: [-19, -1], L11: [-17, -12], L9: [-6, -2], L6: [-6, 8] },
        marcas: [{ tipo: "texto", en: [-40, 0], texto: { es: "Juntos", en: "Together" }, color: CORAL }],
      },
      {
        nombre: { es: "Balón atrás: la línea sube", en: "Ball goes back: the line steps up" },
        nota: { es: "Pase atrás del rival: la línea sube y deja al 9 en fuera de juego.", en: "Back pass: the line steps up and leaves the 9 offside." },
        pase: [-9, 12, "raso"],
        mover: { L3: [-24, -9], L4: [-25, 0], L5: [-25, 11], L2: [-22, 21], L7: [-12, 20], L10: [-13, 10], L8: [-13, -1], L11: [-11, -11], L9: [0, -1], L6: [0, 9] },
        marcas: [{ tipo: "flecha", a: [-25, -30], b: [-25, 30], estilo: "linea" }, { tipo: "etiqueta", en: [-31, 6], texto: { es: "Fuera de juego", en: "Offside" } }],
      },
    ],
  },
  {
    id: "bloque-medio-442",
    tema: "defensa",
    titulo: { es: "El bloque medio 4-4-2", en: "The 4-4-2 mid-block" },
    pregunta: { es: "¿Cómo cierra un 4-4-2 el centro sin presionar arriba?", en: "How does a 4-4-2 shut the middle without pressing high?" },
    base: { propia: "442", rival: "4231", balon: "suyo" },
    colocar: {
      L1: [-46, 0], L3: [-22, -20], L4: [-24, -7], L5: [-24, 7], L2: [-22, 20], L11: [-8, -20], L8: [-10, -7], L10: [-10, 7], L7: [-8, 20], L9: [6, -6], L6: [6, 6],
      R1: [49, 0], R5: [28, -12], R4: [28, 12], R2: [18, -30], R3: [18, 30], R8: [14, -6], R6: [14, 6], R10: [0, 0], R7: [-6, -26], R11: [-6, 26], R9: [-14, 2],
    },
    balon: [27, -12],
    pasos: [
      {
        nombre: { es: "Cerrar el centro", en: "Close the middle" },
        nota: { es: "Los dos puntas tapan a los mediocentros: solo quedan las bandas.", en: "The front two screen the pivots: only the flanks are left open." },
        mover: { L9: [10, -7], L6: [10, 5] },
        marcas: [{ tipo: "zona", a: [-26, -22], b: [-6, 22], estilo: "translucida" }, { tipo: "etiqueta", en: [-16, 0], texto: { es: "Compactos", en: "Compact" } }],
        duracion: 1.6,
      },
      {
        nombre: { es: "Pase al lateral: salta el bloque", en: "Pass to the full back: the block jumps" },
        nota: { es: "El pase a la banda es la señal: salta el extremo y el 9 corta la vuelta.", en: "The pass wide is the cue: the wide man jumps and the 9 cuts the way back." },
        pase: [18, -30, "raso"],
        mover: { L11: [12, -26], L9: [16, -14], L8: [6, -12], L3: [-12, -24], L4: [-22, -12], L5: [-22, 1], L2: [-20, 14], L10: [-6, -2], L7: [-4, 14], L6: [8, -2] },
        curvas: { L11: 4 },
        marcas: [{ tipo: "zona", a: [0, -34], b: [30, -12], estilo: "foco" }],
      },
      {
        nombre: { es: "La trampa se cierra", en: "The trap closes" },
        nota: { es: "Sin pase fácil, el balón va por dentro y el mediocentro lo roba.", en: "With no easy pass, it goes inside and the midfielder wins it." },
        pase: [8, -14, "raso"],
        mover: { L8: [8, -14] },
        marcas: [{ tipo: "texto", en: [2, -21], texto: { es: "Robo", en: "Won" }, color: CORAL }],
      },
    ],
  },
  {
    id: "salida-lavolpiana",
    tema: "salida",
    titulo: { es: "La salida lavolpiana", en: "The salida lavolpiana" },
    pregunta: { es: "¿Cómo se supera una presión de dos delanteros al salir desde atrás?", en: "How do you beat a two-striker press when building from the back?" },
    base: { propia: "433", rival: "442", balon: "nuestro" },
    colocar: {
      L1: [-50, 0], L4: [-38, -10], L5: [-38, 10], L6: [-28, 0], L3: [-30, -26], L2: [-30, 26], L8: [-14, -12], L10: [-14, 12], L11: [8, -28], L9: [14, 0], L7: [8, 28],
      R1: [50, 0], R6: [-30, -6], R9: [-30, 6], R7: [-16, -24], R11: [-16, 24], R10: [-10, -8], R8: [-10, 8], R2: [12, -24], R3: [12, 24], R5: [18, -9], R4: [18, 9],
    },
    balon: [-48.5, 0.6],
    ambiente: { encuadre: "nuestra_mitad" },
    pasos: [
      {
        nombre: { es: "Dos contra dos atrás", en: "Two against two at the back" },
        nota: { es: "Sus dos puntas aprietan a nuestros dos centrales: así no se sale.", en: "Their front two press our two centre backs: you cannot build like this." },
        marcas: [{ tipo: "texto", en: [-34, 0], texto: { es: "2 v 2", en: "2 v 2" }, color: CORAL }],
        duracion: 1,
      },
      {
        nombre: { es: "El 6 baja entre centrales", en: "The 6 drops between the centre backs" },
        nota: { es: "El mediocentro baja, los centrales se abren y los laterales suben: 3 v 2.", en: "The midfielder drops, the centre backs split and the full backs push on: 3 v 2." },
        mover: { L6: [-39, 0], L4: [-37, -18], L5: [-37, 18], L3: [-20, -30], L2: [-20, 30], L8: [-18, -12], L10: [-18, 12] },
        marcas: [{ tipo: "texto", en: [-44, -10], texto: { es: "3 v 2", en: "3 v 2" }, color: CORAL }],
      },
      {
        nombre: { es: "Al central que queda libre", en: "To the free centre back" },
        nota: { es: "El portero juega con el central que queda libre por fuera.", en: "The keeper finds the centre back left free on the outside." },
        pase: [-37, -18, "raso"],
        duracion: 1.4,
      },
      {
        nombre: { es: "Conduce y supera la primera línea", en: "Carry past the first line" },
        nota: { es: "Conduce hacia dentro: el punta llega tarde y la primera línea ya está atrás.", en: "He carries inside: the striker is late and the first line is beaten." },
        pase: [-23, -16, "raso"],
        mover: { L4: [-24, -16], R6: [-28, -12] },
        marcas: [{ tipo: "flecha", a: [-36, -18], b: [-25, -16], estilo: "ondulada", color: "#ffffff" }],
      },
    ],
  },
  {
    id: "tercer-hombre",
    tema: "salida",
    titulo: { es: "Salir ante una presión al hombre", en: "Playing out against a man-to-man press" },
    pregunta: { es: "¿Cómo se sale cuando el rival marca a cada uno?", en: "How do you play out when they mark every player?" },
    base: { propia: "433", rival: "433", balon: "nuestro" },
    colocar: {
      L1: [-50, 0], L4: [-38, -12], L5: [-38, 12], L3: [-30, -28], L2: [-30, 28], L6: [-26, 0], L8: [-16, -12], L10: [-16, 12], L11: [-2, -28], L9: [6, 0], L7: [-2, 28],
      R1: [50, 0], R7: [-35, -12], R11: [-35, 12], R9: [-23, 1], R10: [-13, -11], R8: [-13, 11], R2: [-27, -27], R3: [-27, 27], R6: [2, -26], R5: [9, -1], R4: [6, 20],
    },
    balon: [-48.5, 0.6],
    pasos: [
      {
        nombre: { es: "Todos marcados", en: "Everyone marked" },
        nota: { es: "Presión al hombre: cada uno tiene su par y el portero es el único libre.", en: "Man-to-man press: everyone has a marker and the keeper is the only free man." },
        marcas: [{ tipo: "etiqueta", en: [-45, -5], texto: { es: "Libre", en: "Free" } }],
        duracion: 1,
      },
      {
        nombre: { es: "El central recibe", en: "The centre back receives" },
        nota: { es: "El portero juega con el central; su par salta a apretarle.", en: "The keeper plays it to the centre back; his marker jumps on him." },
        pase: [-38, -12, "raso"],
        mover: { R7: [-36, -12] },
        duracion: 1.6,
      },
      {
        nombre: { es: "El interior baja a apoyar", en: "The 8 drops to support" },
        nota: { es: "El interior baja y arrastra a su par: deja un hueco detrás.", en: "The 8 drops and drags his marker with him: a gap opens behind." },
        pase: [-27, -16, "raso"],
        mover: { L8: [-27, -16], R10: [-24, -15] },
      },
      {
        nombre: { es: "El tercer hombre, de cara", en: "The third man, facing play" },
        nota: { es: "A un toque, al mediocentro que llega de cara al hueco que dejó el rival.", en: "First time, to the 6 arriving facing play in the gap the marker left." },
        pase: [-20, -8, "raso"],
        mover: { L6: [-20, -8], R9: [-23, -4] },
        curvas: { L6: -2 },
        marcas: [{ tipo: "etiqueta", en: [-15, -11], texto: { es: "De cara", en: "Facing" } }],
      },
      {
        nombre: { es: "Presión superada", en: "Press beaten" },
        nota: { es: "De cara y con tiempo, el balón llega al extremo a la espalda.", en: "Facing and with time, the ball reaches the winger in behind." },
        pase: [14, -24, "aereo"],
        mover: { L11: [14, -25] },
        curvas: { L11: 3 },
      },
    ],
  },
  {
    id: "trampa-en-banda",
    tema: "presion",
    titulo: { es: "La trampa en banda", en: "The touchline trap" },
    pregunta: { es: "¿Cómo se presiona sin perseguir el balón todo el partido?", en: "How do you press without chasing the ball all game?" },
    base: { propia: "433", rival: "4231", balon: "suyo" },
    colocar: {
      L1: [-40, 0], L9: [33, 2], L11: [30, -14], L7: [30, 14], L8: [18, -8], L10: [18, 8], L6: [10, 0], L3: [6, -22], L4: [-4, -8], L5: [-4, 8], L2: [6, 22],
      R1: [50, 0], R5: [38, -12], R4: [38, 12], R2: [30, -30], R3: [30, 30], R8: [24, -6], R6: [24, 6], R10: [8, 0], R7: [12, -26], R11: [12, 26], R9: [-2, 0],
    },
    balon: [37, -12],
    ambiente: { encuadre: "su_mitad" },
    pasos: [
      {
        nombre: { es: "Les dejamos la banda", en: "We leave them the flank" },
        nota: { es: "El 9 tapa el pase entre centrales y el extremo cierra por dentro.", en: "The 9 blocks the pass across and the winger tucks in." },
        mover: { L9: [35, -4], L11: [31, -16] },
        curvas: { L9: -3 },
        marcas: [{ tipo: "etiqueta", en: [34, -24], texto: { es: "Invitamos", en: "Bait" } }],
        duracion: 1.6,
      },
      {
        nombre: { es: "Salta la presión", en: "The press jumps" },
        nota: { es: "Pase a la banda = señal: extremo, interior y lateral saltan a la vez.", en: "Pass wide = trigger: winger, midfielder and full back jump together." },
        pase: [30, -30, "raso"],
        mover: { L11: [29, -27], L8: [25, -9], L9: [37, -15], L3: [14, -26], L6: [16, -4], L4: [2, -12] },
        curvas: { L11: 3, L9: 2 },
        marcas: [{ tipo: "zona", a: [12, -34], b: [44, -14], estilo: "foco" }, { tipo: "flecha", a: [31, -16], b: [29, -28], estilo: "presion" }],
      },
      {
        nombre: { es: "Sin salida", en: "No way out" },
        nota: { es: "Banda, pase atrás y centro cerrados: se pierde junto a la línea.", en: "Line, back pass and middle shut: the ball is lost by the touchline." },
        pase: [16, -28, "raso"],
        mover: { L3: [16, -28] },
        marcas: [{ tipo: "texto", en: [22, -19], texto: { es: "Sin salida", en: "No way out" }, color: CORAL }],
      },
    ],
  },
  {
    id: "cuando-presionar",
    tema: "presion",
    titulo: { es: "Cuándo presionar", en: "When to press" },
    pregunta: { es: "¿Qué señales le dicen al equipo que es momento de saltar?", en: "Which cues tell the team it is time to jump?" },
    base: { propia: "4231", rival: "433", balon: "suyo" },
    colocar: {
      L1: [-45, 0], L9: [16, 0], L10: [8, 0], L11: [6, -22], L7: [6, 22], L6: [-4, -7], L8: [-4, 7], L3: [-20, -22], L4: [-22, -8], L5: [-22, 8], L2: [-20, 22],
      R1: [50, 0], R5: [30, -12], R4: [30, 12], R2: [18, -28], R3: [18, 28], R6: [16, 0], R10: [4, -12], R8: [4, 12], R7: [-10, -26], R11: [-10, 26], R9: [-16, 2],
    },
    balon: [3, -12],
    pasos: [
      {
        nombre: { es: "Pase atrás: subimos", en: "Back pass: we step up" },
        nota: { es: "El pase atrás es la primera señal: todo el equipo da seis pasos adelante.", en: "A back pass is the first cue: the whole team takes six steps up." },
        pase: [30, -12, "raso"],
        mover: { L9: [24, -6], L10: [14, -2], L11: [14, -22], L7: [12, 18], L6: [2, -8], L8: [2, 6], L3: [-14, -22], L4: [-16, -8], L5: [-16, 8], L2: [-14, 20] },
        marcas: [{ tipo: "etiqueta", en: [18, -17], texto: { es: "Pase atrás", en: "Back pass" } }],
      },
      {
        nombre: { es: "Recibe de espaldas: a por él", en: "Back to goal: go" },
        nota: { es: "Recibir de espaldas es la segunda señal: dos jugadores le cierran.", en: "Receiving with his back to goal is the second cue: two players close him." },
        pase: [16, 0, "raso"],
        mover: { L10: [17, 1], L9: [21, 4], L6: [10, -4], L8: [10, 5] },
        marcas: [{ tipo: "flecha", a: [14, -2], b: [17, 0], estilo: "presion" }, { tipo: "etiqueta", en: [20, -5], texto: { es: "De espaldas", en: "Back to goal" } }],
      },
      {
        nombre: { es: "Robo y a correr", en: "Win it and run" },
        nota: { es: "Robo alto: pocos rivales por delante del balón y la portería cerca.", en: "Won high: few opponents ahead of the ball and the goal is close." },
        pase: [22, 4, "raso"],
        mover: { L11: [30, -14], L7: [30, 14] },
        marcas: [{ tipo: "texto", en: [25, 11], texto: { es: "Robo", en: "Won" }, color: CORAL }],
      },
    ],
  },
  {
    id: "desdoble-por-dentro",
    tema: "ataque",
    titulo: { es: "El desdoble por dentro", en: "The underlap" },
    pregunta: { es: "¿Qué es el desdoble por dentro y por qué funciona?", en: "What is an underlap and why does it work?" },
    base: { propia: "433", rival: "442", balon: "nuestro" },
    colocar: {
      L1: [-45, 0], L4: [-5, -12], L5: [-5, 12], L3: [8, -28], L6: [8, 0], L8: [20, -12], L10: [22, 14], L7: [32, 30], L9: [38, 2], L11: [34, -24], L2: [14, 24],
      R1: [50, 0], R3: [36, 24], R4: [40, 10], R5: [40, -4], R2: [36, -20], R11: [28, 22], R8: [28, 8], R10: [28, -6], R7: [28, -22], R9: [10, 6], R6: [12, -6],
    },
    balon: [31, 29],
    ambiente: { encuadre: "dos_tercios" },
    pasos: [
      {
        nombre: { es: "El extremo fija por fuera", en: "The winger pins wide" },
        nota: { es: "El extremo abierto saca al lateral: entre lateral y central se abre un hueco.", en: "The winger stays wide and pulls the full back: a gap opens beside the centre back." },
        mover: { R3: [33, 27] },
        marcas: [{ tipo: "zona", a: [36, 12], b: [45, 22], estilo: "translucida" }, { tipo: "etiqueta", en: [40, 17], texto: { es: "Hueco", en: "Gap" } }],
        duracion: 1.6,
      },
      {
        nombre: { es: "Carrera por dentro", en: "The run inside" },
        nota: { es: "El interior ataca el hueco por dentro del extremo: nadie le sigue.", en: "The midfielder attacks the gap inside the winger: nobody tracks him." },
        pase: [43, 18, "raso"],
        mover: { L10: [44, 17], R11: [32, 18] },
        curvas: { L10: -4 },
      },
      {
        nombre: { es: "Pase atrás al punto de penalti", en: "Cut-back to the spot" },
        nota: { es: "Desde la línea de fondo, el pase atrás encuentra al 9 de cara a portería.", en: "From the byline, the cut-back finds the 9 facing goal." },
        pase: [40, 2, "raso"],
        mover: { L9: [40, 2], R4: [46, 10], R5: [46, -2] },
        marcas: [{ tipo: "etiqueta", en: [36, -3], texto: { es: "Remate", en: "Shot" } }],
      },
    ],
  },
  {
    id: "superar-un-rombo",
    tema: "ataque",
    titulo: { es: "Cómo superar un rombo", en: "How to beat a diamond" },
    pregunta: { es: "¿Dónde está el espacio contra un medio campo en rombo?", en: "Where is the space against a midfield diamond?" },
    base: { propia: "433", rival: "41212", balon: "nuestro" },
    colocar: {
      L1: [-45, 0], L4: [-20, -12], L5: [-20, 12], L3: [-6, -30], L2: [-6, 30], L6: [-8, 0], L8: [4, -12], L10: [4, 12], L11: [20, -26], L9: [26, 0], L7: [20, 26],
      R1: [50, 0], R2: [30, -24], R5: [34, -9], R4: [34, 9], R3: [30, 24], R6: [14, 0], R10: [6, -8], R8: [6, 8], R7: [-4, 0], R11: [-12, -6], R9: [-12, 6],
    },
    balon: [-19, -12],
    pasos: [
      {
        nombre: { es: "El rombo es estrecho", en: "The diamond is narrow" },
        nota: { es: "Cuatro medios por dentro: las bandas quedan sin nadie que las cubra.", en: "Four midfielders inside: nobody covers the flanks." },
        marcas: [
          { tipo: "zona", a: [-10, -34], b: [22, -20], estilo: "rayas" }, { tipo: "zona", a: [-10, 20], b: [22, 34], estilo: "rayas" },
          { tipo: "etiqueta", en: [6, -27], texto: { es: "Libre", en: "Free" } }, { tipo: "etiqueta", en: [6, 27], texto: { es: "Libre", en: "Free" } },
        ],
        duracion: 1.2,
      },
      {
        nombre: { es: "Al lateral libre", en: "To the free full back" },
        nota: { es: "El central abre al lateral: el medio del rombo llega tarde a la banda.", en: "The centre back goes wide: the diamond's shuttler arrives late." },
        pase: [-4, -30, "raso"],
        mover: { L3: [-4, -30], R10: [2, -18] },
      },
      {
        nombre: { es: "Dos contra uno en banda", en: "Two against one wide" },
        nota: { es: "Lateral y extremo contra su lateral: dos contra uno hasta el área.", en: "Full back and winger against their full back: two against one to the box." },
        pase: [12, -30, "raso"],
        mover: { L3: [12, -30], L11: [26, -24], R2: [24, -27] },
        marcas: [{ tipo: "texto", en: [20, -16], texto: { es: "2 v 1", en: "2 v 1" }, color: CORAL }, { tipo: "flecha", a: [-2, -30], b: [11, -30], estilo: "ondulada", color: "#ffffff" }],
      },
    ],
  },
  {
    id: "corner-primer-palo",
    tema: "abp",
    titulo: { es: "Córner con bloqueo al primer palo", en: "Corner with a near-post screen" },
    pregunta: { es: "¿Cómo se gana el primer palo en un córner?", en: "How do you win the near post at a corner?" },
    base: { plantilla: "corner_der" },
    pasos: [],
  },
  {
    id: "falta-lateral",
    tema: "abp",
    titulo: { es: "Falta lateral al segundo palo", en: "Wide free kick to the far post" },
    pregunta: { es: "¿Cómo se ataca una falta desde la banda?", en: "How do you attack a free kick from out wide?" },
    base: { plantilla: "falta_lateral" },
    pasos: [],
  },
];

const punto = ([x, z]: Sitio): Punto => ({ x, z });

function anotacion(marca: Marca, idioma: Idioma, color: string): Anotacion {
  const id = nuevoId("a");
  if ("en" in marca) return { id, tipo: marca.tipo, a: punto(marca.en), texto: marca.texto[idioma], color: marca.color ?? color };
  if (marca.tipo === "flecha") return { id, tipo: "flecha", a: punto(marca.a), b: punto(marca.b), color: marca.color ?? color, estilo: marca.estilo };
  return { id, tipo: "rect", a: punto(marca.a), b: punto(marca.b), color: marca.color ?? color, estilo: marca.estilo };
}

/** Un sistema de la biblioteca, montado fase a fase y en el idioma de la pantalla. Cada vez es una copia nueva. */
export function sistemaDeBiblioteca(sistema: SistemaDeBiblioteca, idioma: Idioma): Jugada {
  const base = "plantilla" in sistema.base
    ? plantilla(sistema.base.plantilla)
    : sistemaDePartido(sistema.base.propia, sistema.base.rival, sistema.base.balon, sistema.tema);
  let jugada: Jugada = {
    ...base,
    id: nuevoId("j"),
    nombre: sistema.titulo[idioma],
    categoria: sistema.tema,
    ambiente: { ...base.ambiente, ...sistema.ambiente },
    // Las fases de serie de una plantilla, ya traducidas.
    fases: base.fases.map((f) => ({ ...f, nombre: deSerie(f.nombre, idioma), nota: deSerie(f.nota, idioma) })),
    actualizada: Date.now(),
  };
  if (sistema.colocar || sistema.balon) {
    const [primera, ...resto] = jugada.fases;
    const colocadas = Object.fromEntries(Object.entries(sistema.colocar ?? {}).map(([id, sitio]) => [id, punto(sitio)]));
    jugada = { ...jugada, fases: [{ ...primera, pos: { ...primera.pos, ...colocadas }, balon: sistema.balon ? punto(sistema.balon) : primera.balon }, ...resto] };
  }
  const color = jugada.colores.anotacion;
  sistema.pasos.forEach((paso, i) => {
    if (i > 0) jugada = agregarFase(jugada, i - 1, paso.nombre[idioma]);
    jugada = {
      ...jugada,
      fases: jugada.fases.map((f, k) => (k !== i ? f : {
        ...f,
        nombre: paso.nombre[idioma],
        nota: paso.nota[idioma],
        anotaciones: (paso.marcas ?? []).map((m) => anotacion(m, idioma, color)),
        duracion: paso.duracion ?? f.duracion,
        pausa: paso.pausa ?? f.pausa,
      })),
    };
    for (const [id, sitio] of Object.entries(paso.mover ?? {})) jugada = fijarCarrera(jugada, i, id, punto(sitio), paso.curvas?.[id] ?? 0);
    if (paso.pase) jugada = fijarPase(jugada, i, { x: paso.pase[0], z: paso.pase[1] }, paso.pase[2]);
  });
  return jugada;
}
