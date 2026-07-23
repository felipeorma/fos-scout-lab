import {
  isTransfermarktUrl,
  parseTransfermarktProfile,
  type TransfermarktProfile,
} from "./transfermarkt";

/**
 * En GitHub Pages no hay servidor: las rutas /api/* no existen. Este flag se
 * fija en tiempo de build (npm run build:pages) y activa los reemplazos
 * estáticos: proxy público de imágenes y lectura de Transfermarkt vía proxy
 * CORS con parseo en el navegador.
 */
export const IS_STATIC_DEPLOYMENT = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true";

export function proxiedImageUrl(src: string) {
  if (IS_STATIC_DEPLOYMENT) {
    return `https://images.weserv.nl/?url=${encodeURIComponent(src.replace(/^https?:\/\//i, ""))}`;
  }
  return `/api/image?url=${encodeURIComponent(src)}`;
}

export async function fetchTransfermarktProfile(url: string): Promise<Partial<TransfermarktProfile>> {
  if (!IS_STATIC_DEPLOYMENT) {
    const response = await fetch("/api/transfermarkt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const result = await response.json() as Partial<TransfermarktProfile> & { error?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo leer el perfil.");
    return result;
  }

  if (!isTransfermarktUrl(url)) {
    throw new Error("Usa una URL válida de un perfil de Transfermarkt.");
  }
  const target = new URL(url);
  target.hostname = "www.transfermarkt.com";
  const html = await fetchHtmlThroughCorsProxy(target.href);
  const profile = parseTransfermarktProfile(html, target.href);
  if (!profile.name) {
    throw new Error("No pudimos reconocer el perfil. Revisa que sea la página principal del jugador.");
  }
  return profile;
}

const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

async function fetchHtmlThroughCorsProxy(url: string) {
  let lastError: Error | null = null;
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const response = await fetch(buildProxyUrl(url), { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`El proxy respondió ${response.status}.`);
      const html = await response.text();
      if (html.length < 1_000) throw new Error("El proxy devolvió una respuesta vacía.");
      return html;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw new Error(
    `No se pudo leer Transfermarkt desde la versión publicada. ${lastError?.message ?? ""}`.trim(),
  );
}
