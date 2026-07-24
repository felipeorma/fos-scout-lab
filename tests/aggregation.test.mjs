import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets } from "../lib/scouting.ts";

function dataset(index, row) {
  return {
    fileName: `liga-${2020 + index}.xlsx`,
    season: 2020 + index,
    headers: Object.keys(row),
    rows: [row],
  };
}

test("combina más de tres archivos sin repetir la misma identidad", () => {
  const datasets = Array.from({ length: 5 }, (_, index) => dataset(index, {
    Player: index % 2 ? "alex   perez" : "Álex Pérez",
    Age: index % 2 ? "22" : 22,
    Team: index % 2 ? "club norte" : "Club Norte",
    Position: "RWF",
    "Matches played": 2,
    "Minutes played": 180,
    "Goals per 90": 0.5,
  }));

  const result = aggregateDatasets(datasets);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["Matches played"], 10);
  assert.equal(result.rows[0]["Minutes played"], 900);
  assert.match(String(result.rows[0]["Data sources"]), /liga-2020/);
  assert.match(String(result.rows[0]["Data sources"]), /liga-2024/);
});

test("separa homónimos cuando cambia la edad o el club", () => {
  const result = aggregateDatasets([
    dataset(0, { Player: "Alex Pérez", Age: 22, Team: "Club Norte", "Matches played": 2, "Minutes played": 180 }),
    dataset(1, { Player: "Alex Pérez", Age: 24, Team: "Club Sur", "Matches played": 3, "Minutes played": 270 }),
  ]);

  assert.equal(result.rows.length, 2);
  assert.deepEqual(new Set(result.rows.map((row) => row.Team)), new Set(["Club Norte", "Club Sur"]));
});

test("resuelve el club por fila cuando las bases usan columnas de equipo distintas", () => {
  const result = aggregateDatasets([
    dataset(0, { Player: "Jugador Uno", Age: 22, "Team within selected timeframe": "Cavalry FC", "Matches played": 10, "Minutes played": 900 }),
    dataset(1, { Player: "S. Dewaele", Age: 27, Team: "SK Beveren", "Matches played": 43, "Minutes played": 3959 }),
  ]);

  assert.equal(result.rows.length, 2);
  assert.deepEqual(new Set(result.rows.map((row) => row.Team)), new Set(["Cavalry FC", "SK Beveren"]));
});

test("conserva columnas específicas de rol aunque pocas filas tengan datos", () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({
    Player: `Jugador ${index + 1}`,
    Age: 20 + index,
    Team: "Club Test",
    "Matches played": 10,
    "Minutes played": 900,
    "Passes per 90": 40,
  }));
  rows.push({ Player: "Portero Uno", Age: 30, Team: "Club Test", "Matches played": 10, "Minutes played": 900, "Passes per 90": 25, "Save rate, %": 71.4, "Exits per 90": 1.2 });
  const result = aggregateDatasets([{ fileName: "liga-2026.xlsx", season: 2026, headers: Object.keys(rows.at(-1)), rows }]);
  assert.ok(result.headers.includes("Save rate, %"));
  assert.ok(result.headers.includes("Exits per 90"));
  const keeper = result.rows.find((row) => row.Player === "Portero Uno");
  assert.equal(keeper["Save rate, %"], 71.4);
});
