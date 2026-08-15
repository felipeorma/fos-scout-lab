import assert from "node:assert/strict";
import test from "node:test";
import { METRICS, aggregateDatasets, peerCohort } from "../lib/scouting.ts";

const HEADERS = ["Player", "Team", "Age", "Birth date", "Minutes played", "Matches played", "Goals", "Assists"];

function dataset(fileName, season, provider, rows) {
  return { fileName, season, provider, headers: HEADERS, rows };
}

function player(overrides = {}) {
  return {
    Player: "Jordan Smith",
    Team: "Cavalry FC",
    Age: 24,
    "Birth date": "1999-03-31",
    "Minutes played": 1000,
    "Matches played": 12,
    Goals: 8,
    Assists: 3,
    ...overrides,
  };
}

test("los goles no se duplican cuando dos plataformas describen la misma temporada", () => {
  const result = aggregateDatasets([
    dataset("wyscout 2026.xlsx", 2026, "wyscout", [player()]),
    dataset("StatsBomb · CPL 2026", 2026, "statsbomb", [player()]),
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].Goals, 8);
  assert.equal(result.rows[0].Assists, 3);
  assert.equal(result.rows[0]["Minutes played"], 1000);
});

test("los goles siguen sumándose entre temporadas del mismo proveedor", () => {
  const result = aggregateDatasets([
    dataset("wyscout 2025.xlsx", 2025, "wyscout", [player({ Goals: 5 })]),
    dataset("wyscout 2026.xlsx", 2026, "wyscout", [player({ Goals: 8 })]),
  ]);
  assert.equal(result.rows[0].Goals, 13);
});

test("SkillCorner no impone la identidad: el club y la posición salen de la base", () => {
  const result = aggregateDatasets([
    dataset("StatsBomb · CPL 2026", 2026, "statsbomb", [player({ Team: "Inter Toronto FC" })]),
    dataset("SkillCorner · CPL 2026", 2026, "skillcorner", [player({ Team: "York United FC" })]),
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].Team, "Inter Toronto FC");
});

test("un mismo club escrito distinto entre plataformas se fusiona", () => {
  const result = aggregateDatasets([
    dataset("wyscout 2026.xlsx", 2026, "wyscout", [player({ Player: "J. Smith", Team: "Vancouver FC" })]),
    dataset("StatsBomb · CPL 2026", 2026, "statsbomb", [player({ Team: "Vancouver Football Club" })]),
  ]);
  assert.equal(result.rows.length, 1);
});

test("dos clubes distintos de la misma ciudad no se confunden", () => {
  const result = aggregateDatasets([
    dataset("cpl 2026.xlsx", 2026, "wyscout", [player({ Player: "J. Smith", Team: "Inter Toronto FC" })]),
    dataset("mls 2026.xlsx", 2026, "wyscout", [player({ Team: "Toronto FC" })]),
  ]);
  assert.equal(result.rows.length, 2);
});

test("la fecha de nacimiento fusiona nombres escritos distinto entre plataformas", () => {
  const result = aggregateDatasets([
    dataset("StatsBomb · CPL 2026", 2026, "statsbomb", [player({ Player: "Ballou Jean-Yves Tabla", Team: "Atlético Ottawa" })]),
    dataset("SkillCorner · CPL 2026", 2026, "skillcorner", [player({ Player: "Ballou Tabla", Team: "Atletico Ottawa" })]),
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].Player, "Ballou Jean-Yves Tabla");
});

test("cada cohorte trae métricas de StatsBomb y de SkillCorner", () => {
  for (const cohort of ["GK", "CB", "FB", "DMF", "B2B", "AM", "CF", "WING", "DWING"]) {
    const metrics = METRICS[cohort];
    assert.ok(metrics.some((metric) => metric.source === "statsbomb"), `${cohort} sin métricas StatsBomb`);
    assert.ok(metrics.some((metric) => metric.source === "skillcorner"), `${cohort} sin métricas SkillCorner`);
  }
});

test("el extremo directo tiene su propio set y se compara contra los extremos", () => {
  const wing = METRICS.WING.map((metric) => metric.label);
  const direct = METRICS.DWING.map((metric) => metric.label);
  assert.notDeepEqual(wing, direct);
  assert.equal(peerCohort("DWING"), "WING");
  assert.equal(peerCohort("WING"), "WING");
  // El extremo directo mide ruptura y velocidad; el asociativo, amplitud y retención.
  assert.ok(direct.includes("Rupturas a la espalda (SC)"));
  assert.ok(direct.includes("Reacción al sprint tras giro (SC)"));
  assert.ok(direct.includes("Centros al área % (SB)"));
  assert.ok(wing.includes("Opciones en banda (SC)"));
  assert.ok(wing.includes("Retención bajo presión % (SC)"));
  assert.ok(!wing.includes("Rupturas a la espalda (SC)"));
});

test("las métricas de SkillCorner son siempre del grupo físico y las inversas están marcadas", () => {
  const platform = [...new Set(Object.values(METRICS).flat())].filter((metric) => metric.source === "skillcorner");
  for (const metric of platform) assert.equal(metric.colorGroup, "physical", `${metric.label} fuera del grupo físico`);
  const inverse = platform.filter((metric) => metric.inverse).map((metric) => metric.label);
  assert.deepEqual(inverse.sort(), ["Dificultad de pase (SC)", "Reacción al sprint tras giro (SC)", "Superado en duelo % (SC)"]);
});
