import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Humo sobre lo que sirve el worker de verdad.
 *
 * Este archivo comprobaba una portada de marketing —"LEE EL JUEGO", "Crear
 * reporte"— que se quitó hace meses, cuando la app pasó a abrir directamente
 * en la herramienta. No saltó porque `dist/` es un artefacto local: quien
 * corriera `node --test` a secas, sin el build que hace `npm test`, validaba
 * contra una compilación vieja y veía verde. Con `dist/` recién construido
 * fallaba, y en un clon limpio ni siquiera arrancaba.
 *
 * Ahora comprueba la primera pantalla real: el conmutador de encargo, el
 * flujo de tres pasos y las tres puertas de entrada de datos. Si alguna
 * desaparece, aquí se nota.
 */

const WORKER = new URL("../dist/server/index.js", import.meta.url);
const RAIZ = new URL("../", import.meta.url);

/** El código más nuevo de app/ y lib/, para saber si el build se quedó atrás. */
function fuenteMasReciente() {
  let masNuevo = 0;
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      const info = statSync(ruta);
      if (info.isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx|css)$/.test(nombre)) masNuevo = Math.max(masNuevo, info.mtimeMs);
    }
  };
  for (const carpeta of ["app", "lib"]) {
    const ruta = join(fileURLToPath(RAIZ), carpeta);
    if (existsSync(ruta)) recorrer(ruta);
  }
  return masNuevo;
}

async function request(path = "/", init) {
  const rutaWorker = fileURLToPath(WORKER);
  if (!existsSync(rutaWorker)) {
    assert.fail("Falta dist/server/index.js. Estos tests necesitan el build: usa `npm test`, no `node --test` a secas.");
  }
  // Un dist viejo es peor que ninguno: valida una versión que ya no existe y
  // da verde. Así estuvo meses comprobando una portada retirada.
  if (statSync(rutaWorker).mtimeMs < fuenteMasReciente()) {
    assert.fail("dist/ es más antiguo que el código: estarías comprobando una versión vieja. Corre `npm test`, que construye antes.");
  }
  const url = new URL(WORKER);
  url.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init ?? { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

/** El texto visible, sin el CSS ni los scripts embebidos. */
function textoVisible(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

test("la primera pantalla trae el conmutador de encargo y las puertas de entrada", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Felipe Ormazabal Scouting \| Reportes de scouting · Scouting Reports<\/title>/i);

  const texto = textoVisible(html);
  // Los dos encargos conviven en la misma herramienta y se cambia entre ellos.
  assert.match(texto, /Cavalry/);
  assert.match(texto, /Maldonado/);
  // El flujo que ordena la pantalla: cargar, elegir, construir.
  for (const paso of ["Cargar datos", "Elegir jugador", "Construir reporte"]) {
    assert.match(texto, new RegExp(paso), `falta el paso "${paso}"`);
  }
  // Las tres formas de traer datos. Si se cae una, el usuario se queda fuera.
  assert.match(texto, /Usar una base/);
  assert.match(texto, /Combinar bases/);
  assert.match(texto, /Conectar API/);
  // Bilingüe desde el primer momento.
  assert.match(texto, /\bES\b/);
  assert.match(texto, /\bEN\b/);
});

test("no se cuela andamiaje del build en la página", async () => {
  const html = await (await request()).text();
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
