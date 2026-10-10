import assert from "node:assert/strict";
import test from "node:test";
import { temporadasUtiles } from "../lib/temporadas.ts";

/**
 * Qué temporada de cada competición entra en la base.
 *
 * El bug que motiva estas pruebas: elegir por el año del calendario metía la
 * NCAA D1 Big Ten 2026 —que figura en el catálogo desde septiembre pero aún no
 * tiene un partido publicado— y la liga entraba con cero jugadores sin decir
 * nada. Quien la cargaba creía tener fútbol universitario y no tenía nada,
 * justo la competición donde están los canadienses de 18 a 23 años.
 */

const anio = new Date().getFullYear();
const pasado = String(anio - 1);
const enCurso = String(anio);

const liga = (name, season, hasMatches) => ({ competition_id: 1, season_id: 1, name, season, country: "USA", hasMatches });

test("elige la temporada en curso cuando ya tiene partidos", () => {
  const { elegidas, rezagadas } = temporadasUtiles([
    liga("MLS", pasado, true),
    liga("MLS", enCurso, true),
  ]);
  assert.deepEqual(elegidas.map((c) => c.season), [enCurso]);
  assert.deepEqual(rezagadas, []);
});

test("cae a la temporada anterior cuando la de este año no ha empezado", () => {
  const { elegidas, rezagadas } = temporadasUtiles([
    liga("NCAA D1 Big Ten", pasado, true),
    liga("NCAA D1 Big Ten", enCurso, false),
  ]);
  assert.deepEqual(elegidas.map((c) => c.season), [pasado]);
  assert.deepEqual(rezagadas.map((c) => c.season), [pasado], "la caída se informa para poder avisarlo");
});

test("nunca devuelve una temporada sin partidos", () => {
  const { elegidas } = temporadasUtiles([
    liga("USL League One", String(anio + 1), false),
  ]);
  assert.deepEqual(elegidas, [], "una competición cuyo único curso está sin jugar no entra");
});

test("conserva las dos temporadas de una liga de año cruzado", () => {
  // En septiembre la 2025/2026 acaba de cerrar y la 2026/2027 lleva tres
  // jornadas: las dos llevan el año en curso y las dos dicen algo.
  const { elegidas } = temporadasUtiles([
    liga("Eerste Divisie", `${anio - 1}/${anio}`, true),
    liga("Eerste Divisie", `${anio}/${anio + 1}`, true),
    liga("Eerste Divisie", `${anio + 1}/${anio + 2}`, false),
  ]);
  assert.deepEqual(elegidas.map((c) => c.season).sort(), [`${anio - 1}/${anio}`, `${anio}/${anio + 1}`]);
});

test("sin el campo del proveedor se asume que la temporada sirve", () => {
  // SkillCorner no informa disponibilidad de partidos; su comportamiento no
  // debe cambiar por una comprobación que solo StatsBomb puede responder.
  const { elegidas } = temporadasUtiles([
    { id: 7, name: "Canadian Premier League", season: enCurso },
  ]);
  assert.equal(elegidas.length, 1);
});

test("no mezcla dos competiciones que comparten nombre en países distintos", () => {
  const { elegidas } = temporadasUtiles([
    { ...liga("Premier Division", enCurso, true), country: "Republic of Ireland" },
    { ...liga("Premier Division", pasado, true), country: "Scotland" },
  ]);
  const porPais = elegidas.map((c) => `${c.country} ${c.season}`).sort();
  assert.deepEqual(porPais, ["Republic of Ireland " + enCurso, "Scotland " + pasado]);
});

test("dos temporadas: la que sirve hoy y la anterior con partidos", async () => {
  const { dosTemporadas } = await import("../lib/temporadas.ts");
  const anterior = String(anio - 2);
  const { elegidas } = dosTemporadas([
    liga("CPL", anterior, true),
    liga("CPL", pasado, true),
    liga("CPL", enCurso, true),
    liga("NCAA", String(anio - 2), true),
    liga("NCAA", pasado, true),
    liga("NCAA", enCurso, false),
    liga("Solo una", enCurso, true),
  ]);
  const de = (nombre) => elegidas.filter((c) => c.name === nombre).map((c) => c.season).sort();
  assert.deepEqual(de("CPL"), [pasado, enCurso]);
  assert.deepEqual(de("NCAA"), [anterior, pasado], "si la de este año no empezó, las dos últimas con partidos");
  assert.deepEqual(de("Solo una"), [enCurso], "sin temporada anterior, la que hay");
});

test("dos temporadas: una liga de año cruzado que ya entra con dos no suma una tercera", async () => {
  const { dosTemporadas } = await import("../lib/temporadas.ts");
  const cruzada = (inicio) => liga("Eerste Divisie", `${inicio}/${inicio + 1}`, true);
  const { elegidas } = dosTemporadas([cruzada(anio - 2), cruzada(anio - 1), cruzada(anio)]);
  assert.deepEqual(elegidas.map((c) => c.season).sort(), [`${anio - 1}/${anio}`, `${anio}/${anio + 1}`]);
});

test("cargar un año trae las temporadas que arrancan ese año, no la en curso", async () => {
  const { temporadasDelAnio } = await import("../lib/temporadas.ts");
  const elegidas = temporadasDelAnio([
    liga("CPL", pasado, true),
    liga("CPL", enCurso, true),
    liga("Eerste Divisie", `${pasado}/${anio}`, true),
    liga("Eerste Divisie", `${anio - 2}/${pasado}`, true),
    liga("NCAA", pasado, false),
  ], pasado);
  assert.deepEqual(elegidas.map((c) => `${c.name} ${c.season}`), [`CPL ${pasado}`, `Eerste Divisie ${pasado}/${anio}`]);
});

test("la temporada anterior de una competición concreta", async () => {
  const { temporadaAnterior } = await import("../lib/temporadas.ts");
  const lista = [liga("CPL", String(anio - 2), true), liga("CPL", pasado, false), liga("CPL", enCurso, true), liga("MLS", pasado, true)];
  assert.equal(temporadaAnterior(lista, lista[2])?.season, String(anio - 2), "salta la que no tiene partidos");
  assert.equal(temporadaAnterior(lista, lista[0]), undefined);
});
