import assert from "node:assert/strict";
import test from "node:test";
import { contratoCorto, cortesDeContrato, indiceDeMercado, pasaMercado, valorCorto } from "../lib/mercado.ts";

/**
 * Valor y contrato de Transfermarkt: emparejar con la base y filtrar.
 */

const tm = (id, nombre, nacimiento, valor = 100000, contrato = "2026-12-31", club = "Club") => ({ id, nombre, nacimiento, club, valor, contrato });

test("se empareja por nacimiento y nombre, aunque StatsBomb traiga el nombre de registro", () => {
  const indice = indiceDeMercado([
    tm("1", "Roberto Lopes", "1992-06-17"),
    tm("2", "Wesley Timóteo", "2000-04-21"),
    tm("3", "Otro Nacido Igual", "1992-06-17"),
  ]);
  assert.equal(indice.buscar("Roberto Carlos Lopes", "1992-06-17")?.id, "1");
  assert.equal(indice.buscar("Wesley Thomas Lanca Timoteo", "2000-04-21T00:00:00")?.id, "2", "sin tildes y con hora en la fecha");
  assert.equal(indice.buscar("Roberto Carlos Lopes", "1993-06-17"), null, "otra fecha no es él");
  assert.equal(indice.buscar("Alguien Distinto", "1992-06-17"), null, "misma fecha sin ninguna palabra en común no es él");
});

test("sin fecha de nacimiento solo vale el nombre exacto y único", () => {
  const indice = indiceDeMercado([tm("1", "Juan Pérez", "1999-01-01"), tm("2", "Luis Díaz", "1998-01-01"), tm("3", "Luis Diaz", "2001-02-02")]);
  assert.equal(indice.buscar("Juan Perez", "")?.id, "1");
  assert.equal(indice.buscar("Luis Díaz", ""), null, "dos con el mismo nombre: no se adivina");
});

test("un cedido que sale en dos plantillas cuenta una vez", () => {
  const indice = indiceDeMercado([tm("9", "Ana Uno", "2000-01-01"), tm("9", "Ana Uno", "2000-01-01")]);
  assert.equal(indice.cuantos, 1);
});

test("los filtros: sin dato no pasa, y sin filtro pasan todos", () => {
  const barato = tm("1", "A", "2000-01-01", 80000, "2026-12-31");
  const caro = tm("2", "B", "2000-01-01", 900000, "2028-06-30");
  const sinValor = tm("3", "C", "2000-01-01", null, null);
  assert.equal(pasaMercado(null, { valorMax: 0, contratoHasta: "" }), true);
  assert.equal(pasaMercado(barato, { valorMax: 100000, contratoHasta: "" }), true);
  assert.equal(pasaMercado(caro, { valorMax: 100000, contratoHasta: "" }), false);
  assert.equal(pasaMercado(sinValor, { valorMax: 100000, contratoHasta: "" }), false, "sin valor publicado no se sabe si pasa");
  assert.equal(pasaMercado(null, { valorMax: 100000, contratoHasta: "" }), false);
  assert.equal(pasaMercado(barato, { valorMax: 0, contratoHasta: "2026-12-31" }), true, "vence justo ese día");
  assert.equal(pasaMercado(caro, { valorMax: 0, contratoHasta: "2027-06-30" }), false);
  assert.equal(pasaMercado(sinValor, { valorMax: 0, contratoHasta: "2027-06-30" }), false);
});

test("se escriben cortos: €150K, €1,25M y 12/2026", () => {
  assert.equal(valorCorto(150000, "es"), "€150K");
  assert.equal(valorCorto(1250000, "es"), "€1,25M");
  assert.equal(valorCorto(1250000, "en"), "€1.25M");
  assert.equal(valorCorto(null), "");
  assert.equal(contratoCorto("2026-12-31"), "12/2026");
  assert.equal(contratoCorto(null), "");
});

test("los cortes de contrato son los próximos finales de ventana", () => {
  assert.deepEqual(cortesDeContrato(new Date(2026, 9, 8), 4), ["2026-12-31", "2027-06-30", "2027-12-31", "2028-06-30"]);
  assert.deepEqual(cortesDeContrato(new Date(2027, 2, 1), 3), ["2027-06-30", "2027-12-31", "2028-06-30"]);
});
