import assert from "node:assert/strict";
import test from "node:test";

import { buildPlayerReport } from "../lib/scouting.ts";

function squad() {
  const rows = [];
  // 4 porteros con paradas muy distintas entre sí
  for (let index = 0; index < 4; index += 1) {
    rows.push({
      Player: `Portero ${index + 1}`,
      Position: "GK",
      Team: "Club Test",
      Age: 25,
      "Matches played": 20,
      "Minutes played": 1800,
      "Save rate, %": 50 + index * 10,
      "Accurate passes, %": 70,
    });
  }
  // 30 jugadores de campo: no deben entrar nunca en la cohorte del portero
  for (let index = 0; index < 30; index += 1) {
    rows.push({
      Player: `Jugador ${index + 1}`,
      Position: "CF",
      Team: "Club Test",
      Age: 24,
      "Matches played": 20,
      "Minutes played": 1800,
      "Save rate, %": 0,
      "Accurate passes, %": 75,
    });
  }
  return rows;
}

test("la cohorte forzada compara solo contra jugadores de esa posición", () => {
  const rows = squad();
  const auto = buildPlayerReport(rows, 0, 500, "AUTO");
  const forced = buildPlayerReport(rows, 0, 500, "GK");

  // Forzar la cohorte no puede ampliar el grupo de referencia a toda la base.
  assert.equal(auto.cohortSize, 4);
  assert.equal(forced.cohortSize, 4);
  assert.equal(forced.cohort, "GK");
  assert.equal(forced.score, auto.score);
});

test("la cohorte respeta el mínimo de minutos", () => {
  const rows = squad();
  rows[1]["Minutes played"] = 200;
  const report = buildPlayerReport(rows, 0, 500, "GK");
  assert.equal(report.cohortSize, 3);
});

test("el tamaño de cohorte describe el grupo usado para los percentiles", () => {
  const rows = squad();
  const report = buildPlayerReport(rows, 0, 500, "CF");
  // Al pedir la cohorte de delanteros, el grupo son los 30 delanteros.
  assert.equal(report.cohort, "CF");
  assert.equal(report.cohortSize, 30);
});

test("una cohorte vacía no genera radar en P0: devuelve sin métricas", () => {
  const rows = squad();
  const report = buildPlayerReport(rows, 0, 99999, "GK");
  assert.equal(report.cohortSize, 0);
  assert.equal(report.metrics.length, 0);
  assert.equal(report.reading, "");
});
