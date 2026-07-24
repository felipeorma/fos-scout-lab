import {
  isTransfermarktUrl,
  parseTransfermarktProfile,
  type TransfermarktProfile,
} from "./transfermarkt";
import { activeLang, t, tf } from "./i18n";

/**
 * En GitHub Pages no hay servidor: las rutas /api/* no existen. Este flag se
 * fija en tiempo de build (npm run build:pages) y activa los reemplazos
 * estáticos: proxy público de imágenes y lectura de Transfermarkt vía proxy
 * CORS con parseo en el navegador.
 */
export const IS_STATIC_DEPLOYMENT = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";

// En GitHub Pages la app vive bajo /fos-scout-lab; los assets de /public
// deben llevar ese prefijo (Next solo lo agrega a sus propios bundles).
export function assetPath(path: string) {
  return IS_STATIC_DEPLOYMENT ? `/fos-scout-lab${path}` : path;
}

/**
 * Candidatos para cargar una imagen en canvas, en orden de fiabilidad. Los
 * CDNs que envían CORS (escudos de Transfermarkt) van directo; el resto pasa
 * por weserv y su espejo, con el original como último intento.
 */
export function canvasImageCandidates(src: string): string[] {
  const value = src.trim();
  if (!value) return [];
  if (value.startsWith("data:image/") || value.startsWith("blob:") || value.startsWith("/")) return [value];
  const bare = value.replace(/^https?:\/\//i, "");
  const candidates: string[] = [];
  try {
    const host = new URL(value).hostname;
    if (/akamaized\.net$|githubusercontent\.com$|wikimedia\.org$/i.test(host)) candidates.push(value);
  } catch { return []; }
  if (!IS_STATIC_DEPLOYMENT) candidates.push(`/api/image?url=${encodeURIComponent(value)}`);
  candidates.push(`https://images.weserv.nl/?url=${encodeURIComponent(bare)}`);
  candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(bare)}`);
  if (!candidates.includes(value)) candidates.push(value);
  return candidates;
}

export function proxiedImageUrl(src: string) {
  if (IS_STATIC_DEPLOYMENT) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src.replace(/^https?:\/\//i, ""))}`;
  }
  return `/api/image?url=${encodeURIComponent(src)}`;
}

export async function fetchTransfermarktProfile(url: string): Promise<Partial<TransfermarktProfile>> {
  if (!isTransfermarktUrl(url.trim())) {
    throw new Error(t("Usa una URL válida de un perfil de Transfermarkt."));
  }
  // Se acepta el link de cualquier dominio (transfermarkt.es, .us, .com, .de…)
  // y se consulta la versión que coincide con el idioma activo del reporte,
  // para que posición, pie y nacionalidad lleguen en ese idioma.
  const target = new URL(url.trim());
  target.hostname = activeLang() === "es" ? "www.transfermarkt.es" : "www.transfermarkt.com";

  if (!IS_STATIC_DEPLOYMENT) {
    const response = await fetch("/api/transfermarkt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target.href }),
    });
    const result = await response.json() as Partial<TransfermarktProfile> & { error?: string };
    if (!response.ok) throw new Error(result.error || t("No se pudo leer el perfil."));
    return result;
  }

  const html = await fetchHtmlThroughCorsProxy(target.href);
  const profile = parseTransfermarktProfile(html, target.href);
  if (!profile.name) {
    throw new Error(t("No pudimos reconocer el perfil. Revisa que sea la página principal del jugador."));
  }
  return profile;
}

// Transfermarkt bloquea las IPs de la mayoría de proxies CORS públicos; el
// lector de Jina sí llega a la página real, así que va primero. Los demás
// quedan como respaldo por si Jina limita el número de peticiones.
const CORS_PROXIES: Array<{ url: (target: string) => string; headers?: Record<string, string>; timeoutMs: number }> = [
  { url: (target) => `https://r.jina.ai/${target}`, headers: { "x-return-format": "html" }, timeoutMs: 60_000 },
  { url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
  { url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
  { url: (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`, timeoutMs: 20_000 },
];

async function fetchHtmlThroughCorsProxy(url: string) {
  let lastError: Error | null = null;
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy.url(url), {
        headers: proxy.headers,
        signal: AbortSignal.timeout(proxy.timeoutMs),
      });
      if (!response.ok) throw new Error(tf("El proxy respondió {code}.", { code: response.status }));
      const html = await response.text();
      if (html.length < 1_000) throw new Error(t("El proxy devolvió una respuesta vacía."));
      // Una página de bloqueo también puede llegar con estado 200: se valida
      // que el HTML contenga el encabezado real del perfil antes de aceptarlo.
      if (!html.includes("data-header")) throw new Error(t("El proxy devolvió una respuesta vacía."));
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw new Error(
    `${t("No se pudo leer Transfermarkt desde la versión publicada.")} ${lastError?.message ?? ""}`.trim(),
  );
}
