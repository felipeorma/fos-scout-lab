import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * El PDF sale en el orden en que las hojas están en la página, no en el de la
 * lista del diálogo de imprimir. Si los dos se separan, el diálogo promete un
 * orden que el PDF no cumple (pasó: Contexto y la Ficha ampliada salían al
 * final). Esto lee los dos órdenes del código y exige que coincidan.
 */
const fuente = readFileSync(new URL("../app/ScoutStudio.tsx", import.meta.url), "utf8");

function ordenDelDialogo() {
  const inicio = fuente.indexOf("const paginasParaImprimir");
  const lista = fuente.slice(fuente.indexOf(": [", inicio), fuente.indexOf("];", inicio));
  return [...lista.matchAll(/page: ([A-Z_]+_PAGE)|visualPages\.map/g)].map((m) => m[1] ?? "VISUALES");
}

function ordenDelRender() {
  const render = fuente.slice(fuente.indexOf('<div className="legal-page-shell">{reportArticleNode}'));
  const marcas = [
    ["CARD_PAGE", 'className="legal-page-shell">{reportArticleNode}'],
    ["SIMILARITY_PAGE", "similarity-page-host"],
    ["VISUALES", "visualPages.filter((page) => printRun"],
    ...["SNAPSHOT_PAGE", "CONTEXT_PAGE", "RUNS_PAGE", "RANK_PAGE", "STYLE_PAGE", "FLOW_PAGE"].map((p) => [p, `claseHoja(${p})`]),
  ];
  return marcas.map(([pagina, marca]) => ({ pagina, en: render.indexOf(marca) }))
    .filter(({ en }) => en >= 0)
    .sort((a, b) => a.en - b.en)
    .map(({ pagina }) => pagina);
}

test("las hojas se pintan en el orden del diálogo de imprimir", () => {
  const dialogo = ordenDelDialogo();
  assert.ok(dialogo.length >= 9, `lista del diálogo: ${dialogo}`);
  assert.deepEqual(ordenDelRender(), dialogo);
});
