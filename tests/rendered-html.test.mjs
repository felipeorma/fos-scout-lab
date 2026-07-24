import assert from "node:assert/strict";
import test from "node:test";

async function request(path = "/", init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, init ?? { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza la plataforma Felipe Ormazabal Scouting y sus accesos principales", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Felipe Ormazabal Scouting \| Reportes de scouting · Scouting Reports<\/title>/i);
  assert.match(html, /LEE EL JUEGO/);
  assert.match(html, /ANTES QUE LOS DEMÁS/);
  assert.match(html, /Crear reporte/);
  assert.match(html, /Combinar datos/);
  assert.match(html, /DATA FUSION/);
  assert.match(html, /PROFILE INTEL/);
  assert.match(html, /REPORT BUILDER/);
  const mainNav = html.match(/<nav[^>]*Navegación principal[\s\S]*?<\/nav>/i)?.[0] ?? "";
  assert.match(mainNav, /Radar y percentiles/);
  assert.match(mainNav, /Similitud/);
  assert.match(mainNav, /Jugadores comparables/);
  assert.doesNotMatch(mainNav, /Combinar bases|2 a 3 archivos/i);
  assert.match(html, /Los archivos se procesan localmente/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("rechaza URLs ajenas a Transfermarkt", async () => {
  const response = await request("/api/transfermarkt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/jugador" }),
  });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /URL válida de un perfil de Transfermarkt/);
});

test("el proxy de imágenes rechaza direcciones locales", async () => {
  const response = await request("/api/image?url=http%3A%2F%2Flocalhost%2Flogo.png", { headers: { accept: "application/json" } });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /URL HTTP o HTTPS pública/);
});
