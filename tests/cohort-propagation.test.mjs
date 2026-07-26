import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport } from "../lib/scouting.ts";
import { buildSimilaritySearch } from "../lib/similarity.ts";

function base() {
  const rows = [
    { Player: "Objetivo", Age: 24, Team: "Club A", Position: "RWF, CF", "Matches played": 20, "Minutes played": 1800, "Goals per 90": .5, "xG per 90": .4, "Shots on target, %": 40, "Touches in box per 90": 5, "Aerial duels won, %": 50, "Accurate passes, %": 78, "Received passes per 90": 22 },
    { Player: "Comparable", Age: 25, Team: "Club B", Position: "CF", "Matches played": 20, "Minutes played": 1800, "Goals per 90": .4, "xG per 90": .35, "Shots on target, %": 44, "Touches in box per 90": 6, "Aerial duels won, %": 55, "Accurate passes, %": 74, "Received passes per 90": 25 },
  ];
  return aggregateDatasets([{ fileName: "liga.xlsx", season: 2026, headers: Object.keys(rows[0]), rows }]);
}
const filtros = { query: "", ageMin: null, ageMax: null, minimumMinutes: 0, passport: "", position: "" };

test("la cohorte asignada en la ficha manda también en la comparación", () => {
  const data = base();
  for (const cohorte of ["CF", "AM", "WING"]) {
    const ficha = buildPlayerReport(data.rows, 0, 0, cohorte);
    const comparacion = buildSimilaritySearch(data.rows, 0, filtros, {}, cohorte);
    assert.equal(comparacion.target.cohort, ficha.cohort, `cohorte ${cohorte}`);
    assert.deepEqual(
      comparacion.target.metrics.map((m) => m.label),
      ficha.metrics.map((m) => m.label),
      `las métricas de ${cohorte} deben coincidir entre páginas`,
    );
  }
});

test("el filtro de rol de la comparación sigue teniendo prioridad", () => {
  const data = base();
  const s = buildSimilaritySearch(data.rows, 0, { ...filtros, position: "Forward" }, {}, "AM");
  assert.equal(s.target.cohort, "CF");
});

test("sin cohorte asignada se mantiene la detección automática", () => {
  const data = base();
  const s = buildSimilaritySearch(data.rows, 0, filtros, {}, "AUTO");
  assert.equal(s.target.cohort, buildPlayerReport(data.rows, 0, 0, "AUTO").cohort);
});
