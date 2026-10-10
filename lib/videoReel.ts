/**
 * Convierte el reel en un archivo de video.
 *
 * Lo normal es MP4 (H.264), que es lo que LinkedIn, Instagram y WhatsApp
 * reciben sin pegas: cada cuadro se dibuja y se codifica con WebCodecs, uno
 * detrás de otro, y se empaqueta con mp4-muxer. Al no grabar en tiempo real,
 * el video sale a 30 fps exactos aunque dibujar treinta canchas tarde más que
 * un treintavo de segundo.
 *
 * Si el navegador no codifica H.264 (algunos Chromium de Linux), se usa VP9
 * dentro del mismo MP4. Si no tiene WebCodecs (Firefox), se graba el lienzo
 * en tiempo real con MediaRecorder, en WebM: sirve, pero puede salir con
 * tirones.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";

export type VideoGrabado = { blob: Blob; tipo: "mp4" | "webm"; codec: string };

type Opciones = {
  ancho: number;
  alto: number;
  fps: number;
  cuadros: number;
  /** Dibuja el cuadro del segundo `t` en el lienzo. */
  dibujar: (ctx: CanvasRenderingContext2D, t: number) => void;
  alProgresar?: (hecho: number) => void;
  /** Para cancelar a medias. */
  cancelado?: () => boolean;
};

/**
 * Los códecs que se prueban, en orden: H.264 de mejor a más compatible (todos
 * admiten 1080 × 1920) y, si no hay ninguno, VP9.
 */
const CODECS: Array<{ codec: string; muxer: "avc" | "vp9" }> = [
  { codec: "avc1.640028", muxer: "avc" },
  { codec: "avc1.4d0028", muxer: "avc" },
  { codec: "avc1.42e028", muxer: "avc" },
  { codec: "vp09.00.40.08", muxer: "vp9" },
];

async function codecDisponible(ancho: number, alto: number, fps: number) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  for (const candidato of CODECS) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec: candidato.codec, width: ancho, height: alto, bitrate: 8_000_000, framerate: fps });
      if (supported) return candidato;
    } catch { /* se prueba el siguiente */ }
  }
  return null;
}

export async function grabarVideo(opciones: Opciones): Promise<VideoGrabado> {
  const { ancho, alto, fps, cuadros } = opciones;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("canvas 2d");

  const elegido = await codecDisponible(ancho, alto, fps);
  if (elegido) {
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: elegido.muxer, width: ancho, height: alto, frameRate: fps }, fastStart: "in-memory" });
    let fallo: unknown = null;
    const codificador = new VideoEncoder({
      output: (trozo, meta) => muxer.addVideoChunk(trozo, meta),
      error: (error) => { fallo = error; },
    });
    codificador.configure({
      codec: elegido.codec, width: ancho, height: alto, bitrate: 8_000_000, framerate: fps,
      ...(elegido.muxer === "avc" ? { avc: { format: "avc" as const } } : {}),
    });
    const duracion = 1_000_000 / fps;
    for (let i = 0; i < cuadros; i += 1) {
      if (opciones.cancelado?.()) { codificador.close(); throw new Error("cancelado"); }
      if (fallo) throw fallo;
      opciones.dibujar(ctx, i / fps);
      const cuadro = new VideoFrame(lienzo, { timestamp: Math.round(i * duracion), duration: Math.round(duracion) });
      // Un cuadro clave cada dos segundos: se puede saltar por el video sin esperar.
      codificador.encode(cuadro, { keyFrame: i % (fps * 2) === 0 });
      cuadro.close();
      // Sin dejar que la cola crezca sin fin, y dando aire a la página.
      while (codificador.encodeQueueSize > 8) await new Promise((resolver) => setTimeout(resolver, 5));
      if (i % 10 === 0) {
        opciones.alProgresar?.(i / cuadros);
        await new Promise((resolver) => setTimeout(resolver, 0));
      }
    }
    await codificador.flush();
    codificador.close();
    if (fallo) throw fallo;
    muxer.finalize();
    opciones.alProgresar?.(1);
    return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), tipo: "mp4", codec: elegido.muxer === "avc" ? "H.264" : "VP9" };
  }

  // Respaldo: grabar en tiempo real.
  if (typeof MediaRecorder === "undefined" || !lienzo.captureStream) throw new Error("Este navegador no puede grabar video.");
  const tipo = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((candidato) => MediaRecorder.isTypeSupported(candidato)) ?? "video/webm";
  const flujo = lienzo.captureStream(fps);
  const grabadora = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: 8_000_000 });
  const trozos: Blob[] = [];
  grabadora.ondataavailable = (evento) => { if (evento.data.size) trozos.push(evento.data); };
  const terminado = new Promise<void>((resolver) => { grabadora.onstop = () => resolver(); });
  opciones.dibujar(ctx, 0);
  grabadora.start(500);
  const inicio = performance.now();
  await new Promise<void>((resolver) => {
    const cuadro = () => {
      const t = (performance.now() - inicio) / 1000;
      if (t >= cuadros / fps || opciones.cancelado?.()) { resolver(); return; }
      opciones.dibujar(ctx, t);
      opciones.alProgresar?.(t / (cuadros / fps));
      requestAnimationFrame(cuadro);
    };
    requestAnimationFrame(cuadro);
  });
  grabadora.stop();
  await terminado;
  if (opciones.cancelado?.()) throw new Error("cancelado");
  opciones.alProgresar?.(1);
  return { blob: new Blob(trozos, { type: "video/webm" }), tipo: "webm", codec: tipo };
}
