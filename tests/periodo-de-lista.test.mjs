import assert from "node:assert/strict";
import test from "node:test";
import { opcionesDePeriodo } from "../lib/periodoDeLista.ts";

/**
 * Las temporadas que ofrecen las listas (Ranking, Pizarra).
 *
 * Antes la lista juntaba en silencio todas las temporadas cargadas de cada
 * jugador; ahora se elige una, o una media dicha. Aquí: qué opciones salen,
 * cómo se llaman y cuál va por defecto.
 */

const base = (fileName, season, provider = "statsbomb") => ({ fileName, season, headers: [], rows: [], provider });

test("una por temporada, la media de todas y, con tres o más, la de las dos últimas", () => {
  const { opciones, anios } = opcionesDePeriodo([
    base("StatsBomb · Canadian Premier League 2026", 2026),
    base("StatsBomb · Canadian Premier League 2025", 2025),
    base("StatsBomb · Eerste Divisie 2026/2027", 2027),
  ]);
  assert.deepEqual(anios, [2027, 2026, 2025]);
  assert.deepEqual(opciones.map((o) => o.clave), ["2027", "2026", "2025", "media-2", "media"]);
  assert.deepEqual(opciones.find((o) => o.clave === "media").periodo, { modo: "media", anios: [2027, 2026, 2025] });
  assert.deepEqual(opciones.find((o) => o.clave === "media-2").periodo, { modo: "media", anios: [2027, 2026] });
});

test("una 2025/2026 y una 2026 son la misma temporada, y el texto dice las dos", () => {
  const { opciones } = opcionesDePeriodo([
    base("StatsBomb · Canadian Premier League 2026", 2026),
    base("StatsBomb · Eerste Divisie 2025/2026", 2026),
  ]);
  assert.equal(opciones.length, 1);
  assert.match(opciones[0].texto, /2025\/26/);
  assert.match(opciones[0].texto, /2026/);
});

test("por defecto, la temporada con más competiciones; SkillCorner no cuenta", () => {
  const { porDefecto } = opcionesDePeriodo([
    base("StatsBomb · A-League 2026/2027", 2027),
    base("SkillCorner · A-League 2026/2027", 2027, "skillcorner"),
    base("SkillCorner · Ligue 3 2026/2027", 2027, "skillcorner"),
    base("StatsBomb · Canadian Premier League 2026", 2026),
    base("StatsBomb · MLS Next Pro 2026", 2026),
  ]);
  assert.equal(porDefecto, "2026");
});

test("sin temporada en el archivo, no se ofrece", () => {
  const { opciones, porDefecto } = opcionesDePeriodo([base("Wyscout export.xlsx", 0, "wyscout")]);
  assert.deepEqual(opciones, []);
  assert.equal(porDefecto, "");
});
