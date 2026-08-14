// Proxy de imágenes para escudos y fotos de Transfermarkt. Endurecido contra
// SSRF: bloquea hosts privados (IPv4 e IPv6, con y sin corchetes) y revalida
// cada salto de redirección en lugar de seguirlos a ciegas.
function isBlockedHost(rawHost: string) {
  const host = rawHost.toLocaleLowerCase("en").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;
  // IPv4 privadas / loopback / link-local / CGNAT
  if (/^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  // IPv6 loopback / link-local / unique-local / IPv4-mapeadas
  if (/^(fe80:|fc|fd)/.test(host)) return true;
  if (host.startsWith("::ffff:")) return true;
  // Hostname puramente numérico (IP decimal/octal disfrazada)
  if (/^\d+$/.test(host)) return true;
  return false;
}

function allowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isBlockedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

const MAX_REDIRECTS = 3;

export async function GET(request: Request) {
  const source = allowedImageUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!source) return Response.json({ error: "Usa una URL HTTP o HTTPS pública de una imagen." }, { status: 400 });

  try {
    let current: URL = source;
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(current, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
        },
        redirect: "manual",
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      // Cada salto se revalida contra la misma lista de bloqueo que la URL inicial.
      const next = allowedImageUrl(new URL(location, current).href);
      if (!next) throw new Error("La redirección apunta a una dirección no permitida.");
      current = next;
      response = null;
    }
    if (!response) throw new Error("Demasiadas redirecciones.");
    if (!response.ok) throw new Error(`La imagen respondió con estado ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) throw new Error("La URL no devolvió una imagen.");
    const body = await response.arrayBuffer();
    if (body.byteLength > 8 * 1024 * 1024) throw new Error("La imagen supera el límite de 8 MB.");
    return new Response(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
        "content-length": String(body.byteLength),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo descargar la imagen.";
    return Response.json({ error: message }, { status: 502 });
  }
}
