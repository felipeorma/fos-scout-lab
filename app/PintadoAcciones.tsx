"use client";

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as EventoDePuntero, type ReactNode } from "react";
import {
  DE_DOS_PUNTOS, desplazar, duplicar, escalar, idDeTrazo, idDeYoutube, inicioDeYoutube, trazoEn, type EstiloFoco, type PuntoP, type TipoTrazo, type Trazo,
} from "@/lib/pintado";
import { t, tf } from "@/lib/i18n";
import { dibujarSeleccion, dibujarTodo, dibujarTrazo } from "./pintado/dibujo";
import { useFirma } from "./FirmaDelInforme";
import { Interruptor } from "./Interruptor";
import {
  ArrowDownToLine, Camara, Conector, Duplicar, Elipse, Etiqueta, Flecha, FlechaRecta, Foco, ImageIcon, Mover, Pause, Pencil, Play, Rectangulo, RotateCcw,
  TextIcon, Trash, Triangulo, Upload, Video, X, ZonaSuelo,
} from "./Icons";

type Herramienta = "mover" | TipoTrazo;
type Fuente =
  | { tipo: "ninguna" }
  | { tipo: "imagen"; url: string }
  | { tipo: "video"; url: string; nombre: string }
  | { tipo: "youtube"; id: string; inicio: number };

const DORSALES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

function descargar(href: string, nombre: string) {
  Object.assign(document.createElement("a"), { href, download: nombre }).click();
}

function cargarImagen(src: string) {
  return new Promise<HTMLImageElement>((resolver, fallar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = fallar;
    img.src = src;
  });
}

/** Dónde cae un medio de `ancho` × `alto` encajado sin recortar en un hueco de `w` × `h`, como object-fit: contain. */
function encaje(ancho: number, alto: number, w: number, h: number) {
  const k = Math.min(w / ancho, h / alto);
  return { x: (w - ancho * k) / 2, y: (h - alto * k) / 2, w: ancho * k, h: alto * k };
}

function minutos(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function PintadoAcciones({ claseHoja, onVolver }: { claseHoja: string; onVolver?: () => void }) {
  const firma = useFirma();
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const historial = useRef<Trazo[][]>([]);
  const [herramienta, setHerramienta] = useState<Herramienta>("flecha");
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Trazo | null>(null);
  const [color, setColor] = useState("#ff3b30");
  const [relleno, setRelleno] = useState("");
  const [grosor, setGrosor] = useState(4);
  const [opacidad, setOpacidad] = useState(1);
  const [foco, setFoco] = useState<EstiloFoco>("abierto");
  const [dorsal, setDorsal] = useState("1");
  const [fuente, setFuente] = useState<Fuente>({ tipo: "ninguna" });
  const [congelado, setCongelado] = useState<string | null>(null);
  const [dibujando, setDibujando] = useState(true);
  const [enlace, setEnlace] = useState("");
  const [aviso, setAviso] = useState("");
  const [letra, setLetra] = useState("Geist, \"Helvetica Neue\", Arial, sans-serif");
  const [acento, setAcento] = useState("#ff3b30");
  const [video, setVideo] = useState({ actual: 0, total: 0, pausado: true });
  const raizRef = useRef<HTMLElement>(null);
  const escenarioRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const imagenRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const marcoRef = useRef<HTMLIFrameElement>(null);
  const textoRef = useRef<HTMLInputElement>(null);
  const arrastreRef = useRef<{ id: string; desde: PuntoP; base: Trazo[]; movido: boolean } | null>(null);
  const [tamano, setTamano] = useState({ w: 0, h: 0 });

  const elegido = trazos.find((x) => x.id === seleccion) ?? null;
  // Sobre un vídeo que corre, el lienzo deja pasar el puntero a los controles hasta que se pide dibujar.
  const conMedio = fuente.tipo === "video" || fuente.tipo === "youtube";
  const lienzoActivo = !conMedio || dibujando || Boolean(congelado);

  // El color y la letra del espacio: el primer color de trazo es el del espacio.
  useEffect(() => {
    if (!raizRef.current) return;
    const estilo = getComputedStyle(raizRef.current);
    const c = estilo.getPropertyValue("--acento").trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) { setAcento(c); setColor(c); }
    if (estilo.fontFamily) setLetra(estilo.fontFamily);
  }, []);

  useEffect(() => {
    const el = escenarioRef.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setTamano({ w: el.clientWidth, h: el.clientHeight }));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // Pintar: cada cambio vuelve a dibujar el lienzo entero, que son pocos trazos.
  useEffect(() => {
    const lienzo = lienzoRef.current;
    if (!lienzo || !tamano.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lienzo.width = Math.round(tamano.w * dpr);
    lienzo.height = Math.round(tamano.h * dpr);
    const ctx = lienzo.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tamano.w, tamano.h);
    dibujarTodo(ctx, trazos, tamano.w, tamano.h, letra);
    if (borrador) dibujarTrazo(ctx, borrador, tamano.w, tamano.h, letra);
    if (elegido && !borrador) dibujarSeleccion(ctx, elegido, tamano.w, tamano.h, acento, letra);
  }, [trazos, borrador, elegido, tamano, letra, acento]);

  // ---- Cambios con deshacer ----
  function guardar(siguiente: Trazo[]) {
    historial.current.push(trazos);
    if (historial.current.length > 100) historial.current.shift();
    setTrazos(siguiente);
  }
  function marcarHistorial() {
    historial.current.push(trazos);
  }
  function deshacer() {
    const previo = historial.current.pop();
    if (previo) { setTrazos(previo); setSeleccion(null); }
  }
  function borrar() {
    if (seleccion) { guardar(trazos.filter((x) => x.id !== seleccion)); setSeleccion(null); }
  }
  function limpiar() {
    if (!trazos.length) return;
    guardar([]);
    setSeleccion(null);
  }
  /** Cambiar el estilo cambia también lo seleccionado, como en cualquier editor. */
  function aplicarAElegido(cambio: Partial<Trazo>, conHistorial = false) {
    if (!elegido) return;
    const siguiente = trazos.map((x) => (x.id === elegido.id ? { ...x, ...cambio } : x));
    if (conHistorial) guardar(siguiente); else setTrazos(siguiente);
  }

  // Teclado y pegar una imagen. Solo con esta hoja a la vista.
  useEffect(() => {
    const visible = () => Boolean(raizRef.current?.offsetParent);
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (!visible()) return;
      if ((evento.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
      if ((evento.key === "Delete" || evento.key === "Backspace") && seleccion) { evento.preventDefault(); borrar(); }
      else if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "z") { evento.preventDefault(); deshacer(); }
      else if (evento.key === "Enter" && borrador?.tipo === "conector") terminarConector();
      else if (evento.key === "Escape") { setBorrador(null); setSeleccion(null); }
    };
    const alPegar = (evento: ClipboardEvent) => {
      if (!visible()) return;
      const archivo = [...(evento.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (archivo) { evento.preventDefault(); abrirArchivo(archivo); }
    };
    window.addEventListener("keydown", alPulsarTecla);
    window.addEventListener("paste", alPegar);
    return () => { window.removeEventListener("keydown", alPulsarTecla); window.removeEventListener("paste", alPegar); };
  });

  // ---- La fuente: imagen, vídeo o YouTube ----
  function abrirArchivo(archivo: File) {
    const url = URL.createObjectURL(archivo);
    if (fuente.tipo === "imagen" || fuente.tipo === "video") URL.revokeObjectURL(fuente.url);
    setCongelado(null);
    setAviso("");
    if (archivo.type.startsWith("video/")) { setFuente({ tipo: "video", url, nombre: archivo.name }); setDibujando(false); }
    else if (archivo.type.startsWith("image/")) setFuente({ tipo: "imagen", url });
    else setAviso(t("Ese archivo no es una imagen ni un vídeo."));
  }
  function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (archivo) abrirArchivo(archivo);
    evento.target.value = "";
  }
  function cargarYoutube() {
    const id = idDeYoutube(enlace);
    if (!id) { setAviso(t("No reconozco ese enlace de YouTube.")); return; }
    setCongelado(null);
    setAviso("");
    setFuente({ tipo: "youtube", id, inicio: inicioDeYoutube(enlace) });
    setDibujando(false);
  }
  function quitarFuente() {
    if (fuente.tipo === "imagen" || fuente.tipo === "video") URL.revokeObjectURL(fuente.url);
    setFuente({ tipo: "ninguna" });
    setCongelado(null);
  }

  /** Detiene el vídeo en el fotograma que se ve y lo deja de fondo para dibujar y exportar. */
  async function congelar() {
    if (fuente.tipo === "video" && videoRef.current) {
      const v = videoRef.current;
      v.pause();
      const lienzo = document.createElement("canvas");
      lienzo.width = v.videoWidth;
      lienzo.height = v.videoHeight;
      lienzo.getContext("2d")!.drawImage(v, 0, 0);
      setCongelado(lienzo.toDataURL("image/png"));
      setDibujando(true);
      return;
    }
    if (fuente.tipo !== "youtube" || !marcoRef.current) return;
    // YouTube no deja leer su imagen: se captura la pestaña y se recorta el reproductor.
    if (!navigator.mediaDevices?.getDisplayMedia) { setAviso(t("Este navegador no puede capturar la pestaña. Usa Chrome actualizado o sube el vídeo.")); return; }
    setAviso(t("Elige «Esta pestaña» y pulsa Compartir."));
    const lienzoPropio = lienzoRef.current;
    if (lienzoPropio) lienzoPropio.style.visibility = "hidden";
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" } as DisplayMediaStreamOptions);
    } catch {
      if (lienzoPropio) lienzoPropio.style.visibility = "";
      setAviso(t("Captura cancelada."));
      return;
    }
    const v = document.createElement("video");
    v.muted = true;
    v.srcObject = flujo;
    await new Promise((resolver) => { v.onloadedmetadata = resolver; });
    await v.play();
    await new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));
    const kx = v.videoWidth / window.innerWidth, ky = v.videoHeight / window.innerHeight;
    const r = marcoRef.current.getBoundingClientRect();
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(r.width * kx);
    lienzo.height = Math.round(r.height * ky);
    lienzo.getContext("2d")!.drawImage(v, Math.round(r.left * kx), Math.round(r.top * ky), lienzo.width, lienzo.height, 0, 0, lienzo.width, lienzo.height);
    flujo.getTracks().forEach((pista) => pista.stop());
    if (lienzoPropio) lienzoPropio.style.visibility = "";
    setCongelado(lienzo.toDataURL("image/png"));
    setDibujando(true);
    setAviso("");
  }

  async function exportar() {
    const W = 1920, H = 1080;
    const lienzo = document.createElement("canvas");
    lienzo.width = W;
    lienzo.height = H;
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, W, H);
    try {
      if (congelado || fuente.tipo === "imagen") {
        const img = congelado ? await cargarImagen(congelado) : imagenRef.current!;
        const r = encaje(img.naturalWidth, img.naturalHeight, W, H);
        ctx.drawImage(img, r.x, r.y, r.w, r.h);
      } else if (fuente.tipo === "video" && videoRef.current) {
        const v = videoRef.current;
        const r = encaje(v.videoWidth, v.videoHeight, W, H);
        ctx.drawImage(v, r.x, r.y, r.w, r.h);
      } else if (fuente.tipo === "youtube") {
        setAviso(t("Congela primero un fotograma: YouTube no deja copiar la imagen del vídeo."));
        return;
      }
    } catch {
      setAviso(t("No se pudo leer el fondo. Prueba a congelar el fotograma."));
      return;
    }
    dibujarTodo(ctx, trazos, W, H, letra);
    ctx.font = `600 18px ${letra}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(245,245,247,.55)";
    ctx.fillText(firma.nombre ? `${firma.nombre} · FOS Scout Lab` : "FOS Scout Lab", W - 28, H - 24);
    descargar(lienzo.toDataURL("image/png"), `accion-${new Date().toISOString().slice(0, 10)}.png`);
  }

  // ---- Dibujar ----
  function punto(evento: { clientX: number; clientY: number }): PuntoP {
    const r = lienzoRef.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (evento.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (evento.clientY - r.top) / r.height)) };
  }
  const nuevo = (tipo: TipoTrazo, puntos: PuntoP[], extra: Partial<Trazo> = {}): Trazo =>
    ({ id: idDeTrazo(), tipo, puntos, color, relleno, grosor, opacidad, ...(tipo === "foco" ? { foco } : {}), ...extra });

  function terminarConector() {
    if (borrador?.tipo !== "conector") return;
    // El último punto es el que sigue al ratón: no cuenta.
    const puntos = borrador.puntos.slice(0, -1);
    setBorrador(null);
    if (puntos.length >= 2) { const trazo = { ...borrador, puntos }; guardar([...trazos, trazo]); setSeleccion(trazo.id); }
  }

  function alPulsar(evento: EventoDePuntero<HTMLCanvasElement>) {
    if (evento.button !== 0) return;
    const p = punto(evento);
    const lienzo = evento.currentTarget;
    if (herramienta === "mover") {
      const id = trazoEn(trazos, p, tamano.w / Math.max(tamano.h, 1));
      setSeleccion(id);
      if (id) { lienzo.setPointerCapture(evento.pointerId); arrastreRef.current = { id, desde: p, base: trazos, movido: false }; }
      return;
    }
    if (herramienta === "conector") {
      if (!borrador || borrador.tipo !== "conector") setBorrador(nuevo("conector", [p, p]));
      else setBorrador({ ...borrador, puntos: [...borrador.puntos.slice(0, -1), p, p] });
      return;
    }
    if (herramienta === "texto" || herramienta === "etiqueta" || herramienta === "dorsal") {
      const texto = herramienta === "dorsal" ? dorsal : herramienta === "texto" ? t("Texto") : t("Etiqueta");
      const trazo = nuevo(herramienta, [p], { texto, grosor: Math.max(grosor, 3) });
      guardar([...trazos, trazo]);
      setSeleccion(trazo.id);
      if (herramienta === "dorsal") setDorsal((d) => String((Number(d) % 11) + 1));
      else window.setTimeout(() => textoRef.current?.select(), 30);
      return;
    }
    lienzo.setPointerCapture(evento.pointerId);
    setSeleccion(null);
    setBorrador(nuevo(herramienta, herramienta === "lapiz" ? [p] : [p, p]));
  }

  function alMover(evento: EventoDePuntero<HTMLCanvasElement>) {
    const p = punto(evento);
    const arrastre = arrastreRef.current;
    if (arrastre) {
      const dx = p.x - arrastre.desde.x, dy = p.y - arrastre.desde.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.002) arrastre.movido = true;
      if (arrastre.movido) setTrazos(arrastre.base.map((x) => (x.id === arrastre.id ? desplazar(x, dx, dy) : x)));
      return;
    }
    if (!borrador) return;
    if (borrador.tipo === "conector") { setBorrador({ ...borrador, puntos: [...borrador.puntos.slice(0, -1), p] }); return; }
    if (!evento.currentTarget.hasPointerCapture(evento.pointerId)) return;
    if (borrador.tipo === "lapiz") {
      const ultimo = borrador.puntos[borrador.puntos.length - 1];
      if (Math.hypot(p.x - ultimo.x, p.y - ultimo.y) > 0.003) setBorrador({ ...borrador, puntos: [...borrador.puntos, p] });
    } else setBorrador({ ...borrador, puntos: [borrador.puntos[0], p] });
  }

  function alSoltar(evento: EventoDePuntero<HTMLCanvasElement>) {
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) evento.currentTarget.releasePointerCapture(evento.pointerId);
    const arrastre = arrastreRef.current;
    arrastreRef.current = null;
    if (arrastre) {
      if (arrastre.movido) { historial.current.push(arrastre.base); }
      return;
    }
    if (!borrador || borrador.tipo === "conector") return;
    const [a, b] = borrador.puntos;
    const corto = DE_DOS_PUNTOS.includes(borrador.tipo) ? !b || Math.hypot(b.x - a.x, b.y - a.y) < 0.012 : borrador.puntos.length < 2;
    setBorrador(null);
    if (corto) return;
    guardar([...trazos, borrador]);
    setSeleccion(borrador.id);
  }

  // ---- Lo que se ve ----
  const herramientas: Array<{ id: Herramienta; nombre: string; icono: ReactNode }> = [
    { id: "mover", nombre: t("Mover"), icono: <Mover size={16} /> },
    { id: "flecha", nombre: t("Curva"), icono: <Flecha size={16} /> },
    { id: "flechaRecta", nombre: t("Recta"), icono: <FlechaRecta size={16} /> },
    { id: "lapiz", nombre: t("Lápiz"), icono: <Pencil size={16} /> },
    { id: "texto", nombre: t("Texto"), icono: <TextIcon size={16} /> },
    { id: "etiqueta", nombre: t("Etiqueta"), icono: <Etiqueta size={16} /> },
    { id: "rect", nombre: t("Rectángulo"), icono: <Rectangulo size={16} /> },
    { id: "elipse", nombre: t("Círculo"), icono: <Elipse size={16} /> },
    { id: "zona", nombre: t("Zona"), icono: <ZonaSuelo size={16} /> },
    { id: "triangulo", nombre: t("Triángulo"), icono: <Triangulo size={16} /> },
    { id: "foco", nombre: t("Foco"), icono: <Foco size={16} /> },
    { id: "conector", nombre: t("Conector"), icono: <Conector size={16} /> },
  ];
  const ayudas: Partial<Record<Herramienta, string>> = {
    mover: t("Pulsa un trazo para elegirlo y arrástralo para moverlo."),
    lapiz: t("Dibuja a mano alzada."),
    texto: t("Pulsa donde quieras escribir."),
    etiqueta: t("Pulsa donde quieras poner la etiqueta."),
    conector: t("Pulsa en cada jugador para unirlos. Doble clic o Intro para terminar."),
    dorsal: t("Pulsa sobre el jugador para ponerle el dorsal. El número avanza solo."),
    foco: t("Arrastra desde arriba hasta los pies del jugador."),
  };
  const ayuda = ayudas[herramienta] ?? t("Arrastra sobre la imagen para dibujar.");
  const estiloFoco = elegido?.tipo === "foco" ? elegido.foco ?? "abierto" : foco;

  return <div className={claseHoja}>
    <section className="estilo-page abp-page pintado-page" ref={raizRef}>
      <header className="abp-cabecera">
        <div>
          <span>{t("ANÁLISIS DE VÍDEO · TELESTRADOR")}</span>
          <h2>{t("Pintado de acciones")}</h2>
          <p>{t("Dibuja sobre una imagen, un vídeo propio o un vídeo de YouTube: flechas, focos, zonas y dorsales. Exporta el fotograma en PNG.")}</p>
        </div>
        {onVolver && <button type="button" className="button secondary compact" onClick={onVolver}>{t("Volver al inicio")}</button>}
      </header>

      <div className="abp-grid">
        <aside className="designer-controls inspector abp-inspector">
          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Fondo")}</h3>
            <div className="inspector-tarjeta">
              <label className="inspector-fila inspector-accion pintado-subir">
                <span className="inspector-icono"><ImageIcon size={15} /></span>
                <span className="inspector-accion-texto"><b>{t("Subir imagen o vídeo")}</b><small>{t("También puedes pegar una captura (Ctrl+V)")}</small></span>
                <Upload size={15} className="inspector-galon" />
                <input type="file" accept="image/*,video/*" onChange={alElegirArchivo} hidden />
              </label>
              <form className="inspector-fila pintado-youtube" onSubmit={(e) => { e.preventDefault(); cargarYoutube(); }}>
                <input className="abp-campo" value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder={t("Enlace de YouTube")} aria-label={t("Enlace de YouTube")} />
                <button type="submit" disabled={!enlace.trim()}>{t("Cargar")}</button>
              </form>
              {fuente.tipo !== "ninguna" && <div className="inspector-fila abp-acciones">
                {conMedio && <button type="button" onClick={() => void congelar()}><Camara size={14} />{t("Congelar fotograma")}</button>}
                {congelado && <button type="button" onClick={() => { setCongelado(null); setDibujando(false); }}><Video size={14} />{t("Volver al vídeo")}</button>}
                <button type="button" onClick={quitarFuente}><X size={14} />{t("Quitar fondo")}</button>
              </div>}
            </div>
          </section>

          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Herramientas")}</h3>
            <div className="abp-herramientas" role="toolbar" aria-label={t("Herramientas")}>
              {herramientas.map((h) => <button key={h.id} type="button" className={herramienta === h.id ? "activa" : ""} aria-pressed={herramienta === h.id}
                onClick={() => { setHerramienta(h.id); setBorrador(null); if (conMedio && h.id !== "mover") setDibujando(true); }}>
                {h.icono}<span>{h.nombre}</span>
              </button>)}
            </div>
            <div className="pintado-dorsales" role="group" aria-label={t("Dorsales")}>
              {DORSALES.map((n) => <button key={n} type="button" className={herramienta === "dorsal" && dorsal === n ? "activa" : ""}
                onClick={() => { setHerramienta("dorsal"); setDorsal(n); if (conMedio) setDibujando(true); }}>{n}</button>)}
            </div>
            <p className="inspector-pie">{ayuda}</p>
          </section>

          <section className="inspector-grupo">
            <h3 className="inspector-titulo">{t("Estilo")}{elegido && <small>{t("del trazo elegido")}</small>}</h3>
            <div className="inspector-tarjeta">
              <label className="inspector-fila"><span>{t("Color")}</span>
                <input type="color" value={elegido?.color ?? color} onFocus={marcarHistorial} onChange={(e) => { setColor(e.target.value); aplicarAElegido({ color: e.target.value }); }} />
              </label>
              <div className="inspector-fila"><span>{t("Relleno")}</span>
                {(elegido ? elegido.relleno : relleno) && <input type="color" value={(elegido ? elegido.relleno : relleno) || color} onFocus={marcarHistorial}
                  onChange={(e) => { setRelleno(e.target.value); aplicarAElegido({ relleno: e.target.value }); }} />}
                <Interruptor activo={Boolean(elegido ? elegido.relleno : relleno)} titulo={t("Relleno")}
                  onCambio={(si) => { const valor = si ? (elegido?.color ?? color) : ""; setRelleno(valor); aplicarAElegido({ relleno: valor }, true); }} />
              </div>
              <label className="inspector-fila inspector-deslizador"><span>{t("Grosor")}</span><b>{(elegido?.grosor ?? grosor).toFixed(0)}</b>
                <input type="range" min={1} max={14} step={1} value={elegido?.grosor ?? grosor} onPointerDown={marcarHistorial}
                  onChange={(e) => { setGrosor(Number(e.target.value)); aplicarAElegido({ grosor: Number(e.target.value) }); }} />
              </label>
              <label className="inspector-fila inspector-deslizador"><span>{t("Transparencia")}</span><b>{Math.round((elegido?.opacidad ?? opacidad) * 100)}%</b>
                <input type="range" min={0.1} max={1} step={0.05} value={elegido?.opacidad ?? opacidad} onPointerDown={marcarHistorial}
                  onChange={(e) => { setOpacidad(Number(e.target.value)); aplicarAElegido({ opacidad: Number(e.target.value) }); }} />
              </label>
              {(herramienta === "foco" || elegido?.tipo === "foco") && <div className="inspector-fila"><span>{t("Foco")}</span>
                <div className="inspector-segmentos">
                  {([["abierto", t("Abierto")], ["estrecho", t("Estrecho")], ["cilindrico", t("Cilindro")]] as Array<[EstiloFoco, string]>).map(([id, nombre]) =>
                    <button key={id} type="button" className={estiloFoco === id ? "activa" : ""} onClick={() => { setFoco(id); aplicarAElegido({ foco: id }, true); }}>{nombre}</button>)}
                </div>
              </div>}
              {elegido && (elegido.tipo === "texto" || elegido.tipo === "etiqueta" || elegido.tipo === "dorsal") && <label className="inspector-fila"><span>{t("Texto")}</span>
                <input ref={textoRef} className="abp-campo" value={elegido.texto ?? ""} maxLength={elegido.tipo === "dorsal" ? 3 : 60} onFocus={marcarHistorial}
                  onChange={(e) => aplicarAElegido({ texto: e.target.value })} />
              </label>}
            </div>
          </section>

          <section className="inspector-grupo">
            <div className="inspector-tarjeta">
              <div className="inspector-fila abp-acciones">
                {elegido && <>
                  <button type="button" onClick={() => guardar(trazos.map((x) => (x.id === elegido.id ? escalar(x, 0.85) : x)))} aria-label={t("Más pequeño")}>−</button>
                  <button type="button" onClick={() => guardar(trazos.map((x) => (x.id === elegido.id ? escalar(x, 1.15) : x)))} aria-label={t("Más grande")}>+</button>
                  <button type="button" onClick={() => { const copia = duplicar(elegido); guardar([...trazos, copia]); setSeleccion(copia.id); }}><Duplicar size={14} />{t("Duplicar")}</button>
                  <button type="button" className="peligro" onClick={borrar}><Trash size={14} />{t("Borrar")}</button>
                </>}
                <button type="button" onClick={deshacer}><RotateCcw size={14} />{t("Deshacer")}</button>
                <button type="button" onClick={limpiar} disabled={!trazos.length}>{t("Limpiar")}</button>
              </div>
            </div>
          </section>
        </aside>

        <div className="abp-principal">
          <div className={`abp-escenario pintado-escenario${lienzoActivo ? " dibujando" : ""}`} ref={escenarioRef}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const archivo = e.dataTransfer.files[0]; if (archivo) abrirArchivo(archivo); }}>
            {/* Imágenes locales (blob:) o capturas: next/image no aporta nada aquí. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {fuente.tipo === "imagen" && <img ref={imagenRef} className="pintado-fondo" src={fuente.url} alt="" />}
            {fuente.tipo === "video" && <video ref={videoRef} className="pintado-fondo" src={fuente.url} playsInline controls={!lienzoActivo}
              onTimeUpdate={(e) => setVideo((v) => ({ ...v, actual: e.currentTarget.currentTime }))}
              onLoadedMetadata={(e) => setVideo({ actual: 0, total: e.currentTarget.duration, pausado: true })}
              onPlay={() => setVideo((v) => ({ ...v, pausado: false }))} onPause={() => setVideo((v) => ({ ...v, pausado: true }))} />}
            {fuente.tipo === "youtube" && <iframe ref={marcoRef} className="pintado-fondo" title={t("Vídeo de YouTube")}
              src={`https://www.youtube-nocookie.com/embed/${fuente.id}?start=${fuente.inicio}&rel=0&playsinline=1&modestbranding=1`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {congelado && <img className="pintado-fondo pintado-congelado" src={congelado} alt="" />}
            {fuente.tipo === "ninguna" && <p className="abp-cargando pintado-vacio">{t("Sube una imagen o un vídeo, pega una captura o carga un enlace de YouTube. También puedes dibujar sobre el fondo vacío.")}</p>}
            <canvas ref={lienzoRef} className="pintado-lienzo" onPointerDown={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}
              onDoubleClick={terminarConector} />
            {aviso && <p className="abp-flotante abp-aviso" role="status">{aviso}</p>}
          </div>

          <div className="abp-linea-de-tiempo">
            <div className="abp-reproductor">
              {conMedio && !congelado && <div className="pintado-modo">
                <span>{t("Dibujar")}</span>
                <Interruptor activo={dibujando} onCambio={setDibujando} titulo={t("Dibujar sobre el vídeo")} />
              </div>}
              {fuente.tipo === "video" && !congelado && <>
                <button type="button" className="button secondary compact" onClick={() => { const v = videoRef.current; if (v) void (v.paused ? v.play() : v.pause()); }}>
                  {video.pausado ? <><Play size={13} />{t("Reproducir")}</> : <><Pause size={13} />{t("Pausa")}</>}
                </button>
                <input className="abp-progreso" type="range" min={0} max={video.total || 0} step={0.04} value={video.actual} aria-label={t("Momento del vídeo")}
                  onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = Number(e.target.value); }} />
                <span className="pintado-tiempo">{minutos(video.actual)} / {minutos(video.total)}</span>
              </>}
              {fuente.tipo === "youtube" && !congelado && <span className="pintado-nota">{t("Apaga «Dibujar» para usar los controles del vídeo; congela el fotograma para exportarlo.")}</span>}
              {congelado && <span className="pintado-nota">{t("Fotograma congelado.")}</span>}
              <span className="abp-descargas">
                <button type="button" className="button primary compact" onClick={() => void exportar()}><ArrowDownToLine size={13} />{t("Exportar PNG")}</button>
              </span>
            </div>
            <small className="pintado-cuenta">{tf(trazos.length === 1 ? "{n} trazo" : "{n} trazos", { n: trazos.length })}</small>
          </div>
        </div>
      </div>
    </section>
  </div>;
}

export default PintadoAcciones;
