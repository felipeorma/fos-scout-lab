import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * El Estudio táctico y el Pintado de acciones usan el panel lateral que era
 * del diseñador de Visuales (inspector-fila, inspector-tarjeta…). Al quitar
 * Visuales se fueron sus estilos y la pizarra se publicó con los controles sin
 * formato, sin que nada fallara. Cada clase del panel tiene que seguir en la hoja.
 */
const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

test("cada clase del panel compartido que usa la pizarra tiene estilo en globals.css", () => {
  const hoja = leer("app/globals.css");
  for (const archivo of ["app/EstudioTactico.tsx", "app/PintadoAcciones.tsx"]) {
    const clases = new Set(
      [...leer(archivo).matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)]
        .flatMap((m) => (m[1] ?? m[2]).split(/\s+/))
        .filter((clase) => /^(inspector-|designer-controls$)/.test(clase)),
    );
    assert.ok(clases.size > 0, archivo);
    for (const clase of clases) assert.ok(hoja.includes(`.${clase}`), `${archivo}: .${clase} no tiene estilo`);
  }
});
