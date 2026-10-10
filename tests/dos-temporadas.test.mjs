import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport, temporadasDeFila } from "../lib/scouting.ts";

/**
 * Dos temporadas en la ficha.
 *
 * Al cruzar la temporada en curso con la anterior, la fila del jugador las
 * junta —el radar las cuenta a las dos, ponderadas por minutos— y además
 * guarda cuánto jugó en cada una, para que la ficha pueda enseñarlo debajo.
 * Lo que se fija aquí: que cada temporada sume lo suyo sin contar doble, que
 * se ordenen de la más reciente a la más antigua y que funcione igual con
 * archivos de Wyscout que con la API.
 */

const base = (fileName, season, filas, provider) => ({ fileName, season, headers: Object.keys(filas[0]), rows: filas, provider });
const jugador = (campos) => ({ Player: "Sean Young", Age: 25, "Birth date": "2001-04-20", Position: "DMF", "Passes per 90": 40, ...campos });
const filaDe = (resultado, nombre = "Sean Young") => resultado.rows.find((fila) => fila.Player === nombre);

test("la fila junta las dos temporadas y guarda lo que jugó en cada una", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2025", 2025, [jugador({ Age: 24, Team: "HFX Wanderers", "Matches played": 28, "Minutes played": 2310, Goals: 1, Assists: 3, "Passes per 90": 40 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 0, Assists: 0, "Passes per 90": 50 })], "statsbomb"),
  ]);
  const fila = filaDe(resultado);
  assert.equal(fila["Minutes played"], 2786, "el radar sale de las dos: minutos sumados");
  assert.ok(Math.abs(fila["Passes per 90"] - (40 * 2310 + 50 * 476) / 2786) < 1e-9, "por 90, ponderado por minutos");
  assert.equal(fila.Team, "Cavalry FC", "el club es el de la temporada más reciente");
  assert.deepEqual(temporadasDeFila(fila), [
    { etiqueta: "2026", anio: 2026, ligas: ["Canadian Premier League"], equipo: "Cavalry FC", partidos: 14, minutos: 476, goles: 0, asistencias: 0 },
    { etiqueta: "2025", anio: 2025, ligas: ["Canadian Premier League"], equipo: "HFX Wanderers", partidos: 28, minutos: 2310, goles: 1, asistencias: 3 },
  ]);
});

test("la capa de SkillCorner del mismo año no cuenta doble", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 2 })], "statsbomb"),
    base("SkillCorner · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 13, "Minutes played": 450, Goals: 2 })], "skillcorner"),
  ]);
  const [temporada, ...resto] = temporadasDeFila(filaDe(resultado));
  assert.equal(resto.length, 0, "es una sola temporada");
  assert.equal(temporada.minutos, 476);
  assert.equal(temporada.goles, 2);
  assert.equal(temporada.equipo, "Cavalry FC");
});

test("un traspaso de invierno entre ligas del mismo año suma en una sola temporada", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · USL Championship 2026", 2026, [jugador({ Team: "Pittsburgh Riverhounds", "Matches played": 6, "Minutes played": 300, Goals: 0 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 10, "Minutes played": 800, Goals: 1 })], "statsbomb"),
  ]);
  const temporadas = temporadasDeFila(filaDe(resultado));
  assert.equal(temporadas.length, 1);
  assert.equal(temporadas[0].partidos, 16);
  assert.equal(temporadas[0].minutos, 1100);
  assert.deepEqual([...temporadas[0].ligas].sort(), ["Canadian Premier League", "USL Championship"]);
  assert.equal(temporadas[0].equipo, "Cavalry FC", "el club donde más jugó");
});

test("un fichaje que viene de otra liga enseña las dos temporadas, cada una con su club", () => {
  /* Entre ligas distintas y clubes sin nada en común, el cruce solo junta a
     dos filas si comparten fecha de nacimiento: es lo que separa al mismo
     jugador de un homónimo. StatsBomb la trae siempre. */
  const resultado = aggregateDatasets([
    base("StatsBomb · USL Championship 2025", 2025, [jugador({ Age: 24, Team: "Pittsburgh Riverhounds", "Matches played": 30, "Minutes played": 2400, Goals: 2 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 0 })], "statsbomb"),
  ]);
  assert.equal(resultado.rows.filter((fila) => fila.Player === "Sean Young").length, 1);
  assert.deepEqual(temporadasDeFila(filaDe(resultado)).map((x) => [x.etiqueta, x.ligas[0], x.equipo, x.minutos]), [
    ["2026", "Canadian Premier League", "Cavalry FC", 476],
    ["2025", "USL Championship", "Pittsburgh Riverhounds", 2400],
  ]);
});

test("con archivos de Wyscout la temporada sale del nombre del archivo", () => {
  const resultado = aggregateDatasets([
    base("CPL 2026.xlsx", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 0, Assists: 1 })]),
    base("CPL 2025.xlsx", 2025, [jugador({ Age: 24, Team: "Cavalry FC", "Matches played": 26, "Minutes played": 1900, Goals: 2, Assists: 0 })]),
  ]);
  const temporadas = temporadasDeFila(filaDe(resultado));
  assert.deepEqual(temporadas.map((x) => x.etiqueta), ["2026", "2025"], "de la más reciente a la más antigua");
  assert.deepEqual(temporadas.map((x) => x.ligas), [["CPL"], ["CPL"]]);
  assert.deepEqual(temporadas.map((x) => x.minutos), [476, 1900]);
});

test("las ligas de año cruzado conservan su etiqueta completa", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Eerste Divisie 2025/2026", 2026, [jugador({ Team: "FC Emmen", "Matches played": 30, "Minutes played": 2500 })], "statsbomb"),
    base("StatsBomb · Eerste Divisie 2024/2025", 2025, [jugador({ Age: 24, Team: "FC Emmen", "Matches played": 20, "Minutes played": 1500 })], "statsbomb"),
  ]);
  assert.deepEqual(temporadasDeFila(filaDe(resultado)).map((x) => x.etiqueta), ["2025/2026", "2024/2025"]);
});

test("un archivo sin año va aparte, con su nombre, y cuenta como el más reciente", () => {
  const resultado = aggregateDatasets([
    base("CPL 2025.xlsx", 2025, [jugador({ Age: 24, Team: "Cavalry FC", "Matches played": 26, "Minutes played": 1900 })]),
    base("Search results.xlsx", 0, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 })]),
  ]);
  const temporadas = temporadasDeFila(filaDe(resultado));
  assert.deepEqual(temporadas.map((x) => x.etiqueta), ["Search results", "2025"]);
});

test("sin columna de goles el desglose lo dice en vez de inventar un cero", () => {
  const resultado = aggregateDatasets([
    base("CPL 2025.xlsx", 2025, [{ Player: "Ana", Age: 20, Team: "Club", "Matches played": 5, "Minutes played": 400 }]),
    base("CPL 2026.xlsx", 2026, [{ Player: "Ana", Age: 21, Team: "Club", "Matches played": 6, "Minutes played": 500 }]),
  ]);
  const [actual] = temporadasDeFila(filaDe(resultado, "Ana"));
  assert.ok(Number.isNaN(actual.goles));
  assert.ok(Number.isNaN(actual.asistencias));
});

test("con una sola temporada no hay nada que desglosar, y una fila ajena no tiene desglose", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 })], "statsbomb"),
  ]);
  assert.equal(temporadasDeFila(filaDe(resultado)).length, 1);
  assert.deepEqual(temporadasDeFila({ Player: "Suelto" }), []);
  assert.deepEqual(temporadasDeFila(undefined), []);
});

test("los pares también juntan sus dos temporadas: el mínimo de minutos se mide sobre el total", () => {
  /* Un jugador con 476 minutos este año y 2310 el pasado entra en la
     cohorte con un mínimo de 500, porque su fila tiene 2786. */
  const pares = (temporada, minutos) => Array.from({ length: 6 }, (_, k) => ({
    Player: `Par ${k}`, Age: 25 + (temporada === 2025 ? -1 : 0), Team: `Club ${k}`, Position: "DMF",
    "Matches played": 10, "Minutes played": minutos, "Passes per 90": 30 + k * 4,
  }));
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2025", 2025, [jugador({ Age: 24, Team: "HFX Wanderers", "Matches played": 28, "Minutes played": 2310 }), ...pares(2025, 900)], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 }), ...pares(2026, 300)], "statsbomb"),
  ]);
  const indice = resultado.rows.findIndex((fila) => fila.Player === "Sean Young");
  const informe = buildPlayerReport(resultado.rows, indice, 500);
  assert.equal(informe.minutes, 2786);
  assert.equal(informe.cohortSize, 7, "los seis pares (300 + 900 minutos) y él");
});

test("mismo nombre en ligas distintas con distinta fecha de nacimiento siguen siendo dos personas", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · USL Championship 2025", 2025, [jugador({ Age: 24, "Birth date": "2001-04-20", Team: "Pittsburgh Riverhounds", "Matches played": 30, "Minutes played": 2400 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Age: 25, "Birth date": "2000-11-02", Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 })], "statsbomb"),
  ]);
  assert.equal(resultado.rows.filter((fila) => fila.Player === "Sean Young").length, 2);
  for (const fila of resultado.rows) assert.equal(temporadasDeFila(fila).length, 1);
});

test("las fuentes de la fila van de la temporada más reciente a la más antigua", () => {
  /* La ficha ampliada pide los eventos de la primera fuente de StatsBomb y la
     mesa toma la liga de la primera reconocida: tienen que ser las de ahora. */
  const resultado = aggregateDatasets([
    base("StatsBomb · USL Championship 2025", 2025, [jugador({ Age: 24, Team: "Pittsburgh Riverhounds", "Matches played": 30, "Minutes played": 2400 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 })], "statsbomb"),
  ]);
  assert.equal(filaDe(resultado)["Data sources"], "StatsBomb · Canadian Premier League 2026, StatsBomb · USL Championship 2025");
});

test("una temporada sin columna de goles dice «—» aunque otra base sí la traiga", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 1, Assists: 0 })], "statsbomb"),
    base("CPL 2025.xlsx", 2025, [{ Player: "Sean Young", Age: 24, "Birth date": "2001-04-20", Team: "Cavalry FC", Position: "DMF", "Matches played": 20, "Minutes played": 1500 }]),
  ]);
  const [actual, anterior] = temporadasDeFila(filaDe(resultado));
  assert.equal(actual.goles, 1);
  assert.ok(Number.isNaN(anterior.goles) && Number.isNaN(anterior.asistencias));
});

test("dos Excel sin año en el nombre son una sola temporada, no dos", () => {
  const resultado = aggregateDatasets([
    base("CPL.xlsx", 0, [jugador({ Team: "Cavalry FC", "Matches played": 10, "Minutes played": 700 })]),
    base("canadians.xlsx", 0, [jugador({ Team: "Cavalry FC", "Matches played": 10, "Minutes played": 700 })]),
  ]);
  const temporadas = temporadasDeFila(filaDe(resultado));
  assert.equal(temporadas.length, 1);
  assert.equal(temporadas[0].etiqueta, "CPL + canadians");
});

test("mismo nombre y misma liga un año y el siguiente, con distinta fecha: dos personas", () => {
  const resultado = aggregateDatasets([
    base("StatsBomb · Canadian Premier League 2025", 2025, [jugador({ Age: 24, "Birth date": "2001-04-20", Team: "HFX Wanderers", "Matches played": 20, "Minutes played": 1600 })], "statsbomb"),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Age: 25, "Birth date": "2000-11-02", Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476 })], "statsbomb"),
  ]);
  assert.equal(resultado.rows.filter((fila) => fila.Player === "Sean Young").length, 2);
});

test("Wyscout un año y StatsBomb el siguiente: los minutos se suman, no se toma el mayor", () => {
  const resultado = aggregateDatasets([
    base("CPL 2025.xlsx", 2025, [{ Player: "Sean Young", Age: 24, "Birth date": "2001-04-20", Team: "Cavalry FC", Position: "DMF", "Matches played": 20, "Minutes played": 1500, Goals: 2 }]),
    base("StatsBomb · Canadian Premier League 2026", 2026, [jugador({ Team: "Cavalry FC", "Matches played": 14, "Minutes played": 476, Goals: 1 })], "statsbomb"),
  ]);
  const fila = filaDe(resultado);
  assert.equal(fila["Minutes played"], 1976);
  assert.equal(fila["Matches played"], 34);
  assert.equal(fila.Goals, 3);
  const temporadas = temporadasDeFila(fila);
  assert.equal(temporadas.reduce((suma, x) => suma + x.minutos, 0), fila["Minutes played"], "la franja y el radar cuentan lo mismo");
});
