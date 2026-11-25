import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch } from "../lib/similarity.ts";
import { compararConSusTemporadas } from "../lib/similitudPorPeriodo.ts";

/**
 * El comparable con otras temporadas que el objetivo: cada uno se mide
 * contra su propio período.
 */

const SIN_FILTROS = {
  query: "", position: "", secondaryRole: "", side: "", passport: "",
  minimumMinutes: 0, ageMin: null, ageMax: null,
};

const central = (nombre, escala) => ({
  Player: nombre,
  Team: `Club ${nombre}`,
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

/** Doce centrales con un nivel creciente; `desplazamiento` sube a todos a la vez. */
const periodo = (desplazamiento) => Array.from({ length: 12 }, (_, i) => central(`Jugador ${i}`, 1 + i * 0.5 + desplazamiento));

test("con el mismo período a los dos lados, sale lo mismo que en el ranking", () => {
  const filas = periodo(0);
  const ranking = buildSimilaritySearch(filas, 11, SIN_FILTROS);
  const directo = ranking.candidates.find((c) => c.name === "Jugador 5");
  const aparte = compararConSusTemporadas({
    objetivo: { filas, indice: 11, claves: null },
    comparable: { filas, indice: 5, claves: null },
    porLiga: false, filters: SIN_FILTROS, metricWeights: {}, reportCohort: "AUTO", metricLabels: null,
  });
  assert.ok(directo && aparte);
  assert.equal(aparte.name, "Jugador 5");
  assert.deepEqual(aparte.metrics.map((m) => m.candidatePercentile), directo.metrics.map((m) => m.candidatePercentile));
  assert.deepEqual(aparte.metrics.map((m) => m.targetPercentile), directo.metrics.map((m) => m.targetPercentile));
});

test("el comparable se mide contra SU período, no contra el del objetivo", () => {
  const delObjetivo = periodo(0);
  // En su otro período todos rinden mucho más: sus números en bruto suben,
  // pero su sitio entre los suyos es el mismo.
  const delComparable = periodo(10);
  const aparte = compararConSusTemporadas({
    objetivo: { filas: delObjetivo, indice: 11, claves: null },
    comparable: { filas: delComparable, indice: 5, claves: null },
    porLiga: false, filters: SIN_FILTROS, metricWeights: {}, reportCohort: "AUTO", metricLabels: null,
  });
  const mismoPeriodo = buildSimilaritySearch(delObjetivo, 11, SIN_FILTROS).candidates.find((c) => c.name === "Jugador 5");
  assert.ok(aparte && mismoPeriodo);
  // Contra los suyos, el mismo percentil que tendría en el período del objetivo…
  assert.deepEqual(aparte.metrics.map((m) => m.candidatePercentile), mismoPeriodo.metrics.map((m) => m.candidatePercentile));
  // …aunque sus valores en bruto sean otros.
  assert.ok(aparte.metrics.every((m, i) => m.candidateValue > mismoPeriodo.metrics[i].candidateValue));
});

test("por liga, cada uno contra su liga dentro de su período", () => {
  const filas = [...periodo(0), ...periodo(3).map((f) => ({ ...f, Player: `${f.Player} B` }))];
  const claves = filas.map((_, i) => [i < 12 ? "Liga A·2026" : "Liga B·2026"]);
  const aparte = compararConSusTemporadas({
    objetivo: { filas, indice: 11, claves },
    comparable: { filas, indice: 12 + 11, claves },
    porLiga: true, filters: SIN_FILTROS, metricWeights: {}, reportCohort: "AUTO", metricLabels: null,
  });
  assert.ok(aparte);
  // El mejor de cada liga: arriba del todo en las dos.
  assert.ok(aparte.metrics.every((m) => m.candidatePercentile >= 90 && m.targetPercentile >= 90));
});

test("si el comparable no está en las filas, no inventa nada", () => {
  const filas = periodo(0);
  assert.equal(compararConSusTemporadas({
    objetivo: { filas, indice: 11, claves: null },
    comparable: { filas, indice: 99, claves: null },
    porLiga: false, filters: SIN_FILTROS, metricWeights: {}, reportCohort: "AUTO", metricLabels: null,
  }), null);
});
