import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets } from "../lib/scouting.ts";

/**
 * Al juntar dos temporadas del mismo jugador, las tasas se ponderan por
 * minutos —también las de StatsBomb y SkillCorner, aunque su nombre no diga
 * "per 90"— y lo que describe al jugador en un momento sale de la más
 * reciente, no de un promedio que nunca existió.
 */

const H = ["Player", "Team", "Position", "Age", "Birth date", "Market value", "Height", "Minutes played", "Matches played", "Goals", "xG per 90", "Deep progressions (SB)", "Passing % (SB)", "Runs in behind P30 (SC)"];
const ana = (o) => ({ Player: "Ana Uno", Team: "Peñarol", Position: "CF", "Birth date": "2001-02-03", Height: 180, "Matches played": 10, Goals: 1, ...o });
const otros = () => Array.from({ length: 6 }, (_, i) => ({
  Player: `Otro ${i}`, Team: "X", Position: "CF", Age: 22 + i, "Birth date": `199${i}-01-01`, "Market value": 1, Height: 180,
  "Minutes played": 900, "Matches played": 10, Goals: 1, "xG per 90": 0.2, "Deep progressions (SB)": 1, "Passing % (SB)": 70, "Runs in behind P30 (SC)": 1,
}));
const temporada = (anio, propia) => ({ fileName: `StatsBomb · Liga ${anio}`, season: anio, headers: H, rows: [ana(propia), ...otros()], provider: "statsbomb" });
const fila = aggregateDatasets([
  temporada(2025, { Age: 24, "Market value": 200000, Height: 179, "Minutes played": 300, "xG per 90": 1.0, "Deep progressions (SB)": 10, "Passing % (SB)": 50, "Runs in behind P30 (SC)": 10 }),
  temporada(2026, { Age: 25, "Market value": 600000, Height: 181, "Minutes played": 2700, "xG per 90": 0.2, "Deep progressions (SB)": 2, "Passing % (SB)": 80, "Runs in behind P30 (SC)": 2 }),
]).rows.find((f) => f.Player === "Ana Uno");
const ponderado = (x25, x26) => (x25 * 300 + x26 * 2700) / 3000;

test("las tasas de StatsBomb y SkillCorner se ponderan por minutos", () => {
  assert.ok(Math.abs(fila["Deep progressions (SB)"] - ponderado(10, 2)) < 1e-9, `${fila["Deep progressions (SB)"]}: antes salía 6, la media sin ponderar`);
  assert.ok(Math.abs(fila["Runs in behind P30 (SC)"] - ponderado(10, 2)) < 1e-9);
  assert.ok(Math.abs(fila["xG per 90"] - ponderado(1, 0.2)) < 1e-9);
  assert.ok(Math.abs(fila["Passing % (SB)"] - ponderado(50, 80)) < 1e-9);
});

test("valor de mercado y altura salen de la temporada más reciente", () => {
  assert.equal(fila["Market value"], 600000, "antes salía 400000, la media");
  assert.equal(fila.Height, 181);
  assert.equal(fila.Age, 25);
});
