"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CampoFlujo } from "@/lib/flujoPosesion";
import { numberLocale, t, tf } from "@/lib/i18n";

/**
 * La cancha animada del flujo de posesión: un campo de partículas que siguen
 * las corrientes del equipo, como un mapa de viento.
 *
 * Cuatro decisiones hacen que se lean ríos y no una maraña:
 *  · las partículas nacen sobre todo en las rutas más usadas (en proporción
 *    al cuadrado de su fuerza), no repartidas por igual;
 *  · cada una sigue su propia corriente: donde una celda tiene dos, toma la
 *    que más se parece a hacia donde ya iba, y no salta a la del vecino;
 *  · derivan hacia el centro del canal en el que van, que lo estrecha;
 *  · la estela se redibuja entera en cada cuadro. El truco habitual —pintar
 *    encima un velo semitransparente— deja un poso que nunca termina de irse;
 *    así, lo que se va desaparece del todo.
 *
 * Coordenadas de StatsBomb (120 × 80, ataque hacia la derecha), así que la
 * banda de arriba es la izquierda del equipo que ataca.
 */

/** De lenta a rápida: un solo tono, de apagado a brillante sobre el campo oscuro. */
export const RAMPA_RAPIDEZ = ["#2c6b5a", "#26876b", "#16a57c", "#12c48b", "#4dd6a3", "#8be5c2", "#d2f6e6"];
/** Grosor de la estela según la fuerza de la ruta, en px para una cancha de 480 px. */
export const GROSORES = [0.5, 0.9, 1.5];
const CAMPO = "#0e1512";
const LARGO = 120;
const ANCHO = 80;
const MARGEN = 3;
const ALFAS = 5;

type Sistema = {
  n: number;
  /** Puntos de estela por partícula. */
  l: number;
  x: Float32Array; y: Float32Array;
  hx: Float32Array; hy: Float32Array;
  edad: Float32Array; vida: Float32Array;
  /** Estela: x, y, rapidez y fuerza de cada punto, en anillo. */
  rastro: Float32Array;
  cabeza: Int32Array; largo: Int32Array;
};

function crearSistema(n: number, l: number): Sistema {
  return {
    n, l,
    x: new Float32Array(n), y: new Float32Array(n),
    hx: new Float32Array(n), hy: new Float32Array(n),
    edad: new Float32Array(n), vida: new Float32Array(n),
    rastro: new Float32Array(n * l * 4),
    cabeza: new Int32Array(n), largo: new Int32Array(n),
  };
}

/** Lo acumulado de intensidad^1,3 por celda: dónde nace cada partícula. */
function acumulado(campo: CampoFlujo) {
  const salida = new Float32Array(campo.intensidad.length);
  let suma = 0;
  for (let i = 0; i < campo.intensidad.length; i += 1) {
    suma += campo.intensidad[i] ** 1.3;
    salida[i] = suma;
  }
  return salida;
}

function nacer(s: Sistema, p: number, campo: CampoFlujo, cdf: Float32Array) {
  const total = cdf[cdf.length - 1];
  s.largo[p] = 0;
  s.edad[p] = 0;
  s.vida[p] = 60 + Math.random() * 90;
  if (!(total > 0)) { s.vida[p] = 0; return; }
  const objetivo = Math.random() * total;
  let bajo = 0;
  let alto = cdf.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (cdf[medio] < objetivo) bajo = medio + 1;
    else alto = medio;
  }
  const c = bajo % campo.cols;
  const f = Math.floor(bajo / campo.cols);
  s.x[p] = (c + Math.random()) * campo.celda;
  s.y[p] = (f + Math.random()) * campo.celda;
  // La corriente que sigue, si la celda tiene dos: al azar según su fuerza.
  const [a, b] = campo.corrientes;
  const fa = a.fuerza[bajo] ** 2;
  const fb = b.fuerza[bajo] ** 2;
  const k = Math.random() * (fa + fb) < fa ? a : b;
  s.hx[p] = k.ux[bajo];
  s.hy[p] = k.uy[bajo];
}

type Muestra = { vx: number; vy: number; fuerza: number; rapidez: number };

/**
 * La corriente en un punto, interpolando las cuatro celdas que lo rodean.
 * En cada celda se toma la corriente que más se parece a la dirección de la
 * partícula; las que van a contramano (más de 90°) no cuentan: si es lo único
 * que hay, la partícula se queda sin corriente y se apaga.
 */
function muestrear(campo: CampoFlujo, x: number, y: number, hx: number, hy: number, salida: Muestra) {
  const gx = x / campo.celda - 0.5;
  const gy = y / campo.celda - 0.5;
  const c0 = Math.floor(gx);
  const f0 = Math.floor(gy);
  const tx = gx - c0;
  const ty = gy - f0;
  let vx = 0;
  let vy = 0;
  let fuerza = 0;
  let rapidez = 0;
  for (let dc = 0; dc < 2; dc += 1) {
    for (let df = 0; df < 2; df += 1) {
      const c = Math.min(campo.cols - 1, Math.max(0, c0 + dc));
      const f = Math.min(campo.filas - 1, Math.max(0, f0 + df));
      const peso = (dc ? tx : 1 - tx) * (df ? ty : 1 - ty);
      const i = f * campo.cols + c;
      rapidez += peso * campo.rapidez[i];
      let mejor = -1;
      let parecido = 0;
      for (let k = 0; k < 2; k += 1) {
        const corriente = campo.corrientes[k];
        if (corriente.fuerza[i] <= 0) continue;
        const producto = corriente.ux[i] * hx + corriente.uy[i] * hy;
        if (producto > parecido) { parecido = producto; mejor = k; }
      }
      if (mejor < 0) continue;
      const corriente = campo.corrientes[mejor];
      vx += peso * corriente.fuerza[i] * corriente.ux[i];
      vy += peso * corriente.fuerza[i] * corriente.uy[i];
      fuerza += peso * corriente.fuerza[i];
    }
  }
  salida.vx = vx;
  salida.vy = vy;
  salida.fuerza = fuerza;
  salida.rapidez = rapidez;
}

function intensidadEn(campo: CampoFlujo, x: number, y: number) {
  const gx = Math.min(campo.cols - 1, Math.max(0, x / campo.celda - 0.5));
  const gy = Math.min(campo.filas - 1, Math.max(0, y / campo.celda - 0.5));
  const c0 = Math.floor(gx);
  const f0 = Math.floor(gy);
  const c1 = Math.min(campo.cols - 1, c0 + 1);
  const f1 = Math.min(campo.filas - 1, f0 + 1);
  const tx = gx - c0;
  const ty = gy - f0;
  const v = campo.intensidad;
  const arriba = v[f0 * campo.cols + c0] * (1 - tx) + v[f0 * campo.cols + c1] * tx;
  const abajo = v[f1 * campo.cols + c0] * (1 - tx) + v[f1 * campo.cols + c1] * tx;
  return arriba * (1 - ty) + abajo * ty;
}

/**
 * Un paso de la simulación. `ritmo` corrige por los cuadros por segundo
 * reales. La estela guarda un punto nuevo cada dos pasos (`nuevo`) y entre
 * medias solo mueve la punta: el doble de largo con los mismos puntos.
 */
function avanzar(s: Sistema, campo: CampoFlujo, cdf: Float32Array, cenido: number, ritmo: number, nuevo: boolean) {
  const muestra: Muestra = { vx: 0, vy: 0, fuerza: 0, rapidez: 0 };
  const e = campo.celda * 0.75;
  for (let p = 0; p < s.n; p += 1) {
    if (s.edad[p] >= s.vida[p]) nacer(s, p, campo, cdf);
    if (s.vida[p] <= 0) continue;
    muestrear(campo, s.x[p], s.y[p], s.hx[p], s.hy[p], muestra);
    let paso = 0;
    if (muestra.fuerza < 0.02) {
      // En calma: se apaga en unos cuadros, sin moverse más.
      s.vida[p] = Math.min(s.vida[p], s.edad[p] + 10);
    } else {
      const largo = Math.hypot(muestra.vx, muestra.vy) || 1;
      let hx = s.hx[p] + (muestra.vx / largo - s.hx[p]) * 0.5;
      let hy = s.hy[p] + (muestra.vy / largo - s.hy[p]) * 0.5;
      const h = Math.hypot(hx, hy) || 1;
      hx /= h;
      hy /= h;
      s.hx[p] = hx;
      s.hy[p] = hy;
      // Velocidad exagerada: la de la zona como posición en la liga, elevada
      // a 1,6, entre ×0,22 y ×2,1 de la base.
      paso = 0.45 * (0.22 + 1.9 * muestra.rapidez ** 1.6) * ritmo;
      let x = s.x[p] + hx * paso;
      let y = s.y[p] + hy * paso;
      // Hacia el centro del canal: la pendiente de la intensidad, solo en
      // lo que tiene de perpendicular a la marcha.
      const gx = (intensidadEn(campo, x + e, y) - intensidadEn(campo, x - e, y)) / (2 * e);
      const gy = (intensidadEn(campo, x, y + e) - intensidadEn(campo, x, y - e)) / (2 * e);
      const proyeccion = gx * hx + gy * hy;
      const px = gx - proyeccion * hx;
      const py = gy - proyeccion * hy;
      const empuje = Math.hypot(px, py);
      if (empuje > 0) {
        const deriva = Math.min(empuje * cenido, paso * 0.6) / empuje;
        x += px * deriva;
        y += py * deriva;
      }
      if (x < 0 || x > LARGO || y < 0 || y > ANCHO) {
        s.vida[p] = Math.min(s.vida[p], s.edad[p] + 6);
        x = Math.min(LARGO, Math.max(0, x));
        y = Math.min(ANCHO, Math.max(0, y));
      }
      s.x[p] = x;
      s.y[p] = y;
    }
    const avanza = nuevo || s.largo[p] === 0;
    const cabeza = avanza ? (s.cabeza[p] + 1) % s.l : s.cabeza[p];
    const base = (p * s.l + cabeza) * 4;
    s.rastro[base] = s.x[p];
    s.rastro[base + 1] = s.y[p];
    s.rastro[base + 2] = muestra.rapidez;
    s.rastro[base + 3] = muestra.fuerza;
    s.cabeza[p] = cabeza;
    if (avanza) s.largo[p] = Math.min(s.l, s.largo[p] + 1);
    s.edad[p] += ritmo;
  }
}

function dibujarCancha(ctx: CanvasRenderingContext2D, escala: number, ancho: number, alto: number) {
  ctx.fillStyle = CAMPO;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.save();
  ctx.translate(MARGEN * escala, MARGEN * escala);
  ctx.scale(escala, escala);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = Math.max(1, escala * 0.28) / escala;
  ctx.strokeRect(0, 0, LARGO, ANCHO);
  ctx.beginPath();
  ctx.moveTo(LARGO / 2, 0);
  ctx.lineTo(LARGO / 2, ANCHO);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(LARGO / 2, ANCHO / 2, 10, 0, Math.PI * 2);
  ctx.stroke();
  const punto = (x: number, y: number) => { ctx.beginPath(); ctx.arc(x, y, 0.55, 0, Math.PI * 2); ctx.fill(); };
  punto(LARGO / 2, ANCHO / 2);
  // La media luna: el trozo del círculo de 10 alrededor del punto de penalti
  // que queda fuera del área. cos θ = (18 − 12) / 10.
  const apertura = Math.acos(0.6);
  for (const lado of [0, 1]) {
    const x = (valor: number) => (lado ? LARGO - valor : valor);
    ctx.strokeRect(Math.min(x(0), x(18)), 18, 18, 44);
    ctx.strokeRect(Math.min(x(0), x(6)), 30, 6, 20);
    ctx.strokeRect(Math.min(x(0), x(-1.6)), 36, 1.6, 8);
    punto(x(12), ANCHO / 2);
    ctx.beginPath();
    if (lado) ctx.arc(x(12), ANCHO / 2, 10, Math.PI - apertura, Math.PI + apertura);
    else ctx.arc(x(12), ANCHO / 2, 10, -apertura, apertura);
    ctx.stroke();
  }
  ctx.restore();
}

const FLECHAS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

export function CanchaFlujo({ campo, estela, ancho, etiqueta }: {
  campo: CampoFlujo | null;
  /** 0–1: largo de la estela. */
  estela: number;
  /** 0–1: ancho del canal; cuanto más estrecho, más se ciñen las partículas. */
  ancho: number;
  etiqueta: string;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [tamano, setTamano] = useState(0);
  const [lectura, setLectura] = useState<{ x: number; y: number; texto: string } | null>(null);

  useEffect(() => {
    const nodo = marco.current;
    if (!nodo) return;
    const observador = new ResizeObserver(([entrada]) => setTamano(Math.round(entrada.contentRect.width)));
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas || !tamano) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const escalaCss = tamano / (LARGO + MARGEN * 2);
    const altoCss = (ANCHO + MARGEN * 2) * escalaCss;
    canvas.width = Math.round(tamano * dpr);
    canvas.height = Math.round(altoCss * dpr);
    canvas.style.height = `${altoCss}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const escala = escalaCss * dpr;
    const fondo = document.createElement("canvas");
    fondo.width = canvas.width;
    fondo.height = canvas.height;
    const ctxFondo = fondo.getContext("2d");
    if (!ctxFondo) return;
    dibujarCancha(ctxFondo, escala, canvas.width, canvas.height);
    ctx.drawImage(fondo, 0, 0);
    if (!campo || !campo.particulas) return;

    const cdf = acumulado(campo);
    const n = Math.max(1, Math.round(campo.particulas * Math.min(1, tamano / 440)));
    const s = crearSistema(n, Math.round(6 + estela * 30));
    for (let p = 0; p < n; p += 1) {
      nacer(s, p, campo, cdf);
      s.edad[p] = Math.random() * s.vida[p];
    }
    const cenido = 0.6 + (1 - ancho) * 2.4;
    let paso = 0;
    for (; paso < s.l * 2 + 30; paso += 1) avanzar(s, campo, cdf, cenido, 1, paso % 2 === 0);

    const grosor = GROSORES.map((g) => g * (tamano / 480) * dpr);
    const caminos: Array<Path2D | null> = new Array(RAMPA_RAPIDEZ.length * ALFAS * GROSORES.length).fill(null);
    const aX = (x: number) => (MARGEN + x) * escala;
    const dibujar = () => {
      ctx.drawImage(fondo, 0, 0);
      caminos.fill(null);
      for (let p = 0; p < s.n; p += 1) {
        const largo = s.largo[p];
        if (largo < 2) continue;
        const apagado = Math.min(1, s.edad[p] / 8) * Math.min(1, Math.max(0, s.vida[p] - s.edad[p]) / 12);
        if (apagado <= 0) continue;
        let anterior = -1;
        for (let j = 1; j < largo; j += 1) {
          const desde = (p * s.l + ((s.cabeza[p] - largo + j + s.l) % s.l)) * 4;
          const hasta = (p * s.l + ((s.cabeza[p] - largo + j + 1 + s.l) % s.l)) * 4;
          // La punta siempre a pleno; la cola se desvanece hasta cero.
          const alfa = ((s.l - largo + j) / (s.l - 1)) * apagado;
          if (alfa < 0.06) { anterior = -1; continue; }
          const color = Math.min(RAMPA_RAPIDEZ.length - 1, Math.floor(s.rastro[hasta + 2] * RAMPA_RAPIDEZ.length));
          const fuerza = s.rastro[hasta + 3];
          const grueso = fuerza < 0.34 ? 0 : fuerza < 0.67 ? 1 : 2;
          const cubo = (color * ALFAS + Math.min(ALFAS - 1, Math.floor(alfa * ALFAS))) * GROSORES.length + grueso;
          const camino = caminos[cubo] ?? (caminos[cubo] = new Path2D());
          if (cubo !== anterior) camino.moveTo(aX(s.rastro[desde]), aX(s.rastro[desde + 1]));
          camino.lineTo(aX(s.rastro[hasta]), aX(s.rastro[hasta + 1]));
          anterior = cubo;
        }
      }
      ctx.lineCap = "butt";
      ctx.lineJoin = "round";
      caminos.forEach((camino, cubo) => {
        if (!camino) return;
        const grueso = cubo % GROSORES.length;
        const alfa = Math.floor(cubo / GROSORES.length) % ALFAS;
        const color = Math.floor(cubo / (GROSORES.length * ALFAS));
        ctx.strokeStyle = RAMPA_RAPIDEZ[color];
        ctx.globalAlpha = ((alfa + 0.6) / ALFAS) * 0.8;
        ctx.lineWidth = grosor[grueso];
        ctx.stroke(camino);
      });
      ctx.globalAlpha = 1;
    };

    // Sin animación si quien mira la pidió así: un cuadro quieto basta.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dibujar();
      return;
    }
    let cuadro = 0;
    let previo = 0;
    let visible = true;
    const bucle = (ahora: number) => {
      const ritmo = previo ? Math.min(2.5, (ahora - previo) / (1000 / 60)) : 1;
      previo = ahora;
      paso += 1;
      avanzar(s, campo, cdf, cenido, ritmo, paso % 2 === 0);
      dibujar();
      cuadro = requestAnimationFrame(bucle);
    };
    // Fuera de la vista —otra sección abierta, o más abajo en la página— no
    // se anima: dos canchas a 60 cuadros por segundo no son gratis.
    const observador = new IntersectionObserver(([entrada]) => {
      const ahora = entrada.isIntersecting;
      if (ahora === visible) return;
      visible = ahora;
      if (visible) { previo = 0; cuadro = requestAnimationFrame(bucle); } else cancelAnimationFrame(cuadro);
    });
    observador.observe(canvas);
    cuadro = requestAnimationFrame(bucle);
    return () => { cancelAnimationFrame(cuadro); observador.disconnect(); };
  }, [campo, estela, ancho, tamano]);

  const leer = (evento: PointerEvent<HTMLCanvasElement>) => {
    if (!campo) return;
    const caja = evento.currentTarget.getBoundingClientRect();
    const escala = caja.width / (LARGO + MARGEN * 2);
    const x = (evento.clientX - caja.left) / escala - MARGEN;
    const y = (evento.clientY - caja.top) / escala - MARGEN;
    if (x < 0 || x >= LARGO || y < 0 || y >= ANCHO) { setLectura(null); return; }
    const i = Math.floor(y / campo.celda) * campo.cols + Math.floor(x / campo.celda);
    const [principal] = campo.corrientes;
    const velocidad = campo.velocidad[i];
    const decimal = (valor: number) => valor.toLocaleString(numberLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    const texto = campo.intensidad[i] > 0
      ? tf("{flecha} {m} m de balón por partido · a {v} m/s", {
        flecha: FLECHAS[(Math.round(Math.atan2(principal.uy[i], principal.ux[i]) / (Math.PI / 4)) + 8) % 8],
        m: decimal(campo.metros[i]),
        v: Number.isFinite(velocidad) ? decimal(velocidad) : "—",
      })
      : t("Calma: aquí el equipo apenas mueve el balón");
    setLectura({ x: evento.clientX - caja.left, y: evento.clientY - caja.top, texto });
  };

  return <div className="flujo-cancha" ref={marco}>
    <canvas ref={lienzo} role="img" aria-label={etiqueta} onPointerMove={leer} onPointerLeave={() => setLectura(null)} />
    {lectura && <span className="flujo-lectura" style={{ left: lectura.x, top: lectura.y }}>{lectura.texto}</span>}
  </div>;
}
