import assert from "node:assert/strict";
import test from "node:test";
import { aplicarNombre, conNombresGuardados, firmaDeBase, identidadDeBase, nombreActual, temporadaAnteriorDe, temporadaValida } from "../lib/nombresDeBase.ts";
import { ligaYAnioDe } from "../lib/procedencia.ts";
import { aggregateDatasets, temporadasDeFila } from "../lib/scouting.ts";

/**
 * Liga y temporada escritas a mano para las bases de Wyscout.
 */

const HEADERS = ["Player", "Team", "Age", "Birth date", "Minutes played", "Matches played", "Goals", "Assists"];
const fila = (Player, Team, extra = {}) => ({ Player, Team, Age: 24, "Birth date": "2001-02-03", "Minutes played": 900, "Matches played": 10, Goals: 2, Assists: 1, ...extra });
const base = (fileName, rows) => ({ fileName, season: 0, headers: HEADERS, rows });

test("nombrar una base reescribe de dónde dice la app que viene: liga, temporada y año", () => {
  const original = base("Search results (3).xlsx", [fila("Ana Uno", "Peñarol")]);
  assert.deepEqual(nombreActual(original), { liga: "Search results (3)", temporada: "" });
  const nombrada = aplicarNombre(original, { liga: " Primera División ", temporada: "2025/2026" });
  assert.equal(nombrada.fileName, "Primera División 2025/2026");
  assert.equal(nombrada.season, 2026);
  assert.equal(nombrada.nombreOriginal, "Search results (3).xlsx");
  assert.deepEqual({ liga: ligaYAnioDe(nombrada.fileName).liga, temporada: ligaYAnioDe(nombrada.fileName).temporada }, { liga: "Primera División", temporada: "2025/2026" });
  assert.equal(identidadDeBase(aplicarNombre(nombrada, { liga: "Otra", temporada: "2026" })), identidadDeBase(original), "renombrar dos veces conserva la identidad");
  assert.ok(identidadDeBase(original).startsWith("Search results (3).xlsx#"), "nombre original y contenido");
  assert.equal(aplicarNombre(original, { liga: "  ", temporada: "2026" }), original, "sin liga no se toca");
});

test("la temporada se acepta como 2026, 2025/2026 o 2025/26", () => {
  for (const bien of ["", "2026", "2025/2026", "2025/26", "2025 / 2026"]) assert.equal(temporadaValida(bien), true, bien);
  for (const mal of ["26", "Apertura", "2026-27x"]) assert.equal(temporadaValida(mal), false, mal);
});

test("con año, dos Excel que se fundían en una temporada sin fecha pasan a ser dos temporadas", () => {
  const a = base("Search results.xlsx", [fila("Ana Uno", "Peñarol", { "Minutes played": 1200 })]);
  const b = base("Search results (1).xlsx", [fila("Ana Uno", "Peñarol", { "Minutes played": 800 })]);
  const antes = aggregateDatasets([a, b]);
  assert.equal(temporadasDeFila(antes.rows[0]).length, 1, "sin año: una sola temporada");
  const despues = aggregateDatasets([
    aplicarNombre(a, { liga: "Primera División", temporada: "2026" }),
    aplicarNombre(b, { liga: "Primera División", temporada: "2025" }),
  ]);
  const temporadas = temporadasDeFila(despues.rows[0]);
  assert.deepEqual(temporadas.map((x) => x.etiqueta), ["2026", "2025"]);
  assert.deepEqual(temporadas.map((x) => x.ligas), [["Primera División"], ["Primera División"]]);
});

test("al volver a subir el mismo Excel, vuelve con su nombre; otro Excel con el mismo nombre de archivo, no", () => {
  const uruguay = base("Search results.xlsx", [fila("Ana Uno", "Peñarol"), fila("Bea Dos", "Nacional")]);
  const otraLiga = base("Search results.xlsx", [fila("Cid Tres", "Boca Juniors")]);
  const guardados = { [firmaDeBase(uruguay)]: { liga: "Primera División", temporada: "2026" } };
  const reordenado = base("Search results.xlsx", [fila("Bea Dos", "Nacional"), fila("Ana Uno", "Peñarol")]);
  const [mismo, otro] = conNombresGuardados([reordenado, otraLiga], guardados);
  assert.equal(mismo.fileName, "Primera División 2026", "mismos clubes, en otro orden");
  assert.equal(otro.fileName, "Search results.xlsx");
});

test("dos temporadas de la misma liga, con los mismos clubes, tienen firmas distintas", () => {
  const t2026 = base("Search results.xlsx", [fila("Ana Uno", "Peñarol", { "Minutes played": 1500 }), fila("Bea Dos", "Nacional", { "Minutes played": 700 })]);
  const t2025 = base("Search results (1).xlsx", [fila("Ana Uno", "Peñarol", { "Minutes played": 1100 }), fila("Bea Dos", "Nacional", { "Minutes played": 900 })]);
  assert.notEqual(firmaDeBase(t2026), firmaDeBase(t2025));
  const guardados = { [firmaDeBase(t2026)]: { liga: "Primera División", temporada: "2026" }, [firmaDeBase(t2025)]: { liga: "Primera División", temporada: "2025" } };
  const [a, b] = conNombresGuardados([t2025, t2026], guardados);
  assert.equal(a.fileName, "Primera División 2025");
  assert.equal(b.fileName, "Primera División 2026");
});

test("dos Excel distintos con el mismo nombre de archivo son dos bases; dos copias del mismo, una", () => {
  const a = base("Search results.xlsx", [fila("Ana Uno", "Peñarol")]);
  const b = base("Search results.xlsx", [fila("Ana Uno", "Peñarol", { "Minutes played": 1200 })]);
  assert.notEqual(identidadDeBase(a), identidadDeBase(b), "otra temporada con el mismo nombre no pisa a la primera");
  assert.equal(identidadDeBase(a), identidadDeBase(base("Search results.xlsx", [fila("Ana Uno", "Peñarol")])));
  // Las de la API son su competición: una recarga sustituye a la anterior.
  const api = (filas) => ({ ...base("StatsBomb · Liga 2026", filas), provider: "statsbomb" });
  assert.equal(identidadDeBase(api([fila("Ana Uno", "Peñarol")])), identidadDeBase(api([fila("Ana Uno", "Peñarol", { "Minutes played": 1300 })])));
});

test("la temporada anterior a una escrita a mano, en su mismo formato", () => {
  assert.equal(temporadaAnteriorDe("2026"), "2025");
  assert.equal(temporadaAnteriorDe("2025/2026"), "2024/2025");
  assert.equal(temporadaAnteriorDe("2025/26"), "2024/25");
  assert.equal(temporadaAnteriorDe("2000/01"), "1999/00");
  assert.equal(temporadaAnteriorDe(""), "");
  assert.equal(temporadaAnteriorDe("Apertura"), "");
});
