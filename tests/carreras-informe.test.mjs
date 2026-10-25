import assert from "node:assert/strict";
import test from "node:test";
import { edicionDelInforme, equipoDelInforme, jugadorEnCarreras } from "../lib/carrerasDelInforme.ts";

const ediciones = [
  { id: 1, name: "Canadian Premier League", season: "2025" },
  { id: 2, name: "Canadian Premier League", season: "2026" },
  { id: 3, name: "Premier League", season: "2025/2026" },
  { id: 4, name: "USL Championship", season: "2026" },
];
const informe = (cambios = {}) => ({ jugador: "Sean Young", equipo: "Cavalry FC", ligas: ["Canadian Premier League"], anio: 2026, ...cambios });

test("la edición es la de su liga y su año", () => {
  assert.equal(edicionDelInforme(ediciones, informe())?.id, 2);
  assert.equal(edicionDelInforme(ediciones, informe({ anio: 2025 }))?.id, 1);
});

test("el nombre de la liga tiene que coincidir entero", () => {
  // "Premier League" no es la "Canadian Premier League", ni al revés.
  assert.equal(edicionDelInforme(ediciones, informe({ ligas: ["Premier League"], anio: 2026 }))?.id, 3);
  assert.equal(edicionDelInforme(ediciones, informe({ ligas: ["English Premier League"], anio: 2026 })), null);
});

test("sin año, o sin su liga en SkillCorner, no hay edición", () => {
  assert.equal(edicionDelInforme(ediciones, informe({ anio: null })), null);
  assert.equal(edicionDelInforme(ediciones, informe({ ligas: ["Eerste Divisie"] })), null);
});

test("con dos ligas en la temporada vale la primera que SkillCorner tenga", () => {
  assert.equal(edicionDelInforme(ediciones, informe({ ligas: ["Eerste Divisie", "USL Championship"] }))?.id, 4);
});

test("el club se reconoce aunque SkillCorner lo escriba distinto", () => {
  assert.equal(equipoDelInforme(["Forge FC", "Cavalry FC"], informe({ equipo: "Cavalry" })), "Cavalry FC");
  assert.equal(equipoDelInforme(["Forge FC", "York United"], informe()), null);
});

test("su nombre entre los que tienen carreras", () => {
  assert.equal(jugadorEnCarreras(["Ali Musse", "Sean Young"], informe()), "Sean Young");
  // La base dice "S. Young" y SkillCorner el nombre entero: casa si es el único Young.
  assert.equal(jugadorEnCarreras(["Ali Musse", "Sean Young"], informe({ jugador: "S. Young" })), "Sean Young");
  assert.equal(jugadorEnCarreras(["Ali Musse", "Tom Field"], informe()), null);
});
