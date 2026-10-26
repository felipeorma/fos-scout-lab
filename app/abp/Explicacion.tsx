"use client";

import { useEffect, useRef, useState, type PointerEvent as EventoDePuntero } from "react";
import { t, tf } from "@/lib/i18n";
import { Interruptor } from "../Interruptor";
import { Microfono, Pincel, Trash, X } from "../Icons";

/** Un trazo del lápiz, en píxeles CSS del tablero; `fin`, cuándo se soltó. */
type Trazo = { puntos: Array<{ x: number; y: number }>; color: string; fin: number | null };

/** Los colores del lápiz: que se lean sobre cualquier césped. */
const COLORES = ["#ffd23f", "#ff4d4d", "#ffffff", "#36e0ff"];
/** Con «se borra solo», cuánto se queda un trazo después de soltarlo y cuánto tarda en irse. */
const QUEDA = 2200, SE_VA = 700;

/**
 * Explicar una jugada como en la tele: se graba lo que se ve en el tablero
 * —la reproducción, el cambio de fase, la cámara— con la voz del micrófono
 * y el lápiz encima. Mientras se graba se sigue usando todo: espacio
 * reproduce, 1–9 cambian de fase, el lápiz pinta. Al parar, se descarga.
 */
export function Explicacion({ componer, lienzoBase, archivo, onAviso, onSalir }: {
  /** Pinta en `destino` el tablero tal como sale en los vídeos (con su rótulo). */
  componer: (destino: HTMLCanvasElement) => void;
  /** El lienzo del motor, para saber la resolución del vídeo. */
  lienzoBase: () => HTMLCanvasElement | null;
  /** El nombre del archivo, sin extensión. */
  archivo: string;
  onAviso: (texto: string) => void;
  onSalir: () => void;
}) {
  const capaRef = useRef<HTMLCanvasElement>(null);
  const trazos = useRef<Trazo[]>([]);
  const dibujando = useRef<Trazo | null>(null);
  const grabacion = useRef<{ grabadora: MediaRecorder; pistas: MediaStreamTrack[]; lienzo: HTMLCanvasElement; trozos: Blob[]; mime: string; inicio: number } | null>(null);
  const [lapiz, setLapiz] = useState(true);
  const [color, setColor] = useState(COLORES[0]);
  const [seBorra, setSeBorra] = useState(true);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  // Lo que lee el bucle de dibujo sin volver a crearse en cada cambio.
  const seBorraRef = useRef(seBorra);
  useEffect(() => { seBorraRef.current = seBorra; }, [seBorra]);
  const componerRef = useRef(componer);
  useEffect(() => { componerRef.current = componer; }, [componer]);

  // El bucle: la capa del lápiz y, grabando, cada cuadro del vídeo.
  useEffect(() => {
    let cuadro = 0;
    const pintar = () => {
      cuadro = requestAnimationFrame(pintar);
      const capa = capaRef.current;
      if (!capa) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = capa.clientWidth, h = capa.clientHeight;
      if (capa.width !== Math.round(w * dpr) || capa.height !== Math.round(h * dpr)) { capa.width = Math.round(w * dpr); capa.height = Math.round(h * dpr); }
      const ctx = capa.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const ahora = performance.now();
      if (seBorraRef.current) trazos.current = trazos.current.filter((x) => x.fin === null || ahora - x.fin < QUEDA + SE_VA);
      for (const x of trazos.current) {
        const alfa = !seBorraRef.current || x.fin === null ? 1 : Math.max(0, Math.min(1, 1 - (ahora - x.fin - QUEDA) / SE_VA));
        trazar(ctx, x, alfa, Math.max(3, Math.min(6, w / 260)));
      }
      const g = grabacion.current;
      if (g) {
        componerRef.current(g.lienzo);
        g.lienzo.getContext("2d")!.drawImage(capa, 0, 0, g.lienzo.width, g.lienzo.height);
      }
    };
    pintar();
    return () => cancelAnimationFrame(cuadro);
  }, []);

  // El reloj de la grabación.
  useEffect(() => {
    if (!grabando) return;
    const id = window.setInterval(() => { if (grabacion.current) setSegundos(Math.floor((performance.now() - grabacion.current.inicio) / 1000)); }, 250);
    return () => window.clearInterval(id);
  }, [grabando]);

  // Al salir a mitad, la grabación se para y se descarga: no se pierde lo grabado.
  useEffect(() => () => { void parar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function empezar() {
    const base = lienzoBase();
    if (!base || grabacion.current) return;
    const tipos = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mime = typeof MediaRecorder === "undefined" ? undefined : tipos.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { onAviso(t("Este navegador no puede grabar vídeo. Prueba con Chrome o Safari actualizados.")); return; }
    let voz: MediaStream | null = null;
    try {
      voz = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      onAviso(t("Sin micrófono (no hay o no se dio permiso): se graba sin voz."));
    }
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.min(1920, base.width) & ~1;
    lienzo.height = Math.round((lienzo.width * base.height) / base.width) & ~1;
    componerRef.current(lienzo);
    const imagen = lienzo.captureStream(30);
    const pistas = [...imagen.getVideoTracks(), ...(voz?.getAudioTracks() ?? [])];
    const grabadora = new MediaRecorder(new MediaStream(pistas), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const trozos: Blob[] = [];
    grabadora.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
    grabadora.start(250);
    grabacion.current = { grabadora, pistas, lienzo, trozos, mime, inicio: performance.now() };
    setSegundos(0);
    setGrabando(true);
    if (voz) onAviso(t("Grabando con tu voz. Reproduce, cambia de fase y pinta: todo sale en el vídeo."));
  }

  async function parar() {
    const g = grabacion.current;
    if (!g) return;
    grabacion.current = null;
    setGrabando(false);
    const terminado = new Promise<void>((resolver) => { g.grabadora.onstop = () => resolver(); });
    if (g.grabadora.state !== "inactive") g.grabadora.stop();
    await terminado;
    g.pistas.forEach((p) => p.stop());
    const extension = g.mime.includes("mp4") ? "mp4" : "webm";
    const href = URL.createObjectURL(new Blob(g.trozos, { type: g.mime.split(";")[0] }));
    const a = Object.assign(document.createElement("a"), { href, download: `${archivo}-explicacion.${extension}` });
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(href), 4000);
    onAviso(extension === "mp4" ? t("Explicación descargada.") : t("Explicación descargada en WebM: este navegador no graba MP4."));
  }

  const punto = (e: EventoDePuntero<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const reloj = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return <>
    <canvas ref={capaRef} className={`abp-telestrador${lapiz ? " pintando" : ""}`} aria-hidden="true"
      onPointerDown={(e) => {
        if (!lapiz || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const nuevo: Trazo = { puntos: [punto(e)], color, fin: null };
        dibujando.current = nuevo;
        trazos.current.push(nuevo);
      }}
      onPointerMove={(e) => {
        const x = dibujando.current;
        if (!x) return;
        const p = punto(e), u = x.puntos[x.puntos.length - 1];
        if (Math.hypot(p.x - u.x, p.y - u.y) > 1.5) x.puntos.push(p);
      }}
      onPointerUp={() => { if (dibujando.current) dibujando.current.fin = performance.now(); dibujando.current = null; }}
      onPointerCancel={() => { if (dibujando.current) dibujando.current.fin = performance.now(); dibujando.current = null; }} />
    <div className="abp-flotante abp-explicar" role="toolbar" aria-label={t("Explicar la jugada")}>
      {grabando
        ? <button type="button" className="abp-boton-flotante abp-grabando" onClick={() => void parar()}><i aria-hidden="true" />{tf("Parar · {t}", { t: reloj })}</button>
        : <button type="button" className="abp-boton-flotante abp-grabar" onClick={() => void empezar()} title={t("Graba el tablero con tu voz y el lápiz")}><Microfono size={14} />{t("Grabar")}</button>}
      <i className="abp-separador" aria-hidden="true" />
      <button type="button" className={`abp-boton-flotante${lapiz ? " activa" : ""}`} aria-pressed={lapiz} onClick={() => setLapiz((x) => !x)}
        title={lapiz ? t("Lápiz: pinta encima. Apágalo para mover fichas o la cámara.") : t("Lápiz apagado: el tablero se usa como siempre.")}><Pincel size={14} />{t("Lápiz")}</button>
      <span className="abp-explicar-colores" role="radiogroup" aria-label={t("Color del lápiz")}>
        {COLORES.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={color === c ? "activa" : ""}
          style={{ background: c }} onClick={() => { setColor(c); setLapiz(true); }} />)}
      </span>
      <label className="abp-explicar-borra" title={t("Cada trazo se va solo a los dos segundos, como en la tele")}>
        <span>{t("Se borra solo")}</span><Interruptor activo={seBorra} onCambio={setSeBorra} titulo={t("Se borra solo")} />
      </label>
      <button type="button" className="abp-boton-flotante" onClick={() => { trazos.current = []; }} title={t("Borrar lo pintado")} aria-label={t("Borrar lo pintado")}><Trash size={13} /></button>
      <i className="abp-separador" aria-hidden="true" />
      <button type="button" className="abp-boton-flotante" onClick={onSalir} aria-label={t("Terminar de explicar")} title={t("Terminar de explicar")}><X size={14} /></button>
    </div>
  </>;
}

/** Un trazo de rotulador: suavizado, con un halo oscuro para leerse en cualquier césped. */
function trazar(ctx: CanvasRenderingContext2D, x: Trazo, alfa: number, grosor: number) {
  if (alfa <= 0 || !x.puntos.length) return;
  ctx.save();
  ctx.globalAlpha = alfa;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const camino = () => {
    ctx.beginPath();
    const [p0, ...resto] = x.puntos;
    ctx.moveTo(p0.x, p0.y);
    if (!resto.length) { ctx.lineTo(p0.x + 0.1, p0.y); return; }
    for (let i = 0; i < resto.length - 1; i += 1) {
      const medio = { x: (resto[i].x + resto[i + 1].x) / 2, y: (resto[i].y + resto[i + 1].y) / 2 };
      ctx.quadraticCurveTo(resto[i].x, resto[i].y, medio.x, medio.y);
    }
    const u = resto[resto.length - 1];
    ctx.lineTo(u.x, u.y);
  };
  camino();
  ctx.strokeStyle = "rgba(0,0,0,.45)";
  ctx.lineWidth = grosor + 4;
  ctx.stroke();
  camino();
  ctx.strokeStyle = x.color;
  ctx.lineWidth = grosor;
  ctx.shadowColor = x.color;
  ctx.shadowBlur = grosor * 1.6;
  ctx.stroke();
  ctx.restore();
}
