import assert from "node:assert/strict";
import test from "node:test";
import { casarPlantilla } from "../lib/plantilla.ts";

/**
 * Enlazar el plantel que devuelve SkillCorner con la base activa.
 *
 * Es lo que permite preguntar "los sub-23 canadienses de este plantel" en la
 * pantalla de carreras, que trabaja contra la API y no contra la base cruzada.
 * Si esto se equivoca, un filtro de edad esconde al jugador equivocado sin
 * decir nada, así que va probado.
 */

const fila = (Player, Team, extra = {}) => ({ Player, Team, Age: 24, "Minutes played": 900, ...extra });

const BASE = [
  fila("Daniel Nimick", "Forge FC"),
  fila("Thierno Elage Bah", "Cavalry FC"),
  fila("Sergio Camargo", "Cavalry FC"),
  fila("Jordan Smith", "Cavalry FC"),
  fila("Joseph Smith", "Cavalry FC"),
  fila("Daniel Nimick", "Cavalry FC"),
];

test("el nombre exacto casa", () => {
  const p = casarPlantilla(BASE, "Cavalry FC", ["Sergio Camargo"]);
  assert.equal(p.indice("Sergio Camargo"), 2);
  assert.equal(p.sinFicha, 0);
});

test("los acentos y las mayúsculas no estorban", () => {
  const base = [fila("Alexis Sánchez", "Cavalry FC")];
  const p = casarPlantilla(base, "cavalry fc", ["ALEXIS SANCHEZ"]);
  assert.equal(p.indice("ALEXIS SANCHEZ"), 0);
});

test("SkillCorner recorta el primer nombre y aun así casa", () => {
  /* "Elage Bah" por "Thierno Elage Bah": apellido e inicial bastan dentro de
     un solo plantel. */
  const p = casarPlantilla(BASE, "Cavalry FC", ["Elage Bah"]);
  assert.equal(p.indice("Elage Bah"), -1, "la inicial no coincide: T contra E");
  const q = casarPlantilla(BASE, "Cavalry FC", ["Thierno Bah"]);
  assert.equal(q.indice("Thierno Bah"), 1);
});

test("dos del mismo club con apellido e inicial iguales no se adivinan", () => {
  /* Jordan y Joseph Smith comparten "j smith". Casar por clave corta elegiría
     a uno al azar, y un filtro de edad escondería al que no toca. */
  const p = casarPlantilla(BASE, "Cavalry FC", ["J Smith"]);
  assert.equal(p.indice("J Smith"), -1);
  assert.equal(p.sinFicha, 1);
});

test("el club acota: un homónimo de otro equipo no cuenta", () => {
  /* Hay un Daniel Nimick en el Forge y otro en el Cavalry. Pidiendo el
     plantel del Cavalry tiene que salir el del Cavalry. */
  const p = casarPlantilla(BASE, "Cavalry FC", ["Daniel Nimick"]);
  assert.equal(p.indice("Daniel Nimick"), 5);
});

test("las variantes del nombre del club siguen siendo el mismo club", () => {
  const base = [fila("Sergio Camargo", "Cavalry Football Club")];
  const p = casarPlantilla(base, "Cavalry FC", ["Sergio Camargo"]);
  assert.equal(p.indice("Sergio Camargo"), 0);
});

test("si el equipo no está en la base no se casa nada", () => {
  /* Pedir carreras de una liga que no se ha cargado. Casar por nombre a
     través de media Europa daría datos falsos con cara de buenos. */
  const p = casarPlantilla(BASE, "Vancouver FC", ["Sergio Camargo", "Daniel Nimick"]);
  assert.equal(p.sinFicha, 2);
  assert.deepEqual(p.nombresSinFicha, ["Sergio Camargo", "Daniel Nimick"]);
});

test("dice cuántos y cuáles se quedaron sin ficha", () => {
  const p = casarPlantilla(BASE, "Cavalry FC", ["Sergio Camargo", "Fulano De Tal"]);
  assert.equal(p.sinFicha, 1);
  assert.deepEqual(p.nombresSinFicha, ["Fulano De Tal"]);
});
