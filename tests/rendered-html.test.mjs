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

test("renderiza FOS Scout Lab con sus dos flujos", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>FOS Scout Lab \| Reportes de scouting<\/title>/i);
  assert.match(html, /Convierte datos en/);
  assert.match(html, /decisiones de scouting/);
  assert.match(html, /Combinar bases/);
  assert.match(html, /1 a 3 archivos/);
  assert.match(html, /01 · Cargar datos/);
  assert.match(html, /02 · Completar perfil/);
  assert.match(html, /Transfermarkt, logos y foto PNG/);
  assert.match(html, /Comienza cargando los datos/);
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
