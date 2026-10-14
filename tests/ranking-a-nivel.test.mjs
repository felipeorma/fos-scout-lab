import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, headersOf } from "../lib/scouting.ts";
import { ligasDeBases, origenPorFila } from "../lib/procedencia.ts";
import { rankingDeCohorte } from "../lib/ranking.ts";
import { PUNTOS_POR_RATING_INDICE, indiceANivel } from "../lib/nivelDeLiga.ts";

/**
 * Con varias ligas cargadas, el ranking mide a cada uno en su liga y ordena
 * por ese índice llevado a la CPL con el nivel de Opta.
 */

const delantero = (nombre, equipo, escala) => ({
  Player: nombre, Team: equipo, Position: "CF", Age: 24, "Birth date": `2002-01-${String(escala).padStart(2, "0")}`,
  "Minutes played": 1500, "Matches played": 18,
  "Goals per 90": escala * 0.05, "xG per 90": escala * 0.05, "Touches in box per 90": escala,
  "Accurate passes, %": 60 + escala, "Successful dribbles, %": 40 + escala, "xA per 90": escala * 0.02,
});
// Las dos ligas tienen exactamente la misma distribución: el mejor de cada una
// tiene el mismo índice dentro de su liga.
const liga = (nombre, prefijo) => {
  const rows = Array.from({ length: 12 }, (_, i) => delantero(`${prefijo} ${i}`, `${prefijo} FC ${i % 4}`, i + 1));
  return { fileName: `StatsBomb · ${nombre} 2026`, season: 2026, headers: headersOf(rows), rows, provider: "statsbomb" };
};
const bases = [liga("MLS", "Mls"), liga("MLS Next Pro", "Np")];
const { rows } = aggregateDatasets(bases);
const clavesPorFila = origenPorFila(rows, ligasDeBases(bases)).map((origen) => origen.claves);
const nivel = { feed: null, referencia: "Canadian Premier League" };

test("a igual índice dentro de su liga, la liga más fuerte ordena antes", () => {
  const lista = rankingDeCohorte(rows, "CF", 0, { porLiga: { clavesPorFila }, nivel });
  const mejorMls = lista.find((fila) => fila.jugador === "Mls 11");
  const mejorNp = lista.find((fila) => fila.jugador === "Np 11");
  assert.equal(mejorMls.puntuacionCruda, mejorNp.puntuacionCruda, "dentro de su liga son iguales");
  assert.equal(mejorMls.aNivel, indiceANivel(mejorMls.puntuacionCruda, 79.47, 65.29, PUNTOS_POR_RATING_INDICE));
  assert.equal(mejorNp.aNivel, indiceANivel(mejorNp.puntuacionCruda, 55.97, 65.29, PUNTOS_POR_RATING_INDICE));
  assert.ok(lista.indexOf(mejorMls) < lista.indexOf(mejorNp));
  assert.ok(mejorMls.aNivel - mejorNp.aNivel >= 7, `${mejorMls.aNivel} frente a ${mejorNp.aNivel}`);
});

test("sin porLiga se ordena como siempre, sin nivel", () => {
  const lista = rankingDeCohorte(rows, "CF", 0);
  assert.ok(lista.every((fila) => fila.aNivel === null));
  // Mezcladas, las dos ligas iguales empatan arriba: el nivel no entra.
  assert.equal(lista[0].puntuacionCruda, lista[1].puntuacionCruda);
});

test("una liga sin rating de Opta no se lleva a nivel", () => {
  const conNcaa = [liga("MLS", "Mls"), liga("NCAA D1 Big Ten", "Uni")];
  const { rows: filas } = aggregateDatasets(conNcaa);
  const claves = origenPorFila(filas, ligasDeBases(conNcaa)).map((origen) => origen.claves);
  const lista = rankingDeCohorte(filas, "CF", 0, { porLiga: { clavesPorFila: claves }, nivel });
  assert.ok(lista.filter((fila) => fila.jugador.startsWith("Uni")).every((fila) => fila.aNivel === null));
  assert.ok(lista.filter((fila) => fila.jugador.startsWith("Mls")).every((fila) => fila.aNivel !== null));
});
