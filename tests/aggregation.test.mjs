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

test("numeric interpreta separadores de miles y decimales correctamente", async () => {
  const { numeric } = await import("../lib/scouting.ts");
  assert.equal(numeric("2,340"), 2340);
  assert.equal(numeric("2.340"), 2340);
  assert.equal(numeric("1,234,567"), 1234567);
  assert.equal(numeric("0,85"), 0.85);
  assert.equal(numeric("1.234,5"), 1234.5);
  assert.equal(numeric("45.5"), 45.5);
});

test("extractSeason prefiere el año de 4 dígitos aunque haya otros números", async () => {
  const { extractSeason } = await import("../lib/scouting.ts");
  assert.equal(extractSeason("U23 2026.xlsx"), 2026);
  assert.equal(extractSeason("export-08-2026.xlsx"), 2026);
  assert.equal(extractSeason("liga-24.xlsx"), 2024);
  assert.equal(extractSeason("canadians.xlsx"), 0);
});

test("fusiona al mismo jugador entre temporadas aunque cumpla años y cambie de club", () => {
  const headers = ["Player", "Team", "Age", "Matches played", "Minutes played", "Goals"];
  const result = aggregateDatasets([
    { fileName: "CPL 2024.xlsx", season: 2024, headers, rows: [{ Player: "Ali Musse", Team: "Cavalry FC", Age: 27, "Matches played": 25, "Minutes played": 2000, Goals: 10 }] },
    { fileName: "CPL 2025.xlsx", season: 2025, headers, rows: [{ Player: "Ali Musse", Team: "Forge FC", Age: 28, "Matches played": 12, "Minutes played": 1000, Goals: 2 }] },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]["Minutes played"], 3000);
  assert.equal(result.rows[0].Goals, 12);
});

test("homónimos dentro del mismo archivo no se fusionan", () => {
  const headers = ["Player", "Team", "Age", "Matches played", "Minutes played"];
  const result = aggregateDatasets([
    { fileName: "liga 2025.xlsx", season: 2025, headers, rows: [
      { Player: "S. Dewaele", Team: "Club A", Age: 22, "Matches played": 5, "Minutes played": 450 },
      { Player: "S. Dewaele", Team: "Club B", Age: 27, "Matches played": 8, "Minutes played": 700 },
    ] },
  ]);
  assert.equal(result.rows.length, 2);
});

test("archivo sin año en el nombre cuenta como el más reciente", () => {
  const headers = ["Player", "Team", "Age", "Matches played", "Minutes played", "Contract expires"];
  const result = aggregateDatasets([
    { fileName: "CPL 2019.xlsx", season: 2019, headers, rows: [{ Player: "Test Uno", Team: "Old Club", Age: 24, "Matches played": 10, "Minutes played": 900, "Contract expires": "2020-12-31" }] },
    { fileName: "canadians.xlsx", season: 0, headers, rows: [{ Player: "Test Uno", Team: "Cavalry FC", Age: 25, "Matches played": 10, "Minutes played": 900, "Contract expires": "2027-12-31" }] },
  ]);
  assert.equal(result.rows[0].Team, "Cavalry FC");
  assert.equal(result.rows[0]["Contract expires"], "2027-12-31");
});
