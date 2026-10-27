"use client";

import { useEffect, useRef, useState, type PointerEvent as EventoDePuntero } from "react";
import { deSerie, equipacionDe, instanteEn, duracionTotal, type Jugada } from "@/lib/abp";
import { reloj, type Codificacion } from "@/lib/codificacion";
import { activeLang, numberLocale, t } from "@/lib/i18n";
import type { Diapositiva } from "@/lib/presentacion";
import type { Opciones } from "../abp/motor";
import { Tablero2D } from "../abp/tablero2d";
import { ChevronLeft, ChevronRight, Pause, Pencil, Play, Trash, X } from "../Icons";

/** Las opciones de dibujo de un sistema con sus propios colores y equipaciones, para el tablero que lo enseña. */
export function opcionesDeSistema(j: Jugada, acento: string, fuente: string): Opciones {
  const idioma = activeLang();
  const formato = new Intl.NumberFormat(numberLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    colorLocal: j.colores.local ?? acento, colorRival: j.colores.rival, colorAnotacion: j.colores.anotacion, acento, nombres: true, fuente,
    equipaciones: { local: equipacionDe(j, "local"), rival: equipacionDe(j, "rival") }, ambiente: j.ambiente,
    rotulo: (rol) => deSerie(rol, idioma), metros: (m) => `${formato.format(m)} m`,
  };
}

/** El encuadre de cada fase de un sistema, el suyo si lo tiene; «cerca de la jugada», el del sistema. */
const encuadreDe = (j: Jugada, i: number) => {
  const c = j.fases[i]?.camara?.encuadre;
  return c && c !== "jugada" ? c : j.ambiente.encuadre;
};

/** Lo que dice cada diapositiva: el código y el tiempo de un clip, o el nombre del sistema. */
export function tituloDe(d: Diapositiva, codificacion: Codificacion | null) {
  if (d.tipo === "momento") {
    const c = codificacion?.codigos.find((x) => x.id === d.momento.codigo);
    return `${c?.nombre ?? t("Clip")} · ${reloj(d.momento.inicio)}–${reloj(d.momento.fin)}`;
  }
  if (d.tipo === "sistema") return deSerie(d.jugada.nombre, activeLang());
  return t("Ya no está");
}

/**
 * Anima un sistema en un tablero 2D: desde el principio hasta el final, a
 * tiempo real; devuelve con qué pararlo.
 */
function animarSistema(tablero: Tablero2D, j: Jugada, opciones: Opciones, cadaCuadro?: () => void, alAcabar?: () => void) {
  let montada = -1, cuadro = 0;
  const inicio = performance.now(), total = duracionTotal(j);
  const paso = () => {
    const s = (performance.now() - inicio) / 1000;
    const { fase, t: tt } = instanteEn(j, Math.min(s, total));
    if (fase !== montada) {
      tablero.montar(j, fase, opciones, null, null);
      tablero.vista("tactica", encuadreDe(j, fase), null, montada < 0);
      montada = fase;
    }
    tablero.instante(tt);
    cadaCuadro?.();
    if (s > total + 1) { alAcabar?.(); return; }
    cuadro = requestAnimationFrame(paso);
  };
  paso();
  return () => cancelAnimationFrame(cuadro);
}

/**
 * La presentación a pantalla completa: un clip o un sistema por diapositiva,
 * con su nota abajo. Flechas para pasar, espacio para volver a ver, P para el
 * lápiz, C para borrarlo y Esc para salir.
 */
export function Presentador({ lista, codificacion, video, acento, fuente, onCerrar }: {
  lista: Diapositiva[];
  codificacion: Codificacion | null;
  /** El vídeo de los clips (blob: del archivo abierto); sin él, los clips no se pueden enseñar. */
  video: string | null;
  acento: string;
  fuente: string;
  onCerrar: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const escenario = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const capa = useRef<HTMLCanvasElement>(null);
  const trazos = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const dibujando = useRef(false);
  const [indice, setIndice] = useState(0);
  const [vuelta, setVuelta] = useState(0);
  const [lapiz, setLapiz] = useState(false);
  const [pausado, setPausado] = useState(false);
  const d = lista[indice];

  // A pantalla completa si el navegador deja; si no, ocupa la ventana igual.
  useEffect(() => {
    const el = raiz.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => { /* sin permiso: la ventana entera vale */ });
    return () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, []);

  // Cada diapositiva empieza limpia: el clip desde su inicio, el sistema desde su primera fase.
  useEffect(() => {
    trazos.current = [];
    pintarCapa();
    if (!d) return;
    if (d.tipo === "momento") {
      const v = videoRef.current;
      if (!v) return;
      const empezar = () => { v.currentTime = d.momento.inicio; void v.play().catch(() => {}); };
      if (v.readyState >= 1) empezar(); else v.addEventListener("loadedmetadata", empezar, { once: true });
      return () => v.removeEventListener("loadedmetadata", empezar);
    }
    if (d.tipo === "sistema" && escenario.current) {
      const tablero = new Tablero2D(escenario.current);
      const parar = animarSistema(tablero, d.jugada, opcionesDeSistema(d.jugada, acento, fuente));
      return () => { parar(); tablero.destruir(); };
    }
  }, [indice, vuelta, d?.elemento.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ir = (paso: number) => { setPausado(false); setIndice((i) => Math.max(0, Math.min(lista.length - 1, i + paso))); };
  const otraVez = () => {
    const v = videoRef.current;
    if (d?.tipo === "momento" && v && !v.paused) { v.pause(); setPausado(true); return; }
    if (d?.tipo === "momento" && v && v.currentTime < d.momento.fin - 0.2) { void v.play(); setPausado(false); return; }
    setPausado(false);
    setVuelta((n) => n + 1);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const k = e.key;
      if (["ArrowRight", "PageDown", "ArrowLeft", "PageUp", " ", "Escape", "p", "P", "c", "C"].includes(k)) { e.preventDefault(); e.stopPropagation(); }
      if (k === "ArrowRight" || k === "PageDown") ir(1);
      else if (k === "ArrowLeft" || k === "PageUp") ir(-1);
      else if (k === " ") otraVez();
      else if (k === "Escape") onCerrar();
      else if (k === "p" || k === "P") setLapiz((x) => !x);
      else if (k === "c" || k === "C") { trazos.current = []; pintarCapa(); }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  });

  function pintarCapa() {
    const c = capa.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const trazo of trazos.current) {
      for (const [ancho, color] of [[9, "rgba(0,0,0,.45)"], [5, "#ffd23f"]] as const) {
        ctx.beginPath();
        trazo.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = color;
        ctx.lineWidth = ancho;
        ctx.stroke();
      }
    }
  }
  const punto = (e: EventoDePuntero<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const nota = d?.elemento.nota.trim() || (d?.tipo === "momento" ? d.momento.nota : d?.tipo === "sistema" ? deSerie(d.jugada.fases[0]?.nota ?? "", activeLang()) : "");

  return <div className="pintado-presentacion" ref={raiz} role="dialog" aria-label={t("Presentación")}>
    <div className="pintado-presentacion-escenario">
      {d?.tipo === "momento" && (video
        ? <video ref={videoRef} key={`${d.elemento.id}-${vuelta}`} src={video} playsInline
          onPlay={() => setPausado(false)} onPause={() => setPausado(true)}
          onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= d.momento.fin) e.currentTarget.pause(); }} />
        : <p className="pintado-presentacion-falta">{t("Abre el vídeo del partido para enseñar sus clips.")}</p>)}
      {d?.tipo === "sistema" && <div className="pintado-presentacion-tablero" ref={escenario} key={`${d.elemento.id}-${vuelta}`} />}
      {d?.tipo === "falta" && <p className="pintado-presentacion-falta">{t("Este elemento ya no está: se borró el clip o el sistema.")}</p>}
      <canvas ref={capa} className={`pintado-presentacion-lapiz${lapiz ? " activo" : ""}`}
        onPointerDown={(e) => { if (!lapiz) return; e.currentTarget.setPointerCapture(e.pointerId); dibujando.current = true; trazos.current.push([punto(e)]); pintarCapa(); }}
        onPointerMove={(e) => { if (!dibujando.current) return; trazos.current[trazos.current.length - 1].push(punto(e)); pintarCapa(); }}
        onPointerUp={() => { dibujando.current = false; }} onPointerCancel={() => { dibujando.current = false; }} />
    </div>
    <div className="pintado-presentacion-pie">
      <span className="pintado-presentacion-cuenta">{indice + 1} / {lista.length}</span>
      <div className="pintado-presentacion-texto">
        <b>{d ? tituloDe(d, codificacion) : ""}</b>
        {nota && <span>{nota}</span>}
      </div>
      <div className="pintado-presentacion-botones">
        <button type="button" onClick={() => ir(-1)} disabled={indice === 0} aria-label={t("Anterior")} title={t("Anterior (←)")}><ChevronLeft size={18} /></button>
        <button type="button" onClick={otraVez} aria-label={pausado ? t("Seguir") : t("Pausa o volver a ver")} title={t("Espacio")}>{pausado ? <Play size={16} /> : <Pause size={16} />}</button>
        <button type="button" onClick={() => ir(1)} disabled={indice === lista.length - 1} aria-label={t("Siguiente")} title={t("Siguiente (→)")}><ChevronRight size={18} /></button>
        <i aria-hidden="true" />
        <button type="button" className={lapiz ? "activa" : ""} aria-pressed={lapiz} onClick={() => setLapiz((x) => !x)} aria-label={t("Lápiz")} title={t("Lápiz (P)")}><Pencil size={16} /></button>
        <button type="button" onClick={() => { trazos.current = []; pintarCapa(); }} aria-label={t("Borrar lo pintado")} title={t("Borrar lo pintado (C)")}><Trash size={15} /></button>
        <button type="button" onClick={onCerrar} aria-label={t("Salir de la presentación")} title={t("Salir (Esc)")}><X size={17} /></button>
      </div>
    </div>
  </div>;
}

/**
 * La presentación entera como un solo vídeo, a tiempo real: una portadilla
 * con el número, el título y la nota, y después el clip (del vídeo abierto)
 * o el sistema animado. Sin sonido.
 */
export async function grabarPresentacion({ lista, codificacion, video, acento, fuente, titulo, firma, onProgreso }: {
  lista: Diapositiva[];
  codificacion: Codificacion | null;
  video: string | null;
  acento: string;
  fuente: string;
  titulo: string;
  firma: string;
  onProgreso: (n: number, total: number) => void;
}): Promise<{ blob: Blob; extension: string } | null> {
  const tipos = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mime = typeof MediaRecorder === "undefined" ? undefined : tipos.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;
  const W = 1280, H = 720;
  const lienzo = document.createElement("canvas");
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext("2d")!;
  const flujo = lienzo.captureStream(30);
  const grabadora = new MediaRecorder(flujo, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const trozos: Blob[] = [];
  grabadora.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
  const terminado = new Promise<void>((resolver) => { grabadora.onstop = () => resolver(); });
  grabadora.start(250);

  const encajar = (fuenteDeImagen: CanvasImageSource, ancho: number, alto: number) => {
    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, W, H);
    if (!ancho || !alto) return;
    const k = Math.min(W / ancho, H / alto);
    ctx.drawImage(fuenteDeImagen, (W - ancho * k) / 2, (H - alto * k) / 2, ancho * k, alto * k);
  };
  const banda = (texto: string) => {
    if (!texto) return;
    ctx.font = `500 22px ${fuente}`;
    const ancho = Math.min(W - 80, ctx.measureText(texto).width + 40);
    ctx.fillStyle = "rgba(8,8,10,.72)";
    ctx.beginPath();
    ctx.roundRect(40, H - 84, ancho, 48, 12);
    ctx.fill();
    ctx.fillStyle = "#f5f5f7";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, 60, H - 60, ancho - 40);
  };
  const durante = (segundos: number, pintar: () => void) => new Promise<void>((resolver) => {
    const inicio = performance.now();
    const paso = () => { pintar(); if ((performance.now() - inicio) / 1000 >= segundos) { resolver(); return; } requestAnimationFrame(paso); };
    paso();
  });
  const validas = lista.filter((d) => d.tipo !== "falta" && (d.tipo !== "momento" || video));
  const notaDe = (d: Diapositiva) => d.elemento.nota.trim() || (d.tipo === "momento" ? d.momento.nota : "");

  // Un vídeo aparte para los clips: el de la pantalla no se toca.
  const clip = video ? Object.assign(document.createElement("video"), { src: video, muted: true, playsInline: true }) : null;
  if (clip) await new Promise<void>((resolver) => { if (clip.readyState >= 1) resolver(); else clip.addEventListener("loadedmetadata", () => resolver(), { once: true }); });

  for (let k = 0; k < validas.length; k += 1) {
    const d = validas[k];
    onProgreso(k + 1, validas.length);
    // La portadilla.
    await durante(1.2, () => {
      ctx.fillStyle = "#08080a";
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = acento;
      ctx.font = `700 18px ${fuente}`;
      ctx.fillText(`${String(k + 1).padStart(2, "0")} / ${String(validas.length).padStart(2, "0")}${titulo ? ` · ${titulo.toUpperCase()}` : ""}`, 80, H / 2 - 60);
      ctx.fillStyle = "#f5f5f7";
      ctx.font = `700 46px ${fuente}`;
      ctx.fillText(tituloDe(d, codificacion), 80, H / 2, W - 160);
      const nota = notaDe(d);
      if (nota) { ctx.fillStyle = "rgba(245,245,247,.75)"; ctx.font = `500 26px ${fuente}`; ctx.fillText(nota, 80, H / 2 + 50, W - 160); }
      if (firma) { ctx.fillStyle = "rgba(245,245,247,.45)"; ctx.font = `600 16px ${fuente}`; ctx.fillText(`${firma} · FOS Scout Lab`, 80, H - 40); }
    });
    if (d.tipo === "momento" && clip) {
      clip.currentTime = d.momento.inicio;
      await new Promise<void>((resolver) => clip.addEventListener("seeked", () => resolver(), { once: true }));
      await clip.play().catch(() => {});
      await new Promise<void>((resolver) => {
        const paso = () => {
          encajar(clip, clip.videoWidth, clip.videoHeight);
          banda(notaDe(d));
          if (clip.currentTime >= d.momento.fin || clip.ended) { clip.pause(); resolver(); return; }
          requestAnimationFrame(paso);
        };
        paso();
      });
    } else if (d.tipo === "sistema") {
      const caja = document.createElement("div");
      caja.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
      document.body.appendChild(caja);
      const tablero = new Tablero2D(caja);
      try {
        await new Promise<void>((resolver) => {
          animarSistema(tablero, d.jugada, opcionesDeSistema(d.jugada, acento, fuente), () => { encajar(tablero.canvas, tablero.canvas.width, tablero.canvas.height); banda(notaDe(d)); }, resolver);
        });
      } finally {
        tablero.destruir();
        caja.remove();
      }
    }
  }
  grabadora.stop();
  await terminado;
  flujo.getTracks().forEach((p) => p.stop());
  return { blob: new Blob(trozos, { type: mime.split(";")[0] }), extension: mime.includes("mp4") ? "mp4" : "webm" };
}
