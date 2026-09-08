import assert from "node:assert/strict";
import test from "node:test";
import { FILTROS_VACIOS, cuantosFiltrosActivos, pasaLosFiltros, resumirFilas } from "../lib/filtros.ts";

/**
 * La red de filtros compartida.
 *
 * Existe porque esta lógica vivía dentro de un hook y no se podía probar: al
 * montarla, los filtros dejaron de aplicarse en el ranking por unas
 * dependencias que faltaban en un memo, y no se supo hasta abrir el
 * navegador. Lo que sigue cubre cada filtro por separado, sus combinaciones,
 * y los casos donde el dato no está.
 */

const fila = (extra = {}) => ({
  Player: "Jugador", Team: "Cavalry FC", Position: "CB", Age: 24,
  "Passport country": "Canada", "Minutes played": 1500, ...extra,
});
const con = (cambios) => ({ ...FILTROS_VACIOS, ...cambios });
const origenCPL = { ligas: ["Canadian Premier League"], anios: [2026] };

test("sin filtros pasa todo el mundo", () => {
  const [r] = resumirFilas([fila()]);
  assert.equal(pasaLosFiltros(r, origenCPL, FILTROS_VACIOS), true);
  assert.equal(cuantosFiltrosActivos(FILTROS_VACIOS), 0);
});

test("filtra por club, y el club se compara exacto", () => {
  const [r] = resumirFilas([fila({ Team: "Cavalry FC" })]);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ equipo: "Cavalry FC" })), true);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ equipo: "Forge FC" })), false);
});

test("filtra por puesto usando la cohorte, no el texto de la posición", () => {
  const [central] = resumirFilas([fila({ Position: "LCB" })]);
  const [extremo] = resumirFilas([fila({ Position: "LW" })]);
  assert.equal(pasaLosFiltros(central, origenCPL, con({ puesto: "CB" })), true);
  assert.equal(pasaLosFiltros(extremo, origenCPL, con({ puesto: "CB" })), false);
  assert.equal(pasaLosFiltros(extremo, origenCPL, con({ puesto: "WING" })), true);
});

test("el pasaporte cuenta también el secundario, sin importar mayúsculas", () => {
  const [r] = resumirFilas([fila({ "Passport country": "Canada, Nigeria" })]);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ pasaporte: "Nigeria" })), true);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ pasaporte: "nigeria" })), true);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ pasaporte: "Ghana" })), false);
});

test("el tope de edad deja fuera a quien no tiene edad conocida", () => {
  const [conEdad] = resumirFilas([fila({ Age: 21 })]);
  const [sinEdad] = resumirFilas([fila({ Age: "" })]);
  assert.equal(pasaLosFiltros(conEdad, origenCPL, con({ edadMax: 23 })), true);
  assert.equal(pasaLosFiltros(conEdad, origenCPL, con({ edadMax: 20 })), false);
  // Sin edad no se puede afirmar que cumpla el tope: es más honesto perder a
  // uno que colar a un veterano en una búsqueda de sub-23.
  assert.equal(pasaLosFiltros(sinEdad, origenCPL, con({ edadMax: 23 })), false);
  // Pero sin tope sí pasa: la falta de edad no lo descalifica por sí sola.
  assert.equal(pasaLosFiltros(sinEdad, origenCPL, FILTROS_VACIOS), true);
});

test("quien jugó en dos ligas pasa el filtro de cualquiera de ellas", () => {
  const [r] = resumirFilas([fila()]);
  const dosLigas = { ligas: ["MLS", "MLS Next Pro"], anios: [2026] };
  assert.equal(pasaLosFiltros(r, dosLigas, con({ liga: "MLS" })), true);
  assert.equal(pasaLosFiltros(r, dosLigas, con({ liga: "MLS Next Pro" })), true);
  assert.equal(pasaLosFiltros(r, dosLigas, con({ liga: "Ligue 3" })), false);
});

test("sin procedencia conocida no se puede filtrar por liga ni por año", () => {
  const [r] = resumirFilas([fila()]);
  assert.equal(pasaLosFiltros(r, undefined, con({ liga: "MLS" })), false);
  assert.equal(pasaLosFiltros(r, undefined, con({ anio: 2026 })), false);
  // Los demás filtros sí funcionan sin ella: no dependen del origen.
  assert.equal(pasaLosFiltros(r, undefined, con({ equipo: "Cavalry FC" })), true);
});

test("los filtros se acumulan: hay que cumplirlos todos", () => {
  const [r] = resumirFilas([fila({ Age: 22, Position: "LCB", Team: "Cavalry FC" })]);
  const todos = con({ liga: "Canadian Premier League", anio: 2026, equipo: "Cavalry FC", puesto: "CB", pasaporte: "Canada", edadMax: 23 });
  assert.equal(pasaLosFiltros(r, origenCPL, todos), true);
  // Basta que uno falle para quedar fuera.
  assert.equal(pasaLosFiltros(r, origenCPL, { ...todos, edadMax: 21 }), false);
  assert.equal(pasaLosFiltros(r, origenCPL, { ...todos, equipo: "Forge FC" }), false);
  assert.equal(cuantosFiltrosActivos(todos), 6);
});

test("una fila que no existe no pasa, en vez de reventar", () => {
  assert.equal(pasaLosFiltros(undefined, origenCPL, FILTROS_VACIOS), false);
});

test("el mínimo de minutos NO lo aplica este predicado", () => {
  // A propósito: los minutos entran en el grupo de referencia, así que los
  // aplica quien construye el informe. Si se filtraran aquí, un jugador
  // quedaría fuera de la lista pero seguiría contando para los percentiles.
  const [r] = resumirFilas([fila({ "Minutes played": 10 })]);
  assert.equal(pasaLosFiltros(r, origenCPL, con({ minutosMin: 2000 })), true);
});

test("cuenta bien los filtros activos, uno a uno", () => {
  assert.equal(cuantosFiltrosActivos(con({ liga: "MLS" })), 1);
  assert.equal(cuantosFiltrosActivos(con({ anio: 2026 })), 1);
  assert.equal(cuantosFiltrosActivos(con({ puesto: "CB", edadMax: 23 })), 2);
  // El mínimo de minutos no cuenta: no es un filtro de mercado.
  assert.equal(cuantosFiltrosActivos(con({ minutosMin: 900 })), 0);
});
