function allowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLocaleLowerCase("en");
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") return null;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const source = allowedImageUrl(new URL(request.url).searchParams.get("url") ?? "");
  if (!source) return Response.json({ error: "Usa una URL HTTP o HTTPS pública de una imagen." }, { status: 400 });

  try {
    const response = await fetch(source, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
      },
      redirect: "follow",
    });
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
