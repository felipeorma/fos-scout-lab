/**
 * Cómo se pinta cada trazo del pintado de acciones sobre un lienzo 2D.
 *
 * Lo usan la pantalla y la exportación: el mismo código dibuja a la medida
 * del escenario y a 1920 px, porque los trazos vienen en fracciones (ver
 * lib/pintado.ts) y aquí se pasan a píxeles.
 */

import { ALTO_ETIQUETA, ALTO_TEXTO, ANCHO_BASE, RADIO_DORSAL, controlDeFlecha, limites, type PuntoP, type Trazo } from "@/lib/pintado";

function rgba(hex: string, alfa: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Blanco o casi negro, lo que se lea mejor sobre `fondo`. */
export function tintaSobre(fondo: string) {
  const n = parseInt(fondo.replace("#", ""), 16);
  const luz = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luz > 0.6 ? "#0b0b0e" : "#ffffff";
}

function punta(ctx: CanvasRenderingContext2D, desde: { x: number; y: number }, hasta: { x: number; y: number }, largo: number, color: string) {
  const angulo = Math.atan2(hasta.y - desde.y, hasta.x - desde.x);
  ctx.beginPath();
  ctx.moveTo(hasta.x, hasta.y);
  ctx.lineTo(hasta.x - largo * Math.cos(angulo - 0.42), hasta.y - largo * Math.sin(angulo - 0.42));
  ctx.lineTo(hasta.x - largo * 0.72 * Math.cos(angulo), hasta.y - largo * 0.72 * Math.sin(angulo));
  ctx.lineTo(hasta.x - largo * Math.cos(angulo + 0.42), hasta.y - largo * Math.sin(angulo + 0.42));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function elipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
}

export function dibujarTrazo(ctx: CanvasRenderingContext2D, t: Trazo, w: number, h: number, fuente: string) {
  const s = w / ANCHO_BASE;
  const px = (p: PuntoP) => ({ x: p.x * w, y: p.y * h });
  const grosor = Math.max(1, t.grosor * s);
  ctx.save();
  ctx.globalAlpha = t.opacidad;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = t.color;
  ctx.lineWidth = grosor;
  const caja = limites(t, w / h);
  const x0 = caja.x0 * w, x1 = caja.x1 * w, y0 = caja.y0 * h, y1 = caja.y1 * h;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;

  switch (t.tipo) {
    case "flecha":
    case "flechaRecta": {
      const a = px(t.puntos[0]), b = px(t.puntos[1] ?? t.puntos[0]);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 3) break;
      const largo = Math.max(14 * s, grosor * 4.2);
      const c = t.tipo === "flecha" ? px(controlDeFlecha(t.puntos[0], t.puntos[1], w / h)) : a;
      // La línea acaba bajo la punta, no la atraviesa.
      const ang = Math.atan2(b.y - c.y, b.x - c.x);
      const fin = { x: b.x - Math.cos(ang) * largo * 0.6, y: b.y - Math.sin(ang) * largo * 0.6 };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      if (t.tipo === "flecha") ctx.quadraticCurveTo(c.x, c.y, fin.x, fin.y);
      else ctx.lineTo(fin.x, fin.y);
      ctx.stroke();
      punta(ctx, c, b, largo, t.color);
      break;
    }
    case "lapiz": {
      const ps = t.puntos.map(px);
      ctx.beginPath();
      ctx.moveTo(ps[0].x, ps[0].y);
      for (let i = 1; i < ps.length - 1; i += 1) ctx.quadraticCurveTo(ps[i].x, ps[i].y, (ps[i].x + ps[i + 1].x) / 2, (ps[i].y + ps[i + 1].y) / 2);
      if (ps.length > 1) ctx.lineTo(ps[ps.length - 1].x, ps[ps.length - 1].y);
      ctx.stroke();
      break;
    }
    case "texto": {
      const alto = ALTO_TEXTO * h * (t.grosor / 4);
      ctx.font = `800 ${alto}px ${fuente}`;
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.75)";
      ctx.shadowBlur = alto * 0.25;
      ctx.shadowOffsetY = alto * 0.04;
      ctx.fillStyle = t.color;
      ctx.fillText(t.texto ?? "", t.puntos[0].x * w, t.puntos[0].y * h);
      break;
    }
    case "etiqueta": {
      const alto = ALTO_ETIQUETA * h * (t.grosor / 4);
      ctx.font = `700 ${alto * 0.6}px ${fuente}`;
      const ancho = ctx.measureText(t.texto ?? "").width + alto;
      const x = t.puntos[0].x * w, y = t.puntos[0].y * h - alto / 2;
      ctx.shadowColor = "rgba(0,0,0,.4)";
      ctx.shadowBlur = alto * 0.3;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.roundRect(x, y, ancho, alto, alto / 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = tintaSobre(t.color);
      ctx.textBaseline = "middle";
      ctx.fillText(t.texto ?? "", x + alto / 2, y + alto / 2 + alto * 0.02);
      break;
    }
    case "rect":
      if (t.relleno) { ctx.fillStyle = rgba(t.relleno, 0.28); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      break;
    case "elipse":
      elipse(ctx, cx, cy, (x1 - x0) / 2, (y1 - y0) / 2);
      if (t.relleno) { ctx.fillStyle = rgba(t.relleno, 0.28); ctx.fill(); }
      ctx.stroke();
      break;
    case "zona": {
      // Un disco en el césped: más intenso en el centro, con un brillo arriba, como un foco desde la grada.
      const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      const base = t.relleno || t.color;
      const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      radial.addColorStop(0, rgba(base, 0.7));
      radial.addColorStop(0.7, rgba(base, 0.42));
      radial.addColorStop(1, rgba(base, 0.18));
      elipse(ctx, cx, cy, rx, ry);
      ctx.fillStyle = radial;
      ctx.fill();
      const brillo = ctx.createLinearGradient(cx, y0, cx, y1);
      brillo.addColorStop(0, "rgba(255,255,255,.28)");
      brillo.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = brillo;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, grosor * 0.5);
      ctx.strokeStyle = rgba(t.color, 0.95);
      ctx.stroke();
      break;
    }
    case "triangulo": {
      const relleno = ctx.createLinearGradient(cx, y0, cx, y1);
      relleno.addColorStop(0, rgba(t.relleno || t.color, 0.12));
      relleno.addColorStop(1, rgba(t.relleno || t.color, 0.45));
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
      ctx.closePath();
      ctx.fillStyle = relleno;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, grosor * 0.6);
      ctx.stroke();
      break;
    }
    case "foco": {
      // Un haz de luz que cae sobre el jugador: ancho arriba, su sombra en el suelo abajo.
      const ancho = x1 - x0, abajo = y1, arriba = y0;
      const rx = ancho * (t.foco === "cilindrico" ? 0.5 : 0.3), ry = Math.max(rx * 0.28, 3);
      const arribaMedio = t.foco === "estrecho" ? ancho * 0.22 : t.foco === "cilindrico" ? ancho * 0.5 : ancho * 0.5;
      const haz = ctx.createLinearGradient(cx, arriba, cx, abajo);
      haz.addColorStop(0, rgba(t.color, 0.02));
      haz.addColorStop(0.7, rgba(t.color, 0.2));
      haz.addColorStop(1, rgba(t.color, 0.42));
      ctx.beginPath();
      ctx.moveTo(cx - arribaMedio, arriba);
      ctx.lineTo(cx + arribaMedio, arriba);
      ctx.lineTo(cx + rx, abajo);
      ctx.lineTo(cx - rx, abajo);
      ctx.closePath();
      ctx.fillStyle = haz;
      ctx.fill();
      if (t.foco === "cilindrico") {
        elipse(ctx, cx, arriba, arribaMedio, ry);
        ctx.strokeStyle = rgba(t.color, 0.35);
        ctx.lineWidth = Math.max(1, grosor * 0.35);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(t.color, 0.55);
      ctx.lineWidth = Math.max(1, grosor * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx - arribaMedio, arriba); ctx.lineTo(cx - rx, abajo);
      ctx.moveTo(cx + arribaMedio, arriba); ctx.lineTo(cx + rx, abajo);
      ctx.stroke();
      const suelo = ctx.createRadialGradient(cx, abajo, 0, cx, abajo, rx);
      suelo.addColorStop(0, rgba(t.color, 0.85));
      suelo.addColorStop(1, rgba(t.color, 0.35));
      elipse(ctx, cx, abajo, rx, ry);
      ctx.fillStyle = suelo;
      ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1.5, grosor * 0.5);
      ctx.stroke();
      break;
    }
    case "conector": {
      const ps = t.puntos.map(px);
      ctx.beginPath();
      ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      const r = Math.max(4 * s, grosor * 1.35);
      ps.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();
        if (i === 0 || i === ps.length - 1) {
          ctx.strokeStyle = "rgba(255,255,255,.85)";
          ctx.lineWidth = Math.max(1.5, grosor * 0.4);
          ctx.stroke();
        }
      });
      break;
    }
    case "dorsal": {
      const r = RADIO_DORSAL * h * (t.grosor / 4);
      const p = px(t.puntos[0]);
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = r * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.stroke();
      ctx.fillStyle = tintaSobre(t.color);
      ctx.font = `800 ${r * ((t.texto ?? "").length > 2 ? 0.8 : 1.05)}px ${fuente}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t.texto ?? "", p.x, p.y + r * 0.06);
      break;
    }
  }
  ctx.restore();
}

/** El marco discontinuo de lo seleccionado, en el color del espacio. */
export function dibujarSeleccion(ctx: CanvasRenderingContext2D, t: Trazo, w: number, h: number, color: string, fuente: string) {
  let { x0, x1 } = limites(t, w / h);
  const { y0, y1 } = limites(t, w / h);
  // Los textos se miden de verdad: el cálculo sin lienzo es solo para acertar al pulsarlos.
  if (t.tipo === "texto" || t.tipo === "etiqueta") {
    const alto = (t.tipo === "texto" ? ALTO_TEXTO : ALTO_ETIQUETA) * h * (t.grosor / 4);
    ctx.save();
    ctx.font = t.tipo === "texto" ? `800 ${alto}px ${fuente}` : `700 ${alto * 0.6}px ${fuente}`;
    const ancho = ctx.measureText(t.texto ?? "").width + (t.tipo === "etiqueta" ? alto : 0);
    ctx.restore();
    x0 = t.puntos[0].x;
    x1 = x0 + ancho / w;
  }
  const margen = 8;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.strokeRect(x0 * w - margen, y0 * h - margen, (x1 - x0) * w + margen * 2, (y1 - y0) * h + margen * 2);
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff";
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    ctx.beginPath();
    ctx.arc(x * w + (x === x0 ? -margen : margen), y * h + (y === y0 ? -margen : margen), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}

export function dibujarTodo(ctx: CanvasRenderingContext2D, trazos: Trazo[], w: number, h: number, fuente: string) {
  for (const t of trazos) dibujarTrazo(ctx, t, w, h, fuente);
}
