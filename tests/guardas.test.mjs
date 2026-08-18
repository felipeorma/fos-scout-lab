import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Guardas estructurales. No prueban lógica: impiden que vuelvan defectos que
 * ya ocurrieron una vez y que ninguna prueba de datos detecta, porque viven
 * en cadenas de CSS y selectores.
 */

const scoutStudio = readFileSync(new URL("../app/ScoutStudio.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("toda hoja imprimible entra en el ajuste automático de página", () => {
  const selector = scoutStudio.match(/FIT_SELECTOR = "([^"]+)"/)?.[1] ?? "";
  // Si una hoja no está aquí, al exportar se recorta en silencio: el ajuste
  // nunca la mide y el shell tiene overflow hidden.
  for (const hoja of [".scout-report", ".visual-report-page", ".context-page"]) {
    assert.ok(selector.includes(hoja), `${hoja} fuera del ajuste de impresión: se recortaría al exportar`);
  }
});

test("las páginas del informe se registran en el diálogo de exportación", () => {
  // Una página que se ve pero no se puede exportar es media función.
  for (const pagina of ["CARD_PAGE", "SIMILARITY_PAGE", "CONTEXT_PAGE"]) {
    const enDialogo = new RegExp(`\\{ page: ${pagina},`).test(scoutStudio);
    assert.ok(enDialogo, `${pagina} no aparece en el diálogo de impresión`);
  }
});

test("los controles de trabajo nunca se imprimen", () => {
  // Botones y filtros son herramientas, no contenido del informe.
  for (const clase of ["ctx-toolbar", "ctx-controls", "ctx-picker", "ctx-source", "reading-ai"]) {
    const oculto = new RegExp(`\\.${clase}[^{]*\\{[^}]*display:\\s*none`).test(globals)
      || new RegExp(`@media print[^@]*\\.${clase}`, "s").test(globals);
    assert.ok(oculto, `.${clase} se imprimiría dentro del informe`);
  }
});

test("cada ficha del catálogo declara los perfiles a los que responde", async () => {
  const { CATALOGO } = await import("../app/ContextCatalog.ts");
  for (const ficha of CATALOGO) {
    assert.ok(Array.isArray(ficha.perfiles), `${ficha.id} sin perfiles declarados`);
    assert.ok(ficha.titulo && ficha.lectura, `${ficha.id} sin título o lectura`);
    assert.ok(["cuadrante", "ranking", "zscores", "swarm"].includes(ficha.tipo), `${ficha.id} con tipo desconocido`);
  }
});

test("no quedan scripts de diagnóstico sueltos en la raíz", () => {
  const sueltos = readdirSync(new URL("../", import.meta.url))
    .filter((archivo) => archivo.endsWith(".mjs") && !["eslint.config.mjs", "postcss.config.mjs"].includes(archivo));
  assert.deepEqual(sueltos, [], `scripts de prueba sin borrar: ${sueltos.join(", ")}`);
});
