import assert from "node:assert/strict";
import test from "node:test";
import { lineaDeDatos } from "../lib/fechasDelInforme.ts";

test("el pie dice de qué datos sale la hoja, cuándo se cargaron y, al imprimir, cuándo se generó", () => {
  const cargadaEl = Date.UTC(2026, 9, 10, 12);
  const generadoEl = Date.UTC(2026, 9, 14, 18, 30);
  const enPantalla = lineaDeDatos({ descripcion: "Canadian Premier League · 2026", cargadaEl, generadoEl: null });
  assert.match(enPantalla, /^Datos: Canadian Premier League · 2026 · cargados el /);
  assert.doesNotMatch(enPantalla, /generado/, "en pantalla no hay fecha de generación");
  assert.match(lineaDeDatos({ descripcion: "X", cargadaEl, generadoEl }), /generado el .+, \d{2}:\d{2}$/);
  assert.equal(lineaDeDatos({ descripcion: "", cargadaEl: null, generadoEl: null }), "");
});
