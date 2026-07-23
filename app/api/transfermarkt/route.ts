import { isTransfermarktUrl, parseTransfermarktProfile } from "@/lib/transfermarkt";

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
    if (!response.ok) throw new Error(`Transfermarkt respondió con estado ${response.status}.`);

    const html = await response.text();
    const profile = parseTransfermarktProfile(html, response.url || url);
    if (!profile.name) throw new Error("No pudimos reconocer el perfil. Revisa que sea la página principal del jugador.");
    return Response.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo extraer el perfil.";
    return Response.json({ error: message }, { status: 502 });
  }
}
