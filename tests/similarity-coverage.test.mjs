import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport } from "../lib/scouting.ts";
import { buildSimilaritySearch } from "../lib/similarity.ts";

const METRICAS = ["xG per 90", "Shots per 90", "Passes per 90", "Key passes per 90", "Accurate passes, %",
  "Progressive runs per 90", "Interceptions per 90", "Defensive duels won, %", "Aerial duels won, %", "PAdj Sliding tackles"];
const HEADERS = ["Player", "Team", "Position", "Age", "Minutes played", "Matches played", "Goals", "Assists", ...METRICAS];

function jugador(nombre, semilla, huecos = []) {
  const fila = { Player: nombre, Team: "Club Uno", Position: "CB", Age: 25, "Minutes played": 1500, "Matches played": 20, Goals: 1, Assists: 1 };
  METRICAS.forEach((m, i) => { fila[m] = huecos.includes(m) ? "" : Number((((semilla * 7 + i * 13) % 40) / 10 + 0.5).toFixed(2)); });
  return fila;
}

test("un candidato con datos a medias no encabeza el ranking de similitud", () => {
  const filas = [jugador("Objetivo Uno", 1)];
  for (let i = 2; i <= 14; i += 1) filas.push(jugador(`Completo ${i}`, i));
  // Casi sin datos: solo conserva dos métricas.
  filas.push(jugador("Escaso Nueve", 1, METRICAS.slice(2)));
  const result = aggregateDatasets([{ fileName: "liga.xlsx", season: 2026, provider: "wyscout", headers: HEADERS, rows: filas }]);
  const objetivo = result.rows.findIndex((row) => row.Player === "Objetivo Uno");
  const informe = buildPlayerReport(result.rows, objetivo, 0, "AUTO");
  const busqueda = buildSimilaritySearch(result.rows, objetivo, { minimumMinutes: 0, query: "" }, {}, "AUTO");

  assert.ok(busqueda.candidates.length > 0, "sin candidatos");
  assert.ok(!busqueda.candidates.some((c) => c.name === "Escaso Nueve"), "el candidato con 2 de 10 métricas entró al ranking");
  const minimo = Math.ceil(informe.metrics.length * 0.6);
  for (const candidato of busqueda.candidates) {
    assert.ok(candidato.metrics.length >= minimo, `${candidato.name} compara solo ${candidato.metrics.length} de ${informe.metrics.length}`);
  }
});

test("la comparación usa las mismas métricas y percentiles que la ficha", () => {
  const filas = [];
  for (let i = 1; i <= 12; i += 1) filas.push(jugador(`Jugador ${i}`, i));
  const result = aggregateDatasets([{ fileName: "liga.xlsx", season: 2026, provider: "wyscout", headers: HEADERS, rows: filas }]);
  const informe = buildPlayerReport(result.rows, 0, 0, "AUTO");
  const busqueda = buildSimilaritySearch(result.rows, 0, { minimumMinutes: 0, query: "" }, {}, "AUTO");
  const candidato = busqueda.candidates[0];
  for (const metrica of candidato.metrics) {
    const enFicha = informe.metrics.find((m) => m.label === metrica.label);
    assert.ok(enFicha, `${metrica.label} no está en la ficha`);
    assert.equal(metrica.targetPercentile, enFicha.percentile);
  }
});
