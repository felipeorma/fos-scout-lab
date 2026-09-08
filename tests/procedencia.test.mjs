import assert from "node:assert/strict";
import test from "node:test";
import { ligaYAnioDe, ligasDeBases, origenPorFila } from "../lib/procedencia.ts";

const base = (fileName) => ({ fileName, season: 2026, headers: [], rows: [] });

test("separa proveedor, liga y año de arranque", () => {
  assert.deepEqual(ligaYAnioDe("StatsBomb · Canadian Premier League 2026"), { liga: "Canadian Premier League", anio: 2026 });
  assert.deepEqual(ligaYAnioDe("SkillCorner · Eerste Divisie 2025/2026"), { liga: "Eerste Divisie", anio: 2025 });
  assert.deepEqual(ligaYAnioDe("StatsBomb · NCAA D1 Big Ten 2025"), { liga: "NCAA D1 Big Ten", anio: 2025 });
});

test("un Excel de Wyscout conserva su nombre", () => {
  const { liga } = ligaYAnioDe("Maldonado enero.xlsx");
  assert.equal(liga, "Maldonado enero.xlsx", "sin temporada al final no hay nada que recortar");
});

test("la capa de SkillCorner no cuenta como otra liga", () => {
  const ligas = ligasDeBases([
    base("StatsBomb · Canadian Premier League 2026"),
    base("SkillCorner · Canadian Premier League 2026"),
  ]);
  assert.equal(ligas.length, 1);
  assert.deepEqual(ligas[0].archivos.length, 2, "las dos bases apuntan a la misma liga");
});

test("la misma liga en dos años son dos entradas", () => {
  const ligas = ligasDeBases([
    base("StatsBomb · Eerste Divisie 2025/2026"),
    base("StatsBomb · Eerste Divisie 2026/2027"),
  ]);
  assert.deepEqual(ligas.map((l) => l.anio), [2025, 2026]);
});

test("quien jugó en dos ligas del año sale con las dos", () => {
  const procedencias = ligasDeBases([
    base("StatsBomb · MLS 2026"),
    base("StatsBomb · MLS Next Pro 2026"),
  ]);
  const [uno, dos] = origenPorFila([
    { Player: "Sube del filial", "Data sources": "StatsBomb · MLS 2026, StatsBomb · MLS Next Pro 2026" },
    { Player: "Solo filial", "Data sources": "StatsBomb · MLS Next Pro 2026" },
  ], procedencias);
  assert.deepEqual(uno.ligas.sort(), ["MLS", "MLS Next Pro"]);
  assert.deepEqual(dos.ligas, ["MLS Next Pro"]);
});

test("una liga con coma en el nombre no se parte", () => {
  const procedencias = ligasDeBases([base("StatsBomb · Liga Pro, Serie A 2026")]);
  assert.equal(procedencias[0].liga, "Liga Pro, Serie A");
  const [fila] = origenPorFila([{ "Data sources": "StatsBomb · Liga Pro, Serie A 2026" }], procedencias);
  assert.deepEqual(fila.ligas, ["Liga Pro, Serie A"]);
});

test("la clave de medición separa temporadas de la misma liga", () => {
  // El caso que lo motiva: comparar a un jugador con su versión del año
  // pasado. Si la clave fuera solo la liga, los dos caerían en el mismo grupo
  // y se medirían contra la mezcla de ambas temporadas.
  const procedencias = ligasDeBases([
    base("StatsBomb · Eerste Divisie 2025/2026"),
    base("StatsBomb · Eerste Divisie 2026/2027"),
  ]);
  const [viejo, nuevo] = origenPorFila([
    { "Data sources": "StatsBomb · Eerste Divisie 2025/2026" },
    { "Data sources": "StatsBomb · Eerste Divisie 2026/2027" },
  ], procedencias);
  assert.deepEqual(viejo.ligas, nuevo.ligas, "la liga es la misma, y para filtrar eso está bien");
  assert.notDeepEqual(viejo.claves, nuevo.claves, "pero para medir tienen que ser grupos distintos");
  assert.deepEqual(viejo.claves, ["Eerste Divisie 2025"]);
  assert.deepEqual(nuevo.claves, ["Eerste Divisie 2026"]);
});

test("sin año, la clave es la liga a secas", () => {
  const procedencias = ligasDeBases([base("Maldonado enero.xlsx")]);
  const [fila] = origenPorFila([{ "Data sources": "Maldonado enero.xlsx" }], procedencias);
  assert.deepEqual(fila.claves, ["Maldonado enero.xlsx"]);
});
