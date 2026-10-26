/**
 * Geometría plana para la pizarra, en metros: el contorno de un grupo de
 * jugadores, el orden de una línea, un trazo a mano alzada sin puntos de más
 * y la distancia de un punto a una línea quebrada. Sin dependencias, para
 * poder usarla desde el modelo y desde los dos motores de dibujo.
 */

import type { Punto } from "./abp.ts";

const cruz = (o: Punto, a: Punto, b: Punto) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** La envolvente convexa (cadena monótona), en orden. Con menos de tres puntos, los mismos. */
export function envolvente(puntos: Punto[]): Punto[] {
  const p = [...puntos].sort((a, b) => a.x - b.x || a.z - b.z);
  if (p.length < 3) return p;
  const abajo: Punto[] = [], arriba: Punto[] = [];
  for (const q of p) {
    while (abajo.length >= 2 && cruz(abajo[abajo.length - 2], abajo[abajo.length - 1], q) <= 0) abajo.pop();
    abajo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i -= 1) {
    const q = p[i];
    while (arriba.length >= 2 && cruz(arriba[arriba.length - 2], arriba[arriba.length - 1], q) <= 0) arriba.pop();
    arriba.push(q);
  }
  abajo.pop();
  arriba.pop();
  return [...abajo, ...arriba];
}

/**
 * Un contorno redondeado alrededor de los puntos, a `margen` metros: la
 * envolvente con un arco en cada esquina. Sirve también para uno o dos puntos
 * (un círculo, una cápsula).
 */
export function contornoHolgado(puntos: Punto[], margen: number, pasosPorArco = 8): Punto[] {
  const casco = envolvente(puntos);
  if (!casco.length) return [];
  if (casco.length === 1) {
    return Array.from({ length: pasosPorArco * 4 }, (_, k) => {
      const ang = (k / (pasosPorArco * 4)) * Math.PI * 2;
      return { x: casco[0].x + Math.cos(ang) * margen, z: casco[0].z + Math.sin(ang) * margen };
    });
  }
  // En cada vértice, un arco entre las normales de sus dos lados.
  const salida: Punto[] = [];
  const n = casco.length;
  const normal = (a: Punto, b: Punto) => {
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.z - a.z) / l, z: -(b.x - a.x) / l };
  };
  // El sentido de la envolvente decide hacia dónde queda «fuera».
  const area = casco.reduce((s, p, i) => s + cruz({ x: 0, z: 0 }, p, casco[(i + 1) % n]), 0);
  const signo = area >= 0 ? 1 : -1;
  for (let i = 0; i < n; i += 1) {
    const previo = casco[(i - 1 + n) % n], actual = casco[i], siguiente = casco[(i + 1) % n];
    const n1 = normal(previo, actual), n2 = normal(actual, siguiente);
    const a1 = Math.atan2(n1.z * signo, n1.x * signo);
    let a2 = Math.atan2(n2.z * signo, n2.x * signo);
    while (a2 < a1) a2 += Math.PI * 2;
    if (a2 - a1 > Math.PI * 2 - 1e-6) a2 = a1;
    const pasos = Math.max(1, Math.round(((a2 - a1) / (Math.PI / 2)) * pasosPorArco));
    for (let k = 0; k <= pasos; k += 1) {
      const ang = a1 + ((a2 - a1) * k) / pasos;
      salida.push({ x: actual.x + Math.cos(ang) * margen, z: actual.z + Math.sin(ang) * margen });
    }
  }
  return salida;
}

/**
 * Los puntos en el orden en que se leen como línea: de lado a lado si el
 * grupo es más ancho que profundo (una línea defensiva), de atrás adelante si
 * no (un carril).
 */
export function ordenarEnLinea(puntos: Punto[]): Punto[] {
  if (puntos.length < 2) return [...puntos];
  const xs = puntos.map((p) => p.x), zs = puntos.map((p) => p.z);
  const ancho = Math.max(...zs) - Math.min(...zs), largo = Math.max(...xs) - Math.min(...xs);
  return [...puntos].sort(ancho >= largo ? (a, b) => a.z - b.z : (a, b) => a.x - b.x);
}

/** Quita los puntos de un trazo que no cambian su forma más de `tolerancia` metros (Ramer–Douglas–Peucker). */
export function simplificar(puntos: Punto[], tolerancia: number): Punto[] {
  if (puntos.length < 3) return [...puntos];
  const guardar = new Uint8Array(puntos.length);
  guardar[0] = guardar[puntos.length - 1] = 1;
  const pila: Array<[number, number]> = [[0, puntos.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop()!;
    let peor = -1, dPeor = tolerancia;
    for (let k = i + 1; k < j; k += 1) {
      const d = aSegmento(puntos[k], puntos[i], puntos[j]);
      if (d > dPeor) { peor = k; dPeor = d; }
    }
    if (peor >= 0) {
      guardar[peor] = 1;
      pila.push([i, peor], [peor, j]);
    }
  }
  return puntos.filter((_, k) => guardar[k]);
}

/** La distancia de `p` al segmento `a`–`b`. */
export function aSegmento(p: Punto, a: Punto, b: Punto) {
  const lx = b.x - a.x, lz = b.z - a.z;
  const l2 = lx * lx + lz * lz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * lx + (p.z - a.z) * lz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + lx * t), p.z - (a.z + lz * t));
}

/** La distancia de `p` a una línea quebrada (a un punto, si solo tiene uno). */
export function aPolilinea(p: Punto, puntos: Punto[]) {
  if (!puntos.length) return Infinity;
  if (puntos.length === 1) return Math.hypot(p.x - puntos[0].x, p.z - puntos[0].z);
  let menor = Infinity;
  for (let i = 1; i < puntos.length; i += 1) menor = Math.min(menor, aSegmento(p, puntos[i - 1], puntos[i]));
  return menor;
}

/** El área de un polígono en m² (fórmula del cordón). */
export function area(poligono: Punto[]) {
  let s = 0;
  for (let i = 0; i < poligono.length; i += 1) {
    const a = poligono[i], b = poligono[(i + 1) % poligono.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

/** Una línea quebrada sin `ini` metros del principio ni `fin` del final; si no cabe, se recorta menos. */
export function recortarLinea(puntos: Punto[], ini: number, fin: number): Punto[] {
  if (puntos.length < 2 || (ini <= 0 && fin <= 0)) return puntos;
  const tramos = puntos.slice(1).map((q, i) => Math.hypot(q.x - puntos[i].x, q.z - puntos[i].z));
  const total = tramos.reduce((s, l) => s + l, 0);
  if (total < 1e-3) return puntos;
  const escala = ini + fin > total * 0.8 ? (total * 0.8) / (ini + fin) : 1;
  const s0 = ini * escala, s1 = total - fin * escala;
  const salida: Punto[] = [];
  let recorrido = 0;
  const en = (i: number, s: number) => {
    const k = tramos[i] ? (s - recorrido) / tramos[i] : 0;
    return { x: puntos[i].x + (puntos[i + 1].x - puntos[i].x) * k, z: puntos[i].z + (puntos[i + 1].z - puntos[i].z) * k };
  };
  for (let i = 0; i < tramos.length; i += 1) {
    const desde = recorrido, hasta = recorrido + tramos[i];
    if (hasta >= s0 && desde <= s1) {
      if (!salida.length) salida.push(en(i, Math.max(s0, desde)));
      salida.push(hasta <= s1 ? puntos[i + 1] : en(i, s1));
    }
    recorrido = hasta;
  }
  return salida.length >= 2 ? salida : puntos;
}

/** La misma línea en zigzag suave (una conducción): ondas de `onda` metros y `amp` de alto. */
export function ondularLinea(puntos: Punto[], onda: number, amp: number): Punto[] {
  const tramos = puntos.slice(1).map((q, i) => Math.hypot(q.x - puntos[i].x, q.z - puntos[i].z));
  const total = tramos.reduce((s, l) => s + l, 0);
  if (total < 0.2) return puntos;
  const ondas = Math.max(2, Math.round(total / onda)), pasos = ondas * 10;
  const salida: Punto[] = [];
  let i = 0, recorrido = 0;
  for (let k = 0; k <= pasos; k += 1) {
    const s = (total * k) / pasos;
    while (i < tramos.length - 1 && recorrido + tramos[i] < s) { recorrido += tramos[i]; i += 1; }
    const l = tramos[i] || 1, u = Math.min(1, (s - recorrido) / l);
    const a = puntos[i], b = puntos[i + 1];
    const ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
    const v = s / total, alto = amp * Math.sin(v * ondas * Math.PI * 2) * Math.min(1, v * 6, (1 - v) * 6);
    salida.push({ x: a.x + (b.x - a.x) * u - uz * alto, z: a.z + (b.z - a.z) * u + ux * alto });
  }
  return salida;
}
