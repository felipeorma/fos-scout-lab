import assert from "node:assert/strict";
import test from "node:test";
import { conferenciaMls, esMls, gruposDeLiga } from "../lib/conferencias.ts";

/**
 * El mapa conceptual de Football Blueprints: liga → conferencias → equipos.
 * La MLS se parte en Este y Oeste aunque cada proveedor escriba los clubes a
 * su manera; las demás ligas van en un solo grupo.
 */

const ESTE = ["Atlanta United", "Charlotte FC", "Chicago Fire", "FC Cincinnati", "Columbus Crew", "D.C. United",
  "Inter Miami CF", "CF Montréal", "Nashville SC", "New England Revolution", "New York City FC", "New York Red Bulls",
  "Orlando City", "Philadelphia Union", "Toronto FC"];
const OESTE = ["Austin FC", "Colorado Rapids", "FC Dallas", "Houston Dynamo", "LA Galaxy", "Los Angeles FC",
  "Minnesota United", "Portland Timbers", "Real Salt Lake", "San Diego FC", "San Jose Earthquakes",
  "Seattle Sounders FC", "Sporting Kansas City", "St. Louis City SC", "Vancouver Whitecaps FC"];

test("los treinta clubes de la MLS caen en su conferencia", () => {
  for (const equipo of ESTE) assert.equal(conferenciaMls(equipo), "Este", equipo);
  for (const equipo of OESTE) assert.equal(conferenciaMls(equipo), "Oeste", equipo);
});

test("las grafías de cada proveedor no cambian la conferencia", () => {
  assert.equal(conferenciaMls("Los Angeles Galaxy"), "Oeste");
  assert.equal(conferenciaMls("LAFC"), "Oeste");
  assert.equal(conferenciaMls("Montreal Impact"), "Este");
  assert.equal(conferenciaMls("DC United"), "Este");
  assert.equal(conferenciaMls("New York City"), "Este");
  assert.equal(conferenciaMls("Saint Louis City"), "Oeste");
  assert.equal(conferenciaMls("Houston Dynamo FC"), "Oeste");
});

test("la MLS se reconoce por su nombre", () => {
  assert.ok(esMls("Major League Soccer"));
  assert.ok(esMls("MLS"));
  assert.ok(!esMls("MLS Next Pro"), "el filial es otra liga, sin las conferencias de la MLS");
  assert.ok(!esMls("Canadian Premier League"));
});

test("la MLS sale en dos grupos de quince, ordenados", () => {
  const grupos = gruposDeLiga("Major League Soccer", [...OESTE, ...ESTE].reverse());
  assert.deepEqual(grupos.map((g) => [g.nombre, g.equipos.length]), [["Conferencia Este", 15], ["Conferencia Oeste", 15]]);
  assert.equal(grupos[0].equipos[0], "Atlanta United");
});

test("un club que no se reconoce no desaparece del mapa", () => {
  const grupos = gruposDeLiga("Major League Soccer", ["Austin FC", "Expansion FC"]);
  assert.deepEqual(grupos.map((g) => g.nombre), ["Conferencia Oeste", "Sin conferencia"]);
});

test("otra liga va en un solo grupo con su nombre", () => {
  assert.deepEqual(gruposDeLiga("Canadian Premier League", ["Forge FC", "Cavalry FC"]), [
    { nombre: "Canadian Premier League", equipos: ["Cavalry FC", "Forge FC"] },
  ]);
});
