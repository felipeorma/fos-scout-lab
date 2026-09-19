import { isTransfermarktUrl, parseTransfermarktProfile, profileFromTmApi } from "@/lib/transfermarkt";
import { tmApiPayload } from "@/lib/tmApi";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const url = String(body.url ?? "").trim();
    if (!isTransfermarktUrl(url)) {
      return Response.json({ error: "Usa una URL válida de un perfil de Transfermarkt." }, { status: 400 });
    }

    // Se respeta el dominio recibido (por ejemplo transfermarkt.es o .com) para
    // que el perfil llegue en el idioma del reporte; solo se fuerza el "www.".
    const target = new URL(url);
    if (!/^www\./i.test(target.hostname)) target.hostname = `www.${target.hostname}`;
    const response = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    // La web pide verificación humana desde septiembre de 2026 y responde 405
    // a todo lo que no sea un navegador con la prueba resuelta. Cuando pasa
    // eso, la misma ficha se arma con la API de Transfermarkt, que sigue
    // abierta. Se intenta primero la página por si la verificación se levanta:
    // trae más cosas, como los partidos con la selección.
    const html = response.ok ? await response.text() : "";
    const profile = html ? parseTransfermarktProfile(html, response.url || url) : null;
    if (profile?.name) return Response.json(profile);

    const api = await tmApiPayload(url);
    if (api) {
      const porApi = profileFromTmApi(api, url);
      if (porApi.name) return Response.json(porApi);
    }
    if (!response.ok) throw new Error(`Transfermarkt respondió con estado ${response.status} y su API tampoco dio la ficha.`);
    throw new Error("No pudimos reconocer el perfil. Revisa que sea la página principal del jugador.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo extraer el perfil.";
    return Response.json({ error: message }, { status: 502 });
  }
}
