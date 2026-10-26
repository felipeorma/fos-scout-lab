/**
 * La homografía: la transformación que lleva el plano del césped (en metros)
 * al plano de la imagen de una cámara, y al revés.
 *
 * Una cámara que mira un campo convierte cada punto del césped en un punto de
 * la imagen con una proyección. Basta con saber dónde caen cuatro puntos
 * conocidos del campo (las esquinas del área, el centro, un córner…) para
 * reconstruirla: con ella se pinta sobre el césped con perspectiva —un
 * círculo de 2 m alrededor de un jugador sale como una elipse aplastada— y
 * se mide en metros sobre la imagen.
 *
 * Se resuelve por mínimos cuadrados (DLT, con h33 = 1) sobre puntos
 * normalizados (Hartley), para que no importe si vienen en metros o en
 * fracciones de la pantalla.
 */

export type P = { x: number; y: number };
/** Por filas: [h11, h12, h13, h21, h22, h23, h31, h32, h33]. */
export type Matriz = [number, number, number, number, number, number, number, number, number];

const multiplicar = (a: Matriz, b: Matriz): Matriz => {
  const r = new Array(9).fill(0) as Matriz;
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) for (let k = 0; k < 3; k += 1) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

/** La matriz que lleva unos puntos a tener su centro en 0 y una distancia media de √2. */
function normalizador(puntos: P[]): Matriz {
  const cx = puntos.reduce((s, p) => s + p.x, 0) / puntos.length, cy = puntos.reduce((s, p) => s + p.y, 0) / puntos.length;
  const media = puntos.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / puntos.length || 1;
  const k = Math.SQRT2 / media;
  return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1];
}

/** Resuelve A·x = b (n × n) por eliminación con pivote parcial; null si es singular. */
function resolver(a: number[][], b: number[]): number[] | null {
  const n = b.length, m = a.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let pivote = c;
    for (let f = c + 1; f < n; f += 1) if (Math.abs(m[f][c]) > Math.abs(m[pivote][c])) pivote = f;
    if (Math.abs(m[pivote][c]) < 1e-10) return null;
    [m[c], m[pivote]] = [m[pivote], m[c]];
    for (let f = 0; f < n; f += 1) {
      if (f === c) continue;
      const k = m[f][c] / m[c][c];
      for (let j = c; j <= n; j += 1) m[f][j] -= k * m[c][j];
    }
  }
  return m.map((fila, i) => fila[n] / fila[i]);
}

/** El área (doble, con signo) del triángulo abc: cero si están en línea. */
const area2 = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Si hay cuatro puntos de los que ningún trío está en línea: sin eso la homografía no está determinada. */
export function bienRepartidos(puntos: P[], tolerancia = 1e-3): boolean {
  if (puntos.length < 4) return false;
  const escala = Math.max(...puntos.map((p) => Math.abs(p.x)), ...puntos.map((p) => Math.abs(p.y)), 1) ** 2;
  for (let i = 0; i < puntos.length; i += 1) for (let j = i + 1; j < puntos.length; j += 1) for (let k = j + 1; k < puntos.length; k += 1) for (let l = k + 1; l < puntos.length; l += 1) {
    const q = [puntos[i], puntos[j], puntos[k], puntos[l]];
    const enLinea = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].some(([a, b, c]) => Math.abs(area2(q[a], q[b], q[c])) < tolerancia * escala);
    if (!enLinea) return true;
  }
  return false;
}

/** La homografía que lleva `de[i]` a `a[i]` (al menos cuatro parejas); null si los puntos no la determinan. */
export function homografia(de: P[], a: P[]): Matriz | null {
  const n = Math.min(de.length, a.length);
  if (n < 4 || !bienRepartidos(de.slice(0, n)) || !bienRepartidos(a.slice(0, n))) return null;
  const T1 = normalizador(de.slice(0, n)), T2 = normalizador(a.slice(0, n));
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0) as number[]);
  const atb = new Array(8).fill(0) as number[];
  const sumar = (fila: number[], v: number) => {
    for (let i = 0; i < 8; i += 1) {
      atb[i] += fila[i] * v;
      for (let j = 0; j < 8; j += 1) ata[i][j] += fila[i] * fila[j];
    }
  };
  for (let i = 0; i < n; i += 1) {
    const p = aplicar(T1, de[i])!, q = aplicar(T2, a[i])!;
    sumar([p.x, p.y, 1, 0, 0, 0, -q.x * p.x, -q.x * p.y], q.x);
    sumar([0, 0, 0, p.x, p.y, 1, -q.y * p.x, -q.y * p.y], q.y);
  }
  const h = resolver(ata, atb);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  const T2inv = invertir(T2);
  if (!T2inv) return null;
  const H = multiplicar(T2inv, multiplicar([...h, 1] as Matriz, T1));
  const k = H[8];
  if (Math.abs(k) < 1e-12) return null;
  return H.map((v) => v / k) as Matriz;
}

/** Lleva un punto con la homografía; null si cae en el infinito o detrás del horizonte. */
export function aplicar(H: Matriz, p: P): P | null {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  if (!(w > 1e-9)) return null;
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invertir(H: Matriz): Matriz | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const inv: Matriz = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  // La inversa exacta (adjunta / det) da w > 0 a lo que está delante de la cámara; se reescala
  // solo con un número positivo para no darle la vuelta: entonces todo caería «detrás del horizonte».
  const exacta = inv.map((v) => v / det);
  const k = Math.abs(exacta[8]) || 1;
  return exacta.map((v) => v / k) as Matriz;
}

/** El error medio al llevar `de` con H, comparado con `a`: lo que se ha desviado la calibración. */
export function errorMedio(H: Matriz, de: P[], a: P[]): number {
  let suma = 0, n = 0;
  for (let i = 0; i < Math.min(de.length, a.length); i += 1) {
    const q = aplicar(H, de[i]);
    if (!q) return Infinity;
    suma += Math.hypot(q.x - a[i].x, q.y - a[i].y);
    n += 1;
  }
  return n ? suma / n : Infinity;
}
