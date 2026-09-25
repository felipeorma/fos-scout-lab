import assert from "node:assert/strict";
import test from "node:test";
import { contextoDeLectura, etiquetasParaLectura } from "../lib/lecturaIA.ts";
import { METRICS, metricCatalogue } from "../lib/scouting.ts";
import { COMPUESTAS } from "../lib/snapshot.ts";

/**
 * Lo que se le da a la IA para la lectura rápida: el jugador entero, no solo
 * las métricas de la ficha.
 */

test("a un jugador de campo no se le pasan las métricas que solo tiene el portero", () => {
  const dePortero = METRICS.GK.map((d) => d.label);
  const deCampo = new Set(Object.entries(METRICS).filter(([p]) => p !== "GK").flatMap(([, ds]) => ds.map((d) => d.label)));
  const soloPortero = dePortero.find((label) => !deCampo.has(label));
  const compartida = dePortero.find((label) => deCampo.has(label));
  const catalogo = [soloPortero, compartida, [...deCampo][0]].filter(Boolean);
  const extremo = etiquetasParaLectura("WING", catalogo);
  assert.ok(!extremo.includes(soloPortero), "la de portero sobra");
  if (compartida) assert.ok(extremo.includes(compartida), "la compartida se queda");
  assert.deepEqual(etiquetasParaLectura("GK", catalogo).sort(), [soloPortero, compartida].filter(Boolean).sort());
});

test("familias de la más alta a la más baja y, aparte, solo las métricas que no están en la ficha", () => {
  const jugador = (nombre, k) => {
    const fila = { Player: nombre, Team: "T", Position: "RW", Age: 24, "Minutes played": 1800, "Matches played": 20 };
    COMPUESTAS.forEach((familia, f) => familia.columnas.forEach((columna) => { fila[columna] = 10 + k * (f % 3 === 0 ? 3 : 1); }));
    return fila;
  };
  const filas = Array.from({ length: 12 }, (_, k) => jugador(`J${k}`, k));
  const catalogo = metricCatalogue(filas, "WING").map((d) => d.label);
  assert.ok(catalogo.length > 3, "la base de prueba trae métricas del catálogo");
  const enFicha = catalogo.slice(0, 2);
  const { familias, resto } = contextoDeLectura(filas, 11, 0, "WING", enFicha, catalogo);
  assert.ok(familias.length > 0);
  for (let i = 1; i < familias.length; i += 1) assert.ok(familias[i - 1].percentil >= familias[i].percentil);
  assert.ok(resto.every((m) => !enFicha.includes(m.label)), "lo de la ficha no se repite");
  assert.ok(resto.every((m) => Number.isFinite(m.percentile)));
});

test("a un portero solo se le pasan las familias de juego con el pie", () => {
  const portero = (nombre, k) => {
    const fila = { Player: nombre, Team: "T", Position: "GK", Age: 28, "Minutes played": 2000, "Matches played": 22 };
    for (const familia of COMPUESTAS) for (const columna of familia.columnas) fila[columna] = 5 + k;
    return fila;
  };
  const filas = Array.from({ length: 8 }, (_, k) => portero(`P${k}`, k));
  const { familias } = contextoDeLectura(filas, 7, 0, "GK", [], []);
  assert.ok(familias.length > 0);
  assert.ok(familias.every((f) => ["Construcción", "Asociación"].includes(f.familia)), familias.map((f) => f.familia).join(", "));
});
