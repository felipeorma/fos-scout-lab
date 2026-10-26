/**
 * Pintar sobre el césped de un vídeo con su perspectiva.
 *
 * Se calibra diciendo dónde caen en la imagen al menos cuatro puntos que se
 * conocen del campo —las esquinas del área, el centro, un córner—, y con la
 * homografía (lib/homografia.ts) cada marca se guarda en metros y se dibuja
 * proyectada: una zona de 10 × 10 sale como un trapecio, un círculo de 2 m
 * como una elipse, la línea del fuera de juego paralela a la de gol.
 *
 * El campo es el de siempre (105 × 68, centrado). En la imagen, como en una
 * retransmisión: la x crece hacia la derecha de la pantalla y la y (el ancho
 * del campo) hacia la banda cercana a la cámara.
 */

import { aplicar, type Matriz, type P } from "./homografia.ts";

const L = 52.5, A = 34;
const AREA = { fondo: 16.5, ancho: 20.16 }, AREA_PEQUENA = { fondo: 5.5, ancho: 9.16 }, PENALTI = 11, RADIO = 9.15;

export type GrupoDePuntos = "izquierda" | "medio" | "derecha";
export type PuntoDeCampo = { id: string; nombre: string; grupo: GrupoDePuntos; p: P };

/** Los puntos del campo que se reconocen en cualquier imagen, por zonas. */
export const PUNTOS_DEL_CAMPO: PuntoDeCampo[] = [
  ...(["izquierda", "derecha"] as const).flatMap((lado): PuntoDeCampo[] => {
    const s = lado === "izquierda" ? -1 : 1, nombre = lado === "izquierda" ? "izquierda" : "derecha";
    return [
      { id: `${lado}-area-lejana`, nombre: `Área ${nombre}: esquina lejana`, grupo: lado, p: { x: s * (L - AREA.fondo), y: -AREA.ancho } },
      { id: `${lado}-area-cercana`, nombre: `Área ${nombre}: esquina cercana`, grupo: lado, p: { x: s * (L - AREA.fondo), y: AREA.ancho } },
      { id: `${lado}-area-fondo-lejana`, nombre: `Área ${nombre}: en el fondo, lejana`, grupo: lado, p: { x: s * L, y: -AREA.ancho } },
      { id: `${lado}-area-fondo-cercana`, nombre: `Área ${nombre}: en el fondo, cercana`, grupo: lado, p: { x: s * L, y: AREA.ancho } },
      { id: `${lado}-pequena-lejana`, nombre: `Área pequeña ${nombre}: esquina lejana`, grupo: lado, p: { x: s * (L - AREA_PEQUENA.fondo), y: -AREA_PEQUENA.ancho } },
      { id: `${lado}-pequena-cercana`, nombre: `Área pequeña ${nombre}: esquina cercana`, grupo: lado, p: { x: s * (L - AREA_PEQUENA.fondo), y: AREA_PEQUENA.ancho } },
      { id: `${lado}-penalti`, nombre: `Punto de penalti ${nombre}`, grupo: lado, p: { x: s * (L - PENALTI), y: 0 } },
      { id: `${lado}-corner-lejano`, nombre: `Córner lejano ${nombre}`, grupo: lado, p: { x: s * L, y: -A } },
      { id: `${lado}-corner-cercano`, nombre: `Córner cercano ${nombre}`, grupo: lado, p: { x: s * L, y: A } },
    ];
  }),
  { id: "medio-lejano", nombre: "Medio campo, banda lejana", grupo: "medio", p: { x: 0, y: -A } },
  { id: "medio-cercano", nombre: "Medio campo, banda cercana", grupo: "medio", p: { x: 0, y: A } },
  { id: "circulo-lejano", nombre: "Círculo central, lado lejano", grupo: "medio", p: { x: 0, y: -RADIO } },
  { id: "circulo-cercano", nombre: "Círculo central, lado cercano", grupo: "medio", p: { x: 0, y: RADIO } },
  { id: "centro", nombre: "Centro del campo", grupo: "medio", p: { x: 0, y: 0 } },
];

export const puntoDeCampo = (id: string) => PUNTOS_DEL_CAMPO.find((x) => x.id === id);

/** El siguiente punto sin poner de la misma zona, en el orden de la lista: se calibra sin volver a la lista. */
export function siguientePunto(actual: string, puestos: Set<string>): string | null {
  const grupo = puntoDeCampo(actual)?.grupo;
  const lista = PUNTOS_DEL_CAMPO.filter((x) => x.grupo === grupo);
  const desde = lista.findIndex((x) => x.id === actual);
  for (let k = 1; k <= lista.length; k += 1) {
    const candidato = lista[(desde + k) % lista.length];
    if (!puestos.has(candidato.id) && candidato.id !== actual) return candidato.id;
  }
  return null;
}

export function circulo(c: P, r: number, pasos = 48): P[] {
  return Array.from({ length: pasos + 1 }, (_, i) => {
    const a = (i / pasos) * Math.PI * 2;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  });
}

function arco(c: P, r: number, desde: number, hasta: number, pasos = 24): P[] {
  return Array.from({ length: pasos + 1 }, (_, i) => {
    const a = desde + ((hasta - desde) * i) / pasos;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  });
}

/** Las líneas del campo, en metros: para comprobar la calibración viéndolas encima de la imagen. */
export const LINEAS_DEL_CAMPO: P[][] = (() => {
  const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];
  const lineas: P[][] = [rect(-L, -A, L, A), [{ x: 0, y: -A }, { x: 0, y: A }], circulo({ x: 0, y: 0 }, RADIO)];
  for (const s of [-1, 1]) {
    lineas.push(rect(s * L, -AREA.ancho, s * (L - AREA.fondo), AREA.ancho));
    lineas.push(rect(s * L, -AREA_PEQUENA.ancho, s * (L - AREA_PEQUENA.fondo), AREA_PEQUENA.ancho));
    // La medialuna: la parte del círculo de 9,15 m alrededor del penalti que queda fuera del área.
    const corte = Math.acos((AREA.fondo - PENALTI) / RADIO);
    const centro = { x: s * (L - PENALTI), y: 0 };
    lineas.push(s < 0 ? arco(centro, RADIO, -corte, corte) : arco(centro, RADIO, Math.PI - corte, Math.PI + corte));
  }
  return lineas;
})();

/**
 * Lleva una polilínea del césped a la imagen. Cada tramo se parte en trozos
 * para cortar donde se va detrás del horizonte; devuelve los pedazos que se ven.
 */
export function proyectar(H: Matriz, puntos: P[], trozos = 8): P[][] {
  const salida: P[][] = [];
  let actual: P[] = [];
  const empujar = (q: P | null) => {
    if (q) actual.push(q);
    else if (actual.length) { if (actual.length > 1) salida.push(actual); actual = []; }
  };
  puntos.forEach((p, i) => {
    if (i === 0) { empujar(aplicar(H, p)); return; }
    const a = puntos[i - 1];
    for (let k = 1; k <= trozos; k += 1) empujar(aplicar(H, { x: a.x + ((p.x - a.x) * k) / trozos, y: a.y + ((p.y - a.y) * k) / trozos }));
  });
  if (actual.length > 1) salida.push(actual);
  return salida;
}

// ---- Las marcas sobre el césped -------------------------------------------------------------

export type MarcaDeCampo =
  /** Una distancia en metros, de punto a punto. */
  | { id: string; tipo: "medida"; a: P; b: P; color: string }
  /** La línea del fuera de juego: paralela a la de gol, a lo ancho del campo. */
  | { id: string; tipo: "fuera"; x: number; color: string }
  | { id: string; tipo: "circulo"; c: P; r: number; color: string }
  /** Una zona alineada con el campo, de esquina a esquina. */
  | { id: string; tipo: "zona"; a: P; b: P; color: string }
  | { id: string; tipo: "flecha"; a: P; b: P; color: string }
  /** El espacio entre tres o más jugadores, con su área en m². */
  | { id: string; tipo: "area"; puntos: P[]; color: string }
  /** Una línea por varios jugadores (una línea defensiva) con la distancia de cada hueco. */
  | { id: string; tipo: "huecos"; puntos: P[]; color: string };

/** Las marcas que se dibujan punto a punto (un clic por jugador) y cuántos puntos piden como mínimo. */
export const PUNTO_A_PUNTO = { area: 3, huecos: 2 } as const;
export type MarcaPuntoAPunto = Extract<MarcaDeCampo, { tipo: keyof typeof PUNTO_A_PUNTO }>;

export const distancia = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/** La marca movida `dx`, `dy` metros. */
export function desplazarMarca(m: MarcaDeCampo, dx: number, dy: number): MarcaDeCampo {
  const mover = (p: P) => ({ x: p.x + dx, y: p.y + dy });
  switch (m.tipo) {
    case "fuera": return { ...m, x: Math.max(-L, Math.min(L, m.x + dx)) };
    case "circulo": return { ...m, c: mover(m.c) };
    case "area":
    case "huecos": return { ...m, puntos: m.puntos.map(mover) };
    default: return { ...m, a: mover(m.a), b: mover(m.b) };
  }
}

/**
 * Cierra una marca de punto a punto: quita los puntos repetidos (el doble
 * clic que la termina pone dos en el mismo sitio) y la da por buena si tiene
 * los que pide; si no, null.
 */
export function cerrarPuntoAPunto(m: MarcaPuntoAPunto): MarcaPuntoAPunto | null {
  const puntos = m.puntos.filter((p, i) => i === 0 || distancia(p, m.puntos[i - 1]) > 0.25);
  if (puntos.length < PUNTO_A_PUNTO[m.tipo]) return null;
  if (m.tipo === "area" && areaDePoligono(puntos) < 0.5) return null;
  return { ...m, puntos };
}

/** El área de un polígono en m² (fórmula del lazo), sin importar el sentido en que se dibujó. */
export function areaDePoligono(puntos: P[]): number {
  let doble = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const a = puntos[i], b = puntos[(i + 1) % puntos.length];
    doble += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doble) / 2;
}

/** El centro de masas de un polígono, donde va el rótulo de su área; si es degenerado, la media de sus puntos. */
export function centroDePoligono(puntos: P[]): P {
  let doble = 0, cx = 0, cy = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const a = puntos[i], b = puntos[(i + 1) % puntos.length];
    const k = a.x * b.y - b.x * a.y;
    doble += k; cx += (a.x + b.x) * k; cy += (a.y + b.y) * k;
  }
  if (Math.abs(doble) < 1e-9) return { x: puntos.reduce((s, p) => s + p.x, 0) / puntos.length, y: puntos.reduce((s, p) => s + p.y, 0) / puntos.length };
  return { x: cx / (3 * doble), y: cy / (3 * doble) };
}

/** Lo que mide cada tramo de una línea, en metros, en orden. */
export const tramos = (puntos: P[]) => puntos.slice(1).map((p, i) => distancia(puntos[i], p));

/** Una marca hecha arrastrando de `a` a `b` en el césped; null si es tan corta que fue un clic sin querer. */
export type MarcaDeArrastre = "medida" | "circulo" | "zona" | "flecha";
export function marcaDeArrastre(tipo: MarcaDeArrastre, id: string, a: P, b: P, color: string): MarcaDeCampo | null {
  if (distancia(a, b) < 0.4) return null;
  if (tipo === "circulo") return { id, tipo, c: a, r: Math.min(30, distancia(a, b)), color };
  return { id, tipo, a, b, color };
}

/** Los puntos en metros que dibujan una marca: su línea o su contorno. */
export function contornoDeMarca(m: MarcaDeCampo): P[] {
  switch (m.tipo) {
    case "fuera": return [{ x: m.x, y: -A }, { x: m.x, y: A }];
    case "circulo": return circulo(m.c, m.r);
    case "zona": return [m.a, { x: m.b.x, y: m.a.y }, m.b, { x: m.a.x, y: m.b.y }, m.a];
    case "area": return [...m.puntos, m.puntos[0]];
    case "huecos": return m.puntos;
    default: return [m.a, m.b];
  }
}

/** La punta de una flecha tumbada en el césped: un triángulo en metros que, proyectado, se ve con su perspectiva. */
export function puntaEnCampo(a: P, b: P, largo = 1.8, ancho = 1.1): P[] {
  const d = distancia(a, b) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  const base = { x: b.x - ux * largo, y: b.y - uy * largo };
  return [b, { x: base.x - uy * ancho, y: base.y + ux * ancho }, { x: base.x + uy * ancho, y: base.y - ux * ancho }];
}
