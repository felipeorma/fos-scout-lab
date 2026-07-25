import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHeader, canonicalizeRow } from "../lib/wyscoutHeaders.ts";
import { aggregateDatasets } from "../lib/scouting.ts";

test("traduce cabeceras de Wyscout en español al nombre canónico", () => {
  assert.equal(canonicalHeader("Jugador"), "Player");
  assert.equal(canonicalHeader("Minutos jugados"), "Minutes played");
  assert.equal(canonicalHeader("Duelos defensivos ganados, %"), "Defensive duels won, %");
  assert.equal(canonicalHeader("Interceptaciones/90"), "Interceptions per 90");
});

test("tolera acentos, mayúsculas y espacios sobrantes", () => {
  assert.equal(canonicalHeader("  posicion  ESPECIFICA "), "Position");
});

test("deja intactas las cabeceras que ya vienen en inglés", () => {
  assert.equal(canonicalHeader("Minutes played"), "Minutes played");
  assert.equal(canonicalHeader("Columna propia"), "Columna propia");
});

test("una fila en español queda con claves en inglés", () => {
  const fila = canonicalizeRow({ Jugador: "A. Pérez", "Minutos jugados": 900, Edad: 21 });
  assert.deepEqual(Object.keys(fila).sort(), ["Age", "Minutes played", "Player"]);
  assert.equal(fila["Minutes played"], 900);
});

test("combina una base en español con otra en inglés", () => {
  const es = {
    fileName: "liga-es.xlsx", season: 2026,
    rows: [canonicalizeRow({ Jugador: "A. Pérez", Edad: 21, Equipo: "Club Uno", "Partidos jugados": 10, "Minutos jugados": 900, "Goles/90": 0.4 })],
  };
  const en = {
    fileName: "liga-en.xlsx", season: 2026,
    rows: [{ Player: "B. Smith", Age: 24, Team: "Club Dos", "Matches played": 12, "Minutes played": 1080, "Goals per 90": 0.2 }],
  };
  const result = aggregateDatasets([
    { ...es, headers: Object.keys(es.rows[0]) },
    { ...en, headers: Object.keys(en.rows[0]) },
  ]);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(new Set(result.rows.map((r) => r.Player)), new Set(["A. Pérez", "B. Smith"]));
  // la columna por-90 sobrevive unificada para ambos
  assert.ok(result.headers.includes("Goals per 90"));
});
