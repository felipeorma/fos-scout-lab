import assert from "node:assert/strict";
import test from "node:test";

import { buildSimilaritySearch } from "../lib/similarity.ts";

function goalkeeperRows() {
  const rows = [];
  // 5 porteros: el objetivo concede menos que nadie (mejor) y ataja más
  for (let index = 0; index < 5; index += 1) {
    rows.push({
      Player: `Portero ${index + 1}`,
      Position: "GK",
      Team: "Club Test",
      Age: 26,
      "Matches played": 20,
      "Minutes played": 1800,
      "Save rate, %": 78 - index * 4,
      "Conceded goals per 90": 0.6 + index * 0.3,
      "xG against per 90": 0.8 + index * 0.2,
      "Accurate passes, %": 80,
      "Accurate long passes, %": 50,
      "Aerial duels per 90": 1,
      "Prevented goals per 90": 0.4 - index * 0.1,
      "Exits per 90": 1,
    });
  }
  // 40 jugadores de campo con "estadísticas de portero" absurdas: si entraran
  // en la población, distorsionarían los percentiles.
  for (let index = 0; index < 40; index += 1) {
    rows.push({
      Player: `Campo ${index + 1}`,
      Position: "CF",
      Team: "Club Test",
      Age: 24,
      "Matches played": 20,
      "Minutes played": 1800,
      "Save rate, %": 0,
      "Conceded goals per 90": 0,
      "xG against per 90": 0,
      "Accurate passes, %": 75,
    });
  }
  return rows;
}

test("los percentiles de similitud usan la cohorte, no toda la base", () => {
  const filters = { query: "", ageMin: null, ageMax: null, minimumMinutes: 500, passport: "", position: "" };
  const search = buildSimilaritySearch(goalkeeperRows(), 0, filters);
  const saves = search.candidates
    .flatMap((candidate) => candidate.metrics)
    .find((metric) => metric.key === "Save rate, %");
  assert.ok(saves, "debe existir la métrica de atajadas");
  // El objetivo ataja 78% — el mejor de 5 porteros → percentil alto (90).
  // Si la población incluyera a los 40 jugadores de campo con 0%, su rango
  // sería distinto y el de los candidatos también.
  assert.equal(saves.targetPercentile, 90);
});

test("las métricas invertidas se invierten también en similitud", () => {
  const filters = { query: "", ageMin: null, ageMax: null, minimumMinutes: 500, passport: "", position: "" };
  const search = buildSimilaritySearch(goalkeeperRows(), 0, filters);
  const conceded = search.candidates
    .flatMap((candidate) => candidate.metrics)
    .find((metric) => metric.key === "Conceded goals per 90");
  assert.ok(conceded, "debe existir goles concedidos");
  // El objetivo concede 0.6, el mínimo de la cohorte: al ser métrica invertida
  // su percentil debe ser ALTO (90), no bajo.
  assert.equal(conceded.targetPercentile, 90);
  // La ficha de la Página 1 debe mostrar el mismo percentil para la misma métrica.
  const cardMetric = search.target.metrics.find((metric) => metric.key === "Conceded goals per 90");
  assert.equal(cardMetric.percentile, conceded.targetPercentile);
});
