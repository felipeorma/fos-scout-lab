/**
 * El pintado de acciones: dibujar encima de una imagen o de un vídeo.
 *
 * Es el telestrador de un análisis de vídeo: flechas, focos sobre un
 * jugador, zonas, conectores entre compañeros, dorsales. Cada trazo guarda
 * sus puntos en fracciones del escenario (0–1 a lo ancho y a lo alto), no en
 * píxeles: así el dibujo sigue pegado a la jugada al cambiar el tamaño de la
 * ventana y sale igual al exportar a otra resolución. El grosor se da para un
 * escenario de 1000 px de ancho y se escala con él.
 */

export type PuntoP = { x: number; y: number };
export type TipoTrazo =
  | "flecha" | "flechaRecta" | "lapiz" | "texto" | "etiqueta" | "rect" | "elipse" | "zona" | "triangulo" | "foco" | "conector" | "dorsal";
export type EstiloFoco = "abierto" | "estrecho" | "cilindrico";
export type Trazo = {
  id: string;
  tipo: TipoTrazo;
  puntos: PuntoP[];
  color: string;
  relleno: string;
  grosor: number;
  /** 0–1. */
  opacidad: number;
  texto?: string;
  foco?: EstiloFoco;
};

/** El ancho de referencia del grosor y de los textos. */
export const ANCHO_BASE = 1000;
/** Alturas de los textos y radio del dorsal, en fracciones del alto, para un grosor 4. */
export const ALTO_TEXTO = 0.04;
export const ALTO_ETIQUETA = 0.038;
export const RADIO_DORSAL = 0.028;
/** Los que se dibujan arrastrando de un punto a otro. */
export const DE_DOS_PUNTOS: TipoTrazo[] = ["flecha", "flechaRecta", "rect", "elipse", "zona", "triangulo", "foco"];

let contador = 0;
export function idDeTrazo() {
  contador += 1;
  return `t${Date.now().toString(36)}${contador.toString(36)}`;
}

const acotar = (v: number) => Math.max(0, Math.min(1, v));

/** El rectángulo que ocupa un trazo, en fracciones del escenario. Los textos crecen con su largo. */
export function limites(t: Trazo, aspecto = 16 / 9) {
  const xs = t.puntos.map((p) => p.x), ys = t.puntos.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (t.tipo === "texto" || t.tipo === "etiqueta") {
    const alto = (t.tipo === "texto" ? ALTO_TEXTO : ALTO_ETIQUETA) * (t.grosor / 4);
    // Sin lienzo no se puede medir: el ancho medio de un carácter de la letra de la plataforma.
    const ancho = ((t.texto ?? "").length * (t.tipo === "etiqueta" ? 0.36 : 0.56) * alto + (t.tipo === "etiqueta" ? alto : 0)) / aspecto;
    x1 = x0 + ancho;
    y0 -= alto * 0.5;
    y1 = y0 + alto;
  } else if (t.tipo === "dorsal") {
    const r = RADIO_DORSAL * (t.grosor / 4);
    x0 -= r / aspecto; x1 += r / aspecto; y0 -= r; y1 += r;
  }
  return { x0, y0, x1, y1 };
}

function aSegmento(p: PuntoP, a: PuntoP, b: PuntoP, aspecto: number) {
  // En fracciones del alto: una fracción a lo ancho mide `aspecto` veces más.
  const ax = a.x * aspecto, bx = b.x * aspecto, px = p.x * aspecto;
  const lx = bx - ax, ly = b.y - a.y;
  const l2 = lx * lx + ly * ly;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * lx + (p.y - a.y) * ly) / l2)) : 0;
  return Math.hypot(px - (ax + lx * t), p.y - (a.y + ly * t));
}

/** ¿Toca `p` el trazo? `tol` en fracciones del alto. */
export function tocaTrazo(t: Trazo, p: PuntoP, tol = 0.02, aspecto = 16 / 9) {
  if (t.tipo === "lapiz" || t.tipo === "conector") {
    for (let i = 1; i < t.puntos.length; i += 1) if (aSegmento(p, t.puntos[i - 1], t.puntos[i], aspecto) <= tol) return true;
    return t.puntos.length === 1 && aSegmento(p, t.puntos[0], t.puntos[0], aspecto) <= tol;
  }
  if (t.tipo === "flecha" || t.tipo === "flechaRecta") {
    const [a, b] = t.puntos;
    if (t.tipo === "flechaRecta") return aSegmento(p, a, b, aspecto) <= tol;
    // La curva, en tramos.
    const c = controlDeFlecha(a, b, aspecto);
    let previo = a;
    for (let i = 1; i <= 16; i += 1) {
      const u = i / 16;
      const q = { x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * c.y + u * u * b.y };
      if (aSegmento(p, previo, q, aspecto) <= tol) return true;
      previo = q;
    }
    return false;
  }
  const { x0, y0, x1, y1 } = limites(t, aspecto);
  const holgura = tol / aspecto;
  return p.x >= x0 - holgura && p.x <= x1 + holgura && p.y >= y0 - tol && p.y <= y1 + tol;
}

/** El trazo de más arriba bajo el puntero: el último dibujado gana. */
export function trazoEn(trazos: Trazo[], p: PuntoP, aspecto = 16 / 9): string | null {
  for (let i = trazos.length - 1; i >= 0; i -= 1) if (tocaTrazo(trazos[i], p, 0.02, aspecto)) return trazos[i].id;
  return null;
}

/**
 * El punto de control de la flecha curva: se abre hacia un lado fijo según
 * la dirección, con una curvatura que crece con el largo pero no se pasa.
 */
export function controlDeFlecha(a: PuntoP, b: PuntoP, aspecto = 16 / 9): PuntoP {
  const dx = (b.x - a.x) * aspecto, dy = b.y - a.y;
  const largo = Math.hypot(dx, dy) || 1;
  const nx = -dy / largo, ny = dx / largo;
  const sentido = ny > 0 ? -1 : 1;
  const curva = Math.max(0.03, Math.min(largo * 0.3, 0.14));
  return { x: (a.x + b.x) / 2 + (nx * curva * sentido) / aspecto, y: (a.y + b.y) / 2 + ny * curva * sentido };
}

export function desplazar(t: Trazo, dx: number, dy: number): Trazo {
  return { ...t, puntos: t.puntos.map((p) => ({ x: acotar(p.x + dx), y: acotar(p.y + dy) })) };
}

/** Agranda o encoge un trazo desde su centro. En textos y dorsales cambia el tamaño de letra. */
export function escalar(t: Trazo, factor: number): Trazo {
  if (t.tipo === "texto" || t.tipo === "etiqueta" || t.tipo === "dorsal") return { ...t, grosor: Math.max(1, Math.min(24, t.grosor * factor)) };
  const { x0, y0, x1, y1 } = limites(t);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { ...t, puntos: t.puntos.map((p) => ({ x: acotar(cx + (p.x - cx) * factor), y: acotar(cy + (p.y - cy) * factor) })) };
}

/** Una copia un poco desplazada, para que se vea que hay dos. */
export const duplicar = (t: Trazo): Trazo => ({ ...desplazar(t, 0.02, 0.03), id: idDeTrazo() });

// ---- YouTube ----------------------------------------------------------------------------

/**
 * El id de un vídeo de YouTube a partir de lo que se pegue: enlace normal,
 * corto, de Shorts, embebido o el id suelto. Null si no se reconoce.
 */
export function idDeYoutube(entrada: string): string | null {
  const texto = entrada.trim();
  if (/^[\w-]{11}$/.test(texto)) return texto;
  let url: URL;
  try { url = new URL(texto.startsWith("http") ? texto : `https://${texto}`); } catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    id = url.searchParams.get("v");
    const partes = url.pathname.split("/").filter(Boolean);
    if (!id && ["embed", "shorts", "live", "v"].includes(partes[0])) id = partes[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** El segundo de inicio de un enlace (`t=90`, `t=1m30s`, `start=90`); 0 si no lo trae. */
export function inicioDeYoutube(entrada: string): number {
  let url: URL;
  try { url = new URL(entrada.trim().startsWith("http") ? entrada.trim() : `https://${entrada.trim()}`); } catch { return 0; }
  const valor = url.searchParams.get("t") ?? url.searchParams.get("start") ?? "";
  if (/^\d+s?$/.test(valor)) return parseInt(valor, 10);
  const m = valor.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !valor) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
