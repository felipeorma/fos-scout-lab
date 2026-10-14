import assert from "node:assert/strict";
import test from "node:test";
import { MINIMO_COHORTE_EN_SU_LIGA, buildPlayerReport } from "../lib/scouting.ts";
import { PUNTOS_POR_RATING, indiceANivel, nivelDeLiga, ratingDeTramos } from "../lib/nivelDeLiga.ts";

/**
 * La ficha mide contra los de su puesto en su liga y temporada, y el nivel de
 * la liga se lleva aparte, con la regla calibrada.
 */

const delantero = (nombre, escala) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25,
  "Minutes played": 1500, "Matches played": 18,
  "Goals per 90": escala * 0.05, "xG per 90": escala * 0.05, "Touches in box per 90": escala,
  "Accurate passes, %": 60 + escala, "Successful dribbles, %": 40 + escala,
});

// Liga floja: escalas 1..12. Liga fuerte: escalas 11..22. El mejor de la
// floja (12) está a la altura de los peores de la fuerte.
const floja = Array.from({ length: 12 }, (_, i) => delantero(`F${i}`, i + 1));
const fuerte = Array.from({ length: 12 }, (_, i) => delantero(`S${i}`, i + 11));
const filas = [...floja, ...fuerte];
const claves = [...floja.map(() => ["Floja 2026"]), ...fuerte.map(() => ["Fuerte 2026"])];

test("contra su liga, el mejor de la floja es el mejor; contra todas, no", () => {
  const mejorDeLaFloja = 11;
  const todas = buildPlayerReport(filas, mejorDeLaFloja, 0, "CF");
  const suLiga = buildPlayerReport(filas, mejorDeLaFloja, 0, "CF", null, { porLiga: { clavesPorFila: claves } });
  assert.equal(todas.cohortSize, 24);
  assert.equal(suLiga.cohortSize, 12);
  assert.deepEqual(suLiga.frente, { modo: "liga", claves: ["Floja 2026"], enSuLiga: 12 });
  assert.ok(suLiga.score > todas.score + 20, `${suLiga.score} frente a ${todas.score}`);
  assert.equal(todas.frente, undefined, "sin porLiga no se dice nada");
});

test("con menos pares que el mínimo en su liga se mide contra todas y se dice", () => {
  const pocas = claves.map((c, i) => (i < 3 ? ["Mini 2026"] : c));
  const informe = buildPlayerReport(filas, 0, 0, "CF", null, { porLiga: { clavesPorFila: pocas } });
  assert.equal(informe.frente.modo, "todas");
  assert.equal(informe.frente.enSuLiga, 3);
  assert.equal(informe.cohortSize, 24);
  assert.ok(MINIMO_COHORTE_EN_SU_LIGA >= 10);
});

test("quien jugó en dos ligas se mide contra las dos juntas", () => {
  const conDos = claves.map((c, i) => (i === 0 ? ["Floja 2026", "Fuerte 2026"] : c));
  const informe = buildPlayerReport(filas, 0, 0, "CF", null, { porLiga: { clavesPorFila: conDos } });
  assert.equal(informe.frente.modo, "liga");
  assert.equal(informe.cohortSize, 24);
});

test("el nivel de liga es aditivo, con la regla calibrada y con tope", () => {
  const cpl = nivelDeLiga(null, "Canadian Premier League");
  const mlsnp = nivelDeLiga(null, "MLS Next Pro");
  const mls = nivelDeLiga(null, "MLS");
  assert.equal(cpl.enVivo, false, "sin feed sale de la copia fechada");
  // 60 en la MLS Next Pro (55,97) a nivel CPL (65,29): unos cuatro puntos menos, no catorce.
  assert.equal(indiceANivel(60, mlsnp.rating, cpl.rating), Math.round(60 + PUNTOS_POR_RATING * (55.97 - 65.29)));
  assert.equal(indiceANivel(60, mlsnp.rating, cpl.rating), 56);
  assert.equal(indiceANivel(60, mls.rating, cpl.rating), 66);
  assert.equal(indiceANivel(99, mls.rating, cpl.rating), 100);
  assert.equal(indiceANivel(60, cpl.rating, cpl.rating), 60);
  assert.equal(nivelDeLiga(null, "NCAA D1 Big Ten"), null, "una liga sin rating no tiene nivel");
  // Dos tramos: medio camino, ponderado por minutos. Uno sin rating anula el conjunto.
  assert.equal(ratingDeTramos([{ liga: "MLS", minutos: 900 }, { liga: "Canadian Premier League", minutos: 900 }], null), (79.47 + 65.29) / 2);
  assert.equal(ratingDeTramos([{ liga: "MLS", minutos: 900 }, { liga: "NCAA D1 Big Ten", minutos: 900 }], null), null);
  // Con feed en vivo manda el feed.
  const feed = [{ leagueName: "Canadian Premier League", countryName: "Canada", seasonAverageRating: 66.5, globalRank: 130 }];
  assert.deepEqual(nivelDeLiga(feed, "Canadian Premier League"), { liga: "Canadian Premier League", corto: "CPL", rating: 66.5, puesto: 130, enVivo: true });
});
