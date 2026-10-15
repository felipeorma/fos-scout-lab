import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerReport, marcoDeSuLiga, MINIMO_COHORTE_EN_SU_LIGA } from "../lib/scouting.ts";
import { COMPUESTAS, familiasCompuestas } from "../lib/snapshot.ts";
import { marcoConNivel } from "../lib/nivelDeLiga.ts";
import { rankingDeEquipos } from "../lib/equipos.ts";

/**
 * El marco "su liga" de Contexto, la Ficha ampliada y Entre ligas: las mismas
 * filas y la misma regla del mínimo que la ficha, para que una página no diga
 * un percentil y la de al lado otro.
 */

const fila = (nombre, liga, k, posicion = "RDMF") => {
  const datos = { Player: nombre, Team: `${liga} FC`, Position: posicion, Age: 25, "Minutes played": 1500, "Matches played": 18, "Data sources": `StatsBomb · ${liga} 2026`, "Interceptions per 90": k };
  for (const familia of COMPUESTAS) for (const columna of familia.columnas) datos[columna] = k;
  return datos;
};

// Doce pivotes en la CPL, flojos (1..12); doce en una liga fuerte (101..112); y una liga con cuatro.
const filas = [
  ...Array.from({ length: 12 }, (_, i) => fila(`CPL ${i}`, "Canadian Premier League", i + 1)),
  ...Array.from({ length: 12 }, (_, i) => fila(`MLS ${i}`, "Major League Soccer", 101 + i)),
  ...Array.from({ length: 4 }, (_, i) => fila(`Chica ${i}`, "Liga Chica", 50 + i)),
  fila("Extremo CPL", "Canadian Premier League", 5, "RW"),
];
const claves = filas.map((f) => [String(f["Data sources"]).replace("StatsBomb · ", "")]);

test("su liga: las filas de su liga y temporada, de cualquier puesto, y cuántos de su puesto", () => {
  const marco = marcoDeSuLiga(filas, claves, 11, "DMF", 900);
  assert.equal(marco.modo, "liga");
  assert.deepEqual(marco.claves, ["Canadian Premier League 2026"]);
  assert.equal(marco.enSuLiga, 12);
  assert.equal(marco.filas.size, 13, "el extremo de la CPL también es de su liga");
  assert.ok(!marco.filas.has(12), "nadie de la MLS");
});

test("con menos del mínimo de su puesto en su liga, el modo es 'todas' y se dice cuántos había", () => {
  assert.ok(4 < MINIMO_COHORTE_EN_SU_LIGA);
  const marco = marcoDeSuLiga(filas, claves, 24, "DMF", 900);
  assert.equal(marco.modo, "todas");
  assert.equal(marco.enSuLiga, 4);
});

test("sin varias competiciones, o sin claves, no hay marco que elegir", () => {
  const unaSola = filas.slice(0, 12);
  assert.equal(marcoDeSuLiga(unaSola, claves.slice(0, 12), 0, "DMF", 900), null);
  assert.equal(marcoDeSuLiga(filas, null, 0, "DMF", 900), null);
  assert.equal(marcoDeSuLiga(filas, filas.map(() => []), 0, "DMF", 900), null);
});

test("las familias de la Ficha ampliada, dentro de su liga, dan lo mismo que con su liga sola", () => {
  const marco = marcoDeSuLiga(filas, claves, 11, "DMF", 900);
  const acotado = familiasCompuestas(filas, "DMF", 900, 11, (i) => marco.filas.has(i));
  const solaSuLiga = familiasCompuestas(filas.slice(0, 12), "DMF", 900, 11);
  assert.equal(acotado.indices.length, 12);
  const id = COMPUESTAS[0].id;
  assert.equal(acotado.valores.get(11)[id].percentil, solaSuLiga.valores.get(11)[id].percentil);
  // Contra todas, el mejor de la CPL se hunde por debajo de la MLS.
  const contraTodas = familiasCompuestas(filas, "DMF", 900, 11);
  assert.ok(contraTodas.valores.get(11)[id].percentil < acotado.valores.get(11)[id].percentil);
});

test("Contexto con su liga mide igual que la ficha con porLiga", () => {
  const marco = marcoDeSuLiga(filas, claves, 11, "DMF", 900);
  const suLiga = filas.filter((_, i) => marco.filas.has(i));
  const enContexto = buildPlayerReport(suLiga, suLiga.indexOf(filas[11]), 900, "DMF");
  const enLaFicha = buildPlayerReport(filas, 11, 900, "DMF", null, { porLiga: { clavesPorFila: claves } });
  assert.equal(enLaFicha.frente.modo, "liga");
  assert.deepEqual(enContexto.metrics.map((m) => [m.key, m.percentile]), enLaFicha.metrics.map((m) => [m.key, m.percentile]));
});

test("el nivel va al lado de la liga, y una liga sin nivel va sin él", () => {
  const conFeed = marcoConNivel(["Canadian Premier League 2026"], [{ leagueName: "Canadian Premier League", countryName: "Canada", seasonAverageRating: 56.04 }]);
  assert.match(conFeed, /^CPL 2026 · Opta 56[,.]0$/);
  assert.equal(marcoConNivel(["Liga Chica 2026"], null), "Liga Chica 2026");
  assert.match(marcoConNivel(["Canadian Premier League 2026", "Liga Chica 2026"], null), / \+ Liga Chica 2026$/);
});

test("sin feed, el nivel sale de la copia fechada", () => {
  assert.match(marcoConNivel(["Canadian Premier League 2026"], null), /^CPL 2026 · Opta 65[,.]3$/);
});

test("el puesto del equipo solo cuenta clubes con plantilla en la base", () => {
  const filas = [
    ...Array.from({ length: 6 }, (_, i) => ({ Team: "A", m: 10 + i })),
    ...Array.from({ length: 6 }, (_, i) => ({ Team: "B", m: 20 + i })),
    { Team: "Se fue a C", m: 99 },
  ];
  // C tiene un solo jugador: no es una plantilla y no cuenta.
  assert.deepEqual(rankingDeEquipos(filas, "m", "A"), { rank: 2, total: 2, valor: 12.5 });
  // El club del propio jugador cuenta siempre, aunque tenga pocos.
  assert.deepEqual(rankingDeEquipos(filas, "m", "Se fue a C"), { rank: 1, total: 3, valor: 99 });
  // Solo con el suyo no hay puesto que dar.
  assert.equal(rankingDeEquipos(filas.slice(0, 6).concat({ Team: "Z", m: 1 }), "m", "A"), null);
});
