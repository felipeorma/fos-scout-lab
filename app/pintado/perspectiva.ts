/**
 * Cómo se pintan sobre la imagen las marcas que van en el césped: las líneas
 * del campo para comprobar la calibración, los puntos de la calibración y las
 * marcas en metros (medidas, fuera de juego, círculos, zonas y flechas), todo
 * con la perspectiva de la cámara. Lo usan la pantalla y la exportación.
 */

import { aplicar, type Matriz, type P } from "@/lib/homografia";
import { LINEAS_DEL_CAMPO, contornoDeMarca, distancia, proyectar, puntaEnCampo, type MarcaDeCampo } from "@/lib/perspectiva";
import { ANCHO_BASE } from "@/lib/pintado";
import { tintaSobre } from "./dibujo";

function rgba(hex: string, alfa: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

export type OpcionesDeCampo = {
  w: number;
  h: number;
  fuente: string;
  acento: string;
  /** «12,4 m» en el idioma de la pantalla. */
  metros: (m: number) => string;
  rotuloFuera: string;
};

/** Una pastilla con texto, centrada en (x, y). */
function pastilla(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, color: string, o: OpcionesDeCampo) {
  const alto = Math.max(16, Math.min(30, 22 * (o.w / ANCHO_BASE)));
  ctx.save();
  ctx.font = `800 ${alto * 0.56}px ${o.fuente}`;
  const ancho = ctx.measureText(texto).width + alto * 0.8;
  ctx.fillStyle = "rgba(8,8,10,.55)";
  ctx.beginPath();
  ctx.roundRect(x - ancho / 2 - 1.5, y - alto / 2 - 1.5, ancho + 3, alto + 3, alto / 2 + 1.5);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - ancho / 2, y - alto / 2, ancho, alto, alto / 2);
  ctx.fill();
  ctx.fillStyle = tintaSobre(color);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x, y + alto * 0.04);
  ctx.restore();
}

/** Una polilínea del césped, proyectada y en píxeles: los pedazos que se ven. */
function enPantalla(H: Matriz, puntos: P[], o: OpcionesDeCampo): P[][] {
  return proyectar(H, puntos).map((pedazo) => pedazo.map((q) => ({ x: q.x * o.w, y: q.y * o.h })));
}

function camino(ctx: CanvasRenderingContext2D, pedazos: P[][]) {
  ctx.beginPath();
  for (const pedazo of pedazos) pedazo.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
}

/** El punto de la imagen (en píxeles) donde cae un punto del césped. */
export function aPixeles(H: Matriz, p: P, o: { w: number; h: number }): P | null {
  const q = aplicar(H, p);
  return q ? { x: q.x * o.w, y: q.y * o.h } : null;
}

/** Las líneas del campo encima de la imagen: blancas y finas, para ver si la calibración casa. */
export function dibujarLineas(ctx: CanvasRenderingContext2D, H: Matriz, o: OpcionesDeCampo) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const linea of LINEAS_DEL_CAMPO) {
    const pedazos = enPantalla(H, linea, o);
    camino(ctx, pedazos);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = rgba(o.acento, 0.95);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

/** Los puntos puestos al calibrar: una diana con su número. */
export function dibujarPuntosDeCalibracion(ctx: CanvasRenderingContext2D, puntos: Array<{ p: P; etiqueta: string }>, o: OpcionesDeCampo) {
  ctx.save();
  for (const { p, etiqueta } of puntos) {
    const x = p.x * o.w, y = p.y * o.h;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = o.acento;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 14); ctx.stroke();
    ctx.font = `800 12px ${o.fuente}`;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,.75)";
    ctx.lineWidth = 3;
    ctx.strokeText(etiqueta, x + 12, y - 11);
    ctx.fillText(etiqueta, x + 12, y - 11);
  }
  ctx.restore();
}

/** Una marca en el césped, con su perspectiva. */
export function dibujarMarca(ctx: CanvasRenderingContext2D, H: Matriz, m: MarcaDeCampo, o: OpcionesDeCampo, elegida = false, alfa = 1) {
  const s = o.w / ANCHO_BASE, grosor = Math.max(2, 4 * s);
  const pedazos = enPantalla(H, contornoDeMarca(m), o);
  if (!pedazos.length) return;
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const trazo = (ancho: number, color: string, discontinua = false) => {
    camino(ctx, pedazos);
    ctx.setLineDash(discontinua ? [ancho * 3, ancho * 2] : []);
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = ancho + 3;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = ancho;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (m.tipo === "circulo" || m.tipo === "zona") {
    camino(ctx, pedazos);
    ctx.fillStyle = rgba(m.color, 0.26);
    ctx.fill();
  }
  if (m.tipo === "fuera") {
    // El fuera de juego: una franja a cada lado, como en la tele, y la línea.
    const banda = enPantalla(H, [{ x: m.x - 0.35, y: -34 }, { x: m.x + 0.35, y: -34 }, { x: m.x + 0.35, y: 34 }, { x: m.x - 0.35, y: 34 }, { x: m.x - 0.35, y: -34 }], o);
    camino(ctx, banda);
    ctx.fillStyle = rgba(m.color, 0.3);
    ctx.fill();
  }
  trazo(grosor * (elegida ? 1.35 : 1), m.color, m.tipo === "medida");
  if (m.tipo === "flecha") {
    const punta = enPantalla(H, [...puntaEnCampo(m.a, m.b), puntaEnCampo(m.a, m.b)[0]], o);
    camino(ctx, punta);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
  }
  if (m.tipo === "medida") {
    // Los topes de cada extremo, perpendiculares en el césped.
    const d = distancia(m.a, m.b) || 1, nx = -(m.b.y - m.a.y) / d * 0.7, ny = (m.b.x - m.a.x) / d * 0.7;
    for (const p of [m.a, m.b]) {
      const tope = enPantalla(H, [{ x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }], o);
      camino(ctx, tope);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = grosor;
      ctx.stroke();
    }
    const medio = aPixeles(H, { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }, o);
    if (medio) pastilla(ctx, o.metros(d), medio.x, medio.y, m.color, o);
  } else if (m.tipo === "zona") {
    const centro = aPixeles(H, { x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 }, o);
    const cifra = (n: number) => o.metros(n).replace(/\s*m$/, "").replace(/[.,]0$/, "");
    if (centro) pastilla(ctx, `${cifra(Math.abs(m.b.x - m.a.x))} × ${cifra(Math.abs(m.b.y - m.a.y))} m`, centro.x, centro.y, m.color, o);
  } else if (m.tipo === "fuera") {
    // El rótulo, en el extremo más alto de la línea tal como se ve.
    const extremos = [aPixeles(H, { x: m.x, y: -34 }, o), aPixeles(H, { x: m.x, y: 34 }, o)].filter((q): q is P => Boolean(q));
    const arriba = extremos.sort((a, b) => a.y - b.y)[0];
    if (arriba) pastilla(ctx, o.rotuloFuera, arriba.x, Math.max(14, Math.min(o.h - 14, arriba.y + 18)), m.color, o);
  }
  if (elegida) {
    camino(ctx, pedazos);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = o.acento;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** La marca bajo el puntero (en píxeles), la de encima primero; para elegirla y moverla. */
export function marcaEn(H: Matriz, marcas: MarcaDeCampo[], p: P, o: { w: number; h: number }, tol = 9): string | null {
  const aSegmento = (q: P, a: P, b: P) => {
    const lx = b.x - a.x, ly = b.y - a.y, l2 = lx * lx + ly * ly;
    const k = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * lx + (q.y - a.y) * ly) / l2)) : 0;
    return Math.hypot(q.x - (a.x + lx * k), q.y - (a.y + ly * k));
  };
  const dentro = (q: P, poligono: P[]) => {
    let si = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
      const a = poligono[i], b = poligono[j];
      if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) si = !si;
    }
    return si;
  };
  for (const m of [...marcas].reverse()) {
    const pedazos = proyectar(H, contornoDeMarca(m)).map((pedazo) => pedazo.map((q) => ({ x: q.x * o.w, y: q.y * o.h })));
    for (const pedazo of pedazos) {
      for (let i = 1; i < pedazo.length; i += 1) if (aSegmento(p, pedazo[i - 1], pedazo[i]) <= tol) return m.id;
      if ((m.tipo === "circulo" || m.tipo === "zona") && dentro(p, pedazo)) return m.id;
    }
  }
  return null;
}
