/**
 * Encontrar a los jugadores en un fotograma ya calibrado.
 *
 * Con la calibración (lib/perspectiva.ts) se sabe qué píxeles son césped del
 * campo y dónde cae cada uno en metros. Un jugador es una mancha que no es
 * césped dentro del campo, más alta que ancha y del ancho de una persona en
 * el sitio donde pisa; sus pies, el borde de abajo de la mancha, dan su
 * posición en metros. Los equipos salen del color de la camiseta: se reparten
 * en dos grupos por color y lo que no se parece a ninguno (el árbitro, un
 * portero) se queda sin equipo, para ponerlo a mano.
 *
 * Todo pasa en el navegador, sobre los píxeles de la imagen: nada se sube.
 */

import { LINEAS_DEL_CAMPO } from "./perspectiva.ts";
import type { P } from "./homografia.ts";
import { CAMPO, limitar, nuevoId, plantilla, type Ficha, type Jugada, type Punto } from "./abp.ts";

export type Imagen = { data: Uint8ClampedArray; width: number; height: number };
export type Rgb = [number, number, number];
export type JugadorDetectado = {
  id: string;
  /** Dónde pisa, en metros del campo (x a lo largo, y a lo ancho, como en lib/perspectiva). */
  pie: P;
  /** Su caja en la imagen, en píxeles. */
  caja: { x0: number; y0: number; x1: number; y1: number };
  /** El color medio de su camiseta. */
  color: Rgb;
  /** 0 o 1: uno de los dos equipos; null si no casa con ninguno. */
  equipo: 0 | 1 | null;
};

/** Tono (0–360), saturación y brillo (0–1) de un color. */
export function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, max ? d / max : 0, max / 255];
}

const distanciaDeTono = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** El tono del césped: el más repetido entre los píxeles del campo con algo de color. */
export function tonoDelCesped(img: Imagen, dentro: (i: number) => boolean): number | null {
  const cajones = new Array(180).fill(0) as number[];
  let n = 0;
  for (let i = 0; i < img.width * img.height; i += 3) {
    if (!dentro(i)) continue;
    const [h, s, v] = hsv(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    if (s < 0.15 || v < 0.12) continue;
    cajones[Math.floor(h / 2)] += 1;
    n += 1;
  }
  if (!n) return null;
  // Suavizado en una ventana de 10°: las franjas del segado tienen dos tonos muy cerca.
  let mejor = 0, pico = -1;
  for (let k = 0; k < 180; k += 1) {
    let suma = 0;
    for (let d = -2; d <= 2; d += 1) suma += cajones[(k + d + 180) % 180];
    if (suma > pico) { pico = suma; mejor = k; }
  }
  return mejor * 2 + 1;
}

/** Componentes conexas (4-vecinos) de una máscara: para cada una, sus píxeles en orden de lectura. */
export function manchas(mascara: Uint8Array, ancho: number, alto: number, minimo = 1): number[][] {
  const visto = new Uint8Array(ancho * alto);
  const salida: number[][] = [];
  for (let i = 0; i < ancho * alto; i += 1) {
    if (!mascara[i] || visto[i]) continue;
    const pila = [i], pixeles: number[] = [];
    visto[i] = 1;
    while (pila.length) {
      const q = pila.pop()!;
      pixeles.push(q);
      const x = q % ancho, y = (q - x) / ancho;
      if (x > 0 && mascara[q - 1] && !visto[q - 1]) { visto[q - 1] = 1; pila.push(q - 1); }
      if (x < ancho - 1 && mascara[q + 1] && !visto[q + 1]) { visto[q + 1] = 1; pila.push(q + 1); }
      if (y > 0 && mascara[q - ancho] && !visto[q - ancho]) { visto[q - ancho] = 1; pila.push(q - ancho); }
      if (y < alto - 1 && mascara[q + ancho] && !visto[q + ancho]) { visto[q + ancho] = 1; pila.push(q + ancho); }
    }
    if (pixeles.length >= minimo) salida.push(pixeles);
  }
  return salida;
}

/** Abre una máscara (erosión y dilatación en cruz): se van las líneas finas y el ruido, quedan las manchas. */
export function abrir(mascara: Uint8Array, ancho: number, alto: number): Uint8Array {
  const pasar = (de: Uint8Array, erosion: boolean) => {
    const a = new Uint8Array(de.length);
    for (let y = 0; y < alto; y += 1) for (let x = 0; x < ancho; x += 1) {
      const i = y * ancho + x;
      const vecinos = [de[i], x > 0 ? de[i - 1] : 0, x < ancho - 1 ? de[i + 1] : 0, y > 0 ? de[i - ancho] : 0, y < alto - 1 ? de[i + ancho] : 0];
      a[i] = erosion ? (vecinos.every(Boolean) ? 1 : 0) : (vecinos.some(Boolean) ? 1 : 0);
    }
    return a;
  };
  return pasar(pasar(mascara, true), false);
}

const distancia2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Reparte colores en dos grupos (k-medias con k = 2, empezando por los dos
 * más distintos). Lo que queda lejos de los dos centros, más del doble de lo
 * normal en su grupo, se queda sin grupo.
 */
export function dosEquipos(colores: Rgb[]): Array<0 | 1 | null> {
  if (colores.length < 2) return colores.map(() => 0);
  let a = 0, b = 1, lejos = -1;
  for (let i = 0; i < colores.length; i += 1) for (let j = i + 1; j < colores.length; j += 1) {
    const d = distancia2(colores[i], colores[j]);
    if (d > lejos) { lejos = d; a = i; b = j; }
  }
  let centros: [Rgb, Rgb] = [[...colores[a]] as Rgb, [...colores[b]] as Rgb];
  let grupo: Array<0 | 1> = colores.map(() => 0);
  for (let vuelta = 0; vuelta < 12; vuelta += 1) {
    grupo = colores.map((c) => (distancia2(c, centros[0]) <= distancia2(c, centros[1]) ? 0 : 1));
    const nuevos = ([0, 1] as const).map((g) => {
      const suyos = colores.filter((_, i) => grupo[i] === g);
      if (!suyos.length) return centros[g];
      return [0, 1, 2].map((k) => suyos.reduce((s, c) => s + c[k], 0) / suyos.length) as Rgb;
    }) as [Rgb, Rgb];
    if (nuevos.every((c, g) => distancia2(c, centros[g]) < 1)) { centros = nuevos; break; }
    centros = nuevos;
  }
  const tipica = ([0, 1] as const).map((g) => {
    const d = colores.filter((_, i) => grupo[i] === g).map((c) => Math.sqrt(distancia2(c, centros[g]))).sort((x, y) => x - y);
    return d.length ? d[Math.floor(d.length / 2)] : 0;
  });
  return colores.map((c, i) => {
    const g = grupo[i], d = Math.sqrt(distancia2(c, centros[g]));
    // Un color mucho más lejos de su grupo que lo normal en él: ni de unos ni de otros.
    return d > Math.max(40, tipica[g] * 2.5) ? null : g;
  });
}

/** La distancia en metros de un punto del césped a la línea pintada más cercana del campo. */
function aLaLinea(p: P): number {
  let menor = Infinity;
  for (const linea of LINEAS_DEL_CAMPO) {
    for (let i = 1; i < linea.length; i += 1) {
      const a = linea[i - 1], b = linea[i];
      const lx = b.x - a.x, ly = b.y - a.y, l2 = lx * lx + ly * ly;
      const k = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * lx + (p.y - a.y) * ly) / l2)) : 0;
      menor = Math.min(menor, Math.hypot(p.x - (a.x + lx * k), p.y - (a.y + ly * k)));
    }
  }
  return menor;
}

/**
 * Los jugadores de un fotograma. `aCampo` lleva un píxel de la imagen a
 * metros del campo (null si cae detrás del horizonte).
 */
export function detectarJugadores(img: Imagen, aCampo: (x: number, y: number) => P | null): JugadorDetectado[] {
  const { width: w, height: h, data } = img;
  const enCampo = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const q = aCampo(x + 0.5, y + 0.5);
    if (q && Math.abs(q.x) <= 53.5 && Math.abs(q.y) <= 35) enCampo[y * w + x] = 1;
  }
  const tono = tonoDelCesped(img, (i) => enCampo[i] === 1);
  if (tono === null) return [];
  // Lo que no es césped dentro del campo.
  const fuera = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (!enCampo[i]) continue;
    const [hh, s, v] = hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (!(distanciaDeTono(hh, tono) < 24 && s > 0.12 && v > 0.08)) fuera[i] = 1;
  }
  /** Cal: un píxel blanquecino cuyo punto del césped cae sobre una línea pintada del campo. */
  const esCal = (i: number) => {
    const [, s, v] = hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (!(s < 0.25 && v > 0.6)) return false;
    const x = i % w, q = aCampo(x + 0.5, (i - x) / w + 0.5);
    return Boolean(q && aLaLinea(q) < 0.45);
  };
  const salida: JugadorDetectado[] = [];
  const probar = (pixeles: number[]): boolean => {
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (const i of pixeles) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const ancho = x1 - x0 + 1, alto = y1 - y0 + 1;
    // Una persona de pie: más alta que ancha, sin pasarse.
    if (alto < ancho * 0.9 || alto > ancho * 8 || alto < 5) return false;
    // Un trozo de raya de cal (el borde de un círculo visto de lado también es alto y estrecho): casi todo cal.
    // La camiseta blanca de un jugador encima de una raya no cuenta: está en alto y su punto del césped cae más allá.
    if (pixeles.filter(esCal).length > pixeles.length * 0.5) return false;
    // Los pies: el centro de las filas de abajo de la mancha.
    const abajo = pixeles.filter((i) => Math.floor(i / w) >= y1 - 1);
    const fx = abajo.reduce((s2, i) => s2 + (i % w), 0) / abajo.length;
    const pie = aCampo(fx + 0.5, y1 + 1);
    if (!pie || Math.abs(pie.x) > 53.5 || Math.abs(pie.y) > 35) return false;
    // De hombro a hombro en metros, en el sitio donde pisa: ni un balón ni un grupo de cinco.
    const izq = aCampo(x0, y1 + 1), der = aCampo(x1 + 1, y1 + 1);
    const metros = izq && der ? Math.hypot(der.x - izq.x, der.y - izq.y) : 1;
    if (metros < 0.2 || metros > 3.2) return false;
    // La camiseta: la franja del 15 % al 55 % del alto, sin la cabeza ni las piernas.
    const ya = y0 + alto * 0.15, yb = y0 + alto * 0.55;
    let r = 0, g = 0, b = 0, n = 0;
    for (const i of pixeles) {
      const y = Math.floor(i / w);
      if (y < ya || y > yb) continue;
      r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n += 1;
    }
    if (!n) for (const i of pixeles) { r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; n += 1; }
    salida.push({ id: `d${salida.length + 1}`, pie, caja: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, color: [r / n, g / n, b / n], equipo: 0 });
    return true;
  };
  for (const pixeles of manchas(abrir(fuera, w, h), w, h, 10)) {
    if (probar(pixeles)) continue;
    // No tiene forma de persona: quizá sea un jugador pegado a una raya de cal. Sin la cal, otra vez.
    const sinCal = new Uint8Array(w * h);
    let quedan = 0;
    for (const i of pixeles) if (!esCal(i)) { sinCal[i] = 1; quedan += 1; }
    if (quedan === pixeles.length || quedan < 10) continue;
    for (const trozo of manchas(abrir(sinCal, w, h), w, h, 10)) probar(trozo);
  }
  const equipos = dosEquipos(salida.map((j) => j.color));
  return salida.map((j, i) => ({ ...j, equipo: equipos[i] })).sort((a, b) => a.pie.x - b.pie.x);
}

/** El color de cada equipo: la media de sus camisetas, en hexadecimal. */
export function colorDeEquipo(jugadores: JugadorDetectado[], equipo: 0 | 1): string | null {
  const suyos = jugadores.filter((j) => j.equipo === equipo);
  if (!suyos.length) return null;
  const media = [0, 1, 2].map((k) => Math.round(suyos.reduce((s, j) => s + j.color[k], 0) / suyos.length));
  return `#${media.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Los jugadores encontrados, como un sistema del estudio táctico: los nuestros
 * de local y los suyos de rival, cada uno donde pisaba en la imagen. Nosotros
 * atacamos hacia +x en el estudio; si en la imagen atacamos hacia la
 * izquierda, el campo se gira media vuelta. Los que no tienen equipo (el
 * árbitro) no van. El más retrasado de cada equipo, si está cerca de su
 * portería, es el portero; los demás llevan dorsal por orden, de atrás
 * adelante.
 */
export function jugadaDelFotograma(jugadores: JugadorDetectado[], opciones: { nuestro: 0 | 1; haciaLaDerecha: boolean; nombre: string }): Jugada {
  const base = plantilla("libre");
  const giro = opciones.haciaLaDerecha ? 1 : -1;
  const sitio = (j: JugadorDetectado): Punto => limitar({ x: giro * j.pie.x, z: giro * j.pie.y });
  const fichas: Ficha[] = [];
  const pos: Record<string, Punto> = {};
  for (const equipo of ["local", "rival"] as const) {
    const suyo = equipo === "local" ? opciones.nuestro : ((1 - opciones.nuestro) as 0 | 1);
    // De atrás adelante: los locales defienden x = −52,5 y los rivales x = +52,5.
    const delEquipo = jugadores.filter((j) => j.equipo === suyo).map(sitio).sort((a, b) => (equipo === "local" ? a.x - b.x : b.x - a.x));
    const porteria = equipo === "local" ? -CAMPO.largo / 2 : CAMPO.largo / 2;
    const conPortero = delEquipo.length > 0 && Math.abs(delEquipo[0].x - porteria) < 20;
    delEquipo.forEach((p, k) => {
      const dorsal = String(conPortero ? k + 1 : k + 2);
      const id = `${equipo === "local" ? "L" : "R"}${dorsal}`;
      fichas.push({ id, equipo, dorsal, rol: conPortero && k === 0 ? "POR" : "" });
      pos[id] = p;
    });
  }
  // El balón, donde está el lío: en el centro de todos.
  const todos = Object.values(pos);
  const balon = todos.length
    ? { x: todos.reduce((s, p) => s + p.x, 0) / todos.length, z: todos.reduce((s, p) => s + p.z, 0) / todos.length }
    : { x: 0, z: 0 };
  const colorNuestro = colorDeEquipo(jugadores, opciones.nuestro), colorSuyo = colorDeEquipo(jugadores, (1 - opciones.nuestro) as 0 | 1);
  return {
    ...base,
    id: nuevoId("j"),
    nombre: opciones.nombre.slice(0, 80),
    colores: { ...base.colores, local: colorNuestro ?? base.colores.local, rival: colorSuyo ?? base.colores.rival },
    fichas,
    fases: [{ ...base.fases[0], pos, balon, carreras: [], pases: [], anotaciones: [], material: [] }],
    actualizada: Date.now(),
  };
}
