import assert from "node:assert/strict";
import test from "node:test";
import { candidatosParaEquipo, frenteDePareto, nivelDeFila } from "../lib/ranking.ts";
import { margenDelIndice } from "../lib/fiabilidad.ts";

/** Candidatos para un equipo: ordenados por cuánto mejoran a su titular, con su margen. */

const fila = (jugador, equipo, aNivel, minutos, extra = {}) => ({
  indice: 0, jugador, equipo, edad: 24, minutos, puntuacion: aNivel, puntuacionCruda: aNivel - 5, aNivel,
  metricas: 12, destacadas: [], pasaportes: [], ...extra,
});

test("la mejora es contra el titular (el de más minutos), y el equipo no se recomienda a sí mismo", () => {
  const filas = [
    fila("Titular", "Cavalry FC", 60, 2400),
    fila("Suplente", "Cavalry FC", 70, 500),
    fila("Bueno", "Pacific FC", 75, 2200),
    fila("Igual", "Forge FC", 61, 2500),
    fila("Peor", "York", 50, 2000),
  ];
  const { titular, plantilla, candidatos } = candidatosParaEquipo(filas, (f) => f.equipo === "Cavalry FC", margenDelIndice);
  assert.equal(titular.jugador, "Titular");
  assert.deepEqual(plantilla.map((f) => f.jugador), ["Titular", "Suplente"]);
  assert.deepEqual(candidatos.map((c) => [c.jugador, c.mejora]), [["Bueno", 15], ["Igual", 1], ["Peor", -10]]);
  // 2200′ y 2400′: margen ±8 cada uno → ±11 la diferencia. +15 es claro; +1 no.
  assert.equal(candidatos[0].margen, 11);
  assert.equal(candidatos[0].clara, true);
  assert.equal(candidatos[1].clara, false);
});

test("sin nivel de liga se compara el índice dentro de su liga; sin titular no hay mejora", () => {
  assert.equal(nivelDeFila(fila("X", "A", null, 1000, { puntuacionCruda: 64 })), 64);
  const { titular, candidatos } = candidatosParaEquipo([fila("A", "Pacific FC", 70, 2000)], (f) => f.equipo === "Cavalry FC", margenDelIndice);
  assert.equal(titular, null);
  assert.equal(candidatos[0].mejora, null);
  assert.equal(candidatos[0].clara, false);
});

test("pocos minutos: sin margen no hay mejora clara, por grande que sea", () => {
  const { candidatos } = candidatosParaEquipo([fila("T", "Cavalry FC", 50, 2000), fila("Ráfaga", "X", 90, 200)], (f) => f.equipo === "Cavalry FC", margenDelIndice);
  assert.equal(candidatos[0].mejora, 40);
  assert.equal(candidatos[0].margen, null);
  assert.equal(candidatos[0].clara, false);
});

test("el frente de Pareto: fuera solo quien tiene a otro igual o mejor en todo", () => {
  const a = { mejora: 10, encaje: 60, juventud: -24 };
  const b = { mejora: 8, encaje: 80, juventud: -26 };
  const c = { mejora: 7, encaje: 55, juventud: -27 };   // dominado por a
  const d = { mejora: 2, encaje: 50, juventud: -19 };   // el más joven: entra
  const e = { mejora: 9, encaje: Number.NaN, juventud: -25 }; // sin encaje: por debajo de a en todo
  const frente = frenteDePareto([a, b, c, d, e], [(x) => x.mejora, (x) => x.encaje, (x) => x.juventud]);
  assert.deepEqual([a, b, c, d, e].map((x) => frente.has(x)), [true, true, false, true, false]);
});
