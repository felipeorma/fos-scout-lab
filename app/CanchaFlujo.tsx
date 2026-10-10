"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CampoFlujo } from "@/lib/flujoPosesion";
import { numberLocale, t, tf } from "@/lib/i18n";
import {
  ANCHO, GROSORES, LARGO, MARGEN, RAMPA_RAPIDEZ,
  avanzarParticulas, crearParticulas, dibujarCancha, dibujarEstelas,
} from "@/lib/particulasFlujo";

/**
 * La cancha animada del flujo de posesión. El motor —partículas, estelas y la
 * cancha— vive en lib/particulasFlujo.ts; aquí solo se monta en un lienzo,
 * se anima y se lee la zona bajo el cursor.
 */

export { GROSORES, RAMPA_RAPIDEZ };

/*
 * Un solo bucle de animación para todas las canchas de la página. Con treinta
 * miniaturas en la cuadrícula, treinta bucles propios competían por el mismo
 * cuadro; así se dibujan todas en la misma pasada.
 */
const suscritas = new Set<(ritmo: number) => void>();
let cuadroCompartido = 0;
let previoCompartido = 0;
function bucleCompartido(ahora: number) {
  const ritmo = previoCompartido ? Math.min(2.5, (ahora - previoCompartido) / (1000 / 60)) : 1;
  previoCompartido = ahora;
  for (const dibujar of suscritas) dibujar(ritmo);
  cuadroCompartido = suscritas.size ? requestAnimationFrame(bucleCompartido) : 0;
}
function suscribir(dibujar: (ritmo: number) => void) {
  suscritas.add(dibujar);
  if (!cuadroCompartido) { previoCompartido = 0; cuadroCompartido = requestAnimationFrame(bucleCompartido); }
  return () => { suscritas.delete(dibujar); };
}

const FLECHAS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

export function CanchaFlujo({ campo, estela, ancho, etiqueta, densidad = 1, lectura: conLectura = true }: {
  campo: CampoFlujo | null;
  /** 0–1: largo de la estela. */
  estela: number;
  /** 0–1: ancho del canal; cuanto más estrecho, más se ciñen las partículas. */
  ancho: number;
  etiqueta: string;
  /** Cuántas partículas, frente a una cancha grande: las miniaturas llevan menos. */
  densidad?: number;
  /** La lectura de la zona al pasar el cursor; las miniaturas no la llevan. */
  lectura?: boolean;
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
    dibujarCancha(ctxFondo, 0, 0, escala);
    ctx.drawImage(fondo, 0, 0);
    const particulas = crearParticulas(campo, { densidad: densidad * Math.min(1, tamano / 440), estela, ancho });
    if (!particulas) return;
    const grosores = GROSORES.map((g) => g * Math.max(0.7, tamano / 480) * dpr);
    const dibujar = () => {
      ctx.drawImage(fondo, 0, 0);
      dibujarEstelas(ctx, particulas, 0, 0, escala, grosores);
    };

    // Sin animación si quien mira la pidió así: un cuadro quieto basta.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dibujar();
      return;
    }
    const paso = (ritmo: number) => {
      avanzarParticulas(particulas, ritmo);
      dibujar();
    };
    dibujar();
    // Fuera de la vista —otra sección abierta, o más abajo en la página— no
    // se anima: las canchas no son gratis.
    let soltar: (() => void) | null = null;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting && !soltar) soltar = suscribir(paso);
      else if (!entrada.isIntersecting && soltar) { soltar(); soltar = null; }
    });
    observador.observe(canvas);
    return () => { soltar?.(); observador.disconnect(); };
  }, [campo, estela, ancho, tamano, densidad]);

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
    <canvas ref={lienzo} role="img" aria-label={etiqueta} onPointerMove={conLectura ? leer : undefined} onPointerLeave={() => setLectura(null)} />
    {lectura && <span className="flujo-lectura" style={{ left: lectura.x, top: lectura.y }}>{lectura.texto}</span>}
  </div>;
}
