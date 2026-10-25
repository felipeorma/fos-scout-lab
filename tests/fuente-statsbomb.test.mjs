import assert from "node:assert/strict";
import test from "node:test";
import { fuenteStatsbomb } from "../lib/snapshot.ts";

/**
 * De qué competición y temporada sale la ficha ampliada. Antes era la primera
 * de la lista —la temporada más vieja— y con el club actual: a quien cambió
 * de equipo no se le encontraba ningún partido.
 */
const fuentes = "StatsBomb · Canadian Premier League 2025, SkillCorner · Canadian Premier League 2025, StatsBomb · USL Championship 2026";

test("sin temporada pedida, la más reciente", () => {
  assert.deepEqual(fuenteStatsbomb(fuentes), { liga: "USL Championship", temporada: "2026" });
});

test("con temporada pedida, esa", () => {
  assert.deepEqual(fuenteStatsbomb(fuentes, "2025"), { liga: "Canadian Premier League", temporada: "2025" });
  assert.deepEqual(fuenteStatsbomb(fuentes, "2019"), { liga: "USL Championship", temporada: "2026" }, "si no la tiene, la más reciente");
});

test("temporadas de año cruzado y sin StatsBomb", () => {
  assert.deepEqual(fuenteStatsbomb("StatsBomb · Eerste Divisie 2025/2026, StatsBomb · Eerste Divisie 2026/2027"), { liga: "Eerste Divisie", temporada: "2026/2027" });
  assert.equal(fuenteStatsbomb("Search results (3)"), null);
});
