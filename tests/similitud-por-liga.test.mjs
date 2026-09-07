import assert from "node:assert/strict";
import test from "node:test";
import { MINIMO_COHORTE_POR_LIGA, buildSimilaritySearch } from "../lib/similarity.ts";

/**
 * Percentiles contra la propia liga, en vez de contra el fondo entero.
 *
 * Lo que se comprueba aquí es que el modo cambia de verdad la regla de medir,
 * que no deja pasar a nadie medido con una cohorte demasiado pequeña, y que
 * quien jugó en dos ligas se compara con las dos juntas.
 */

const SIN_FILTROS = {
  query: "", position: "", secondaryRole: "", side: "", passport: "",
  minimumMinutes: 0, ageMin: null, ageMax: null,
};

/** Un central con las métricas que el perfil CB necesita. */
const central = (nombre, equipo, escala) => ({
  Player: nombre,
  Team: equipo,
  Position: "CB",
  Age: 25,
  "Minutes played": 1800,
  "Matches played": 20,
  "Defensive duels won %": 40 + escala * 5,
  "Aerial duels won %": 40 + escala * 5,
  "Interceptions per 90": escala,
  "Accurate passes %": 60 + escala * 3,
  "Accurate long passes %": 40 + escala * 4,
  "Progressive runs per 90": escala / 2,
  "Shots blocked per 90": escala / 3,
  "Sliding tackles per 90": escala / 4,
});

/**
 * Dos ligas de doce centrales. En la "floja" todos rinden poco salvo uno; en
 * la "fuerte" todos rinden mucho. El de arriba de la floja y el de arriba de
 * la fuerte tienen números MUY distintos, pero el mismo papel en su liga.
 */
function dosLigas() {
  const filas = [];
  for (let i = 0; i < 12; i += 1) filas.push(central(`Floja ${i}`, `Club F${i}`, 1 + i * 0.1));
  for (let i = 0; i < 12; i += 1) filas.push(central(`Fuerte ${i}`, `Club S${i}`, 6 + i * 0.1));
  const ligas = filas.map((_, i) => (i < 12 ? ["Liga floja"] : ["Liga fuerte"]));
  return { filas, ligas };
}

test("por liga, el mejor de la floja se parece al mejor de la fuerte", () => {
  const { filas, ligas } = dosLigas();
  const mejorFloja = filas.findIndex((f) => f.Player === "Floja 11");

  const global = buildSimilaritySearch(filas, mejorFloja, SIN_FILTROS);
  const porLiga = buildSimilaritySearch(filas, mejorFloja, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: ligas, minimoCohorte: 5 });
  assert.ok(global && porLiga);

  const puesto = (r, nombre) => r.candidates.findIndex((c) => c.name === nombre);
  // Medido contra todos, el mejor de la liga floja está muy por debajo de
  // cualquiera de la fuerte y no se parece al que manda allí.
  assert.ok(puesto(porLiga, "Fuerte 11") < puesto(global, "Fuerte 11"),
    "midiendo por liga, el que manda en la otra liga tiene que acercarse");
});

test("el objetivo se mide contra su liga, no contra el fondo", () => {
  const { filas, ligas } = dosLigas();
  const mejorFloja = filas.findIndex((f) => f.Player === "Floja 11");
  const global = buildSimilaritySearch(filas, mejorFloja, SIN_FILTROS);
  const porLiga = buildSimilaritySearch(filas, mejorFloja, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: ligas, minimoCohorte: 5 });
  const percentilMedio = (r) => {
    const c = r.candidates[0];
    return c.metrics.reduce((s, m) => s + m.targetPercentile, 0) / c.metrics.length;
  };
  // El mismo jugador: mediocre entre todos, el mejor de los suyos.
  assert.ok(percentilMedio(porLiga) > percentilMedio(global) + 20,
    "contra su propia liga el objetivo tiene que subir mucho");
});

test("una liga sin cohorte suficiente no entra", () => {
  const { filas, ligas } = dosLigas();
  // Un jugador solo en su liga: no hay contra quién medirlo.
  filas.push(central("Solitario", "Club X", 3));
  ligas.push(["Liga diminuta"]);
  const objetivo = filas.findIndex((f) => f.Player === "Floja 11");
  const r = buildSimilaritySearch(filas, objetivo, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: ligas, minimoCohorte: 5 });
  assert.ok(r, "el objetivo sí tiene cohorte");
  assert.equal(r.candidates.some((c) => c.name === "Solitario"), false,
    "el de la liga diminuta no puede colarse medido con otra regla");
});

test("si el propio objetivo no tiene cohorte, no hay comparación", () => {
  const { filas, ligas } = dosLigas();
  filas.push(central("Solitario", "Club X", 3));
  ligas.push(["Liga diminuta"]);
  const r = buildSimilaritySearch(filas, filas.length - 1, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: ligas, minimoCohorte: 5 });
  assert.equal(r, null, "medir a alguien contra tres compañeros sería inventar un número");
});

test("quien jugó en dos ligas se compara contra las dos juntas", () => {
  const { filas, ligas } = dosLigas();
  const traspasado = filas.findIndex((f) => f.Player === "Floja 11");
  ligas[traspasado] = ["Liga floja", "Liga fuerte"];
  const r = buildSimilaritySearch(filas, traspasado, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: ligas, minimoCohorte: 5 });
  assert.ok(r);
  // Con las dos ligas dentro, su percentil vuelve a parecerse al global.
  const soloFloja = buildSimilaritySearch(filas, traspasado, SIN_FILTROS, {}, "AUTO", null, { ligasPorFila: dosLigas().ligas, minimoCohorte: 5 });
  const medio = (x) => { const c = x.candidates[0]; return c.metrics.reduce((s, m) => s + m.targetPercentile, 0) / c.metrics.length; };
  assert.ok(medio(r) < medio(soloFloja), "sumar la liga fuerte tiene que bajarle el percentil");
});

test("el mínimo por defecto son diez jugadores", () => {
  assert.equal(MINIMO_COHORTE_POR_LIGA, 10);
});
