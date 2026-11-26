import assert from "node:assert/strict";
import test from "node:test";
import { ESTADO_VACIO, LISTA_POR_DEFECTO, anotar, borrarLista, crearLista, dejarDeSeguir, juntar, leerEstado, mover, renombrarLista, seguir, sigue } from "../lib/seguimiento.ts";

const jugador = (nombre, extra = {}) => ({
  clave: `${nombre}|2005-04-05`, nombre, equipo: "Cavalry FC", posicion: "Lateral", edad: "21", ligas: ["CPL"],
  periodo: "Temporada 2026", indice: 58, ...extra,
});

test("seguir añade a la lista por defecto, y volver a seguir actualiza sin perder la nota", () => {
  let estado = seguir(ESTADO_VACIO, jugador("Adam Pearlman"), 1000);
  assert.equal(estado.entradas.length, 1);
  assert.equal(estado.entradas[0].lista, LISTA_POR_DEFECTO);
  estado = anotar(estado, "Adam Pearlman|2005-04-05", LISTA_POR_DEFECTO, "Lateral que crea; poco volumen defensivo.");
  estado = seguir(estado, jugador("Adam Pearlman", { indice: 61, periodo: "Media de 2025 + 2026" }), 5000);
  assert.equal(estado.entradas.length, 1);
  assert.equal(estado.entradas[0].indice, 61);
  assert.equal(estado.entradas[0].nota, "Lateral que crea; poco volumen defensivo.");
  assert.equal(estado.entradas[0].anadido, 1000);
  assert.ok(sigue(estado, "Adam Pearlman|2005-04-05"));
});

test("un jugador puede estar en dos listas, y dejar de seguir sin lista lo quita de todas", () => {
  let estado = seguir(ESTADO_VACIO, jugador("Theo Vorenkamp"));
  estado = seguir(estado, { ...jugador("Theo Vorenkamp"), lista: "Para enero" });
  assert.equal(estado.entradas.length, 2);
  assert.deepEqual(estado.listas, [LISTA_POR_DEFECTO, "Para enero"]);
  assert.equal(dejarDeSeguir(estado, "Theo Vorenkamp|2005-04-05", "Para enero").entradas.length, 1);
  assert.equal(dejarDeSeguir(estado, "Theo Vorenkamp|2005-04-05").entradas.length, 0);
});

test("mover, crear, renombrar y borrar listas", () => {
  let estado = seguir(ESTADO_VACIO, jugador("A"));
  estado = crearLista(estado, "  Laterales  ");
  assert.ok(estado.listas.includes("Laterales"));
  estado = mover(estado, "A|2005-04-05", LISTA_POR_DEFECTO, "Laterales");
  assert.equal(estado.entradas[0].lista, "Laterales");
  estado = renombrarLista(estado, "Laterales", "Laterales derechos");
  assert.ok(!estado.listas.includes("Laterales"));
  assert.equal(estado.entradas[0].lista, "Laterales derechos");
  estado = borrarLista(estado, "Laterales derechos");
  assert.equal(estado.entradas.length, 0);
  // La por defecto se vacía, no se borra.
  estado = borrarLista(seguir(estado, jugador("B")), LISTA_POR_DEFECTO);
  assert.ok(estado.listas.includes(LISTA_POR_DEFECTO));
  assert.equal(estado.entradas.length, 0);
});

test("leer una copia descarta lo que no tiene forma, e importar nunca borra", () => {
  assert.equal(leerEstado("hola"), null);
  assert.equal(leerEstado({ listas: [] }), null);
  const copia = leerEstado({ listas: ["Para enero"], entradas: [{ clave: "X|1", nombre: "X", lista: "Para enero", nota: "ver en vídeo" }, { nada: 1 }, null] });
  assert.equal(copia.entradas.length, 1);
  assert.deepEqual(copia.listas, [LISTA_POR_DEFECTO, "Para enero"]);
  const actual = seguir(ESTADO_VACIO, jugador("Y"));
  const junto = juntar(actual, copia);
  assert.equal(junto.entradas.length, 2);
  assert.equal(junto.entradas.find((e) => e.clave === "X|1").nota, "ver en vídeo");
});
