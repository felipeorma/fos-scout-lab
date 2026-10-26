import assert from "node:assert/strict";
import test from "node:test";
import { sistemaDePartido } from "../lib/abp.ts";
import { apellido, equiposDeBase, jugadorDeFicha, jugadoresDeBase, plantillaDe, ponerPorPuestos, puestosDeFicha, tarjetaDe } from "../lib/jugadoresDeBase.ts";

// Una base inventada con las columnas de una exportación de Wyscout.
const fila = (jugador, equipo, posicion, minutos, extra = {}) => ({
  Player: jugador, "Team within selected timeframe": equipo, Position: posicion, "Minutes played": minutos, Age: 24,
  "Defensive duels won, %": 60, "Aerial duels won, %": 50, "Progressive passes per 90": 4, "Accurate passes, %": 80, "Key passes per 90": 0.5,
  "xG per 90": 0.1, "Goals per 90": 0.1, "xA per 90": 0.1, "Save rate, %": 70, ...extra,
});
const filas = [
  fila("A. Portero", "Rojos", "GK", 2700),
  fila("B. Suplente", "Rojos", "GK", 300),
  fila("C. Izquierdo", "Rojos", "LB, LWB", 2400),
  fila("D. Central", "Rojos", "LCB, CB", 2500, { "Defensive duels won, %": 75 }),
  fila("E. Central", "Rojos", "RCB", 2300),
  fila("F. Derecho", "Rojos", "RB", 2100),
  fila("G. Pivote", "Rojos", "DMF, RCMF", 2600),
  fila("H. Interior", "Rojos", "LCMF", 2000),
  fila("I. Interior", "Rojos", "RCMF, AMF", 1900),
  fila("J. Extremo", "Rojos", "LW, LAMF", 1800),
  fila("K. Extremo", "Rojos", "RW", 1700),
  fila("L. Punta", "Rojos", "CF", 2200),
  fila("M. Otro", "Azules", "CF", 900),
  // El mismo jugador dos veces (dos temporadas): vale la fila con más minutos.
  fila("L. Punta", "Rojos", "CF", 400),
];

test("la base se lee: equipos, plantilla por minutos y sin repetidos", () => {
  const todos = jugadoresDeBase(filas);
  assert.deepEqual(equiposDeBase(todos), ["Azules", "Rojos"]);
  const rojos = plantillaDe(todos, "Rojos");
  assert.equal(rojos.length, 12);
  assert.equal(rojos[0].nombre, "A. Portero");
  assert.equal(rojos.find((j) => j.nombre === "L. Punta").minutos, 2200);
  assert.deepEqual(rojos.find((j) => j.nombre === "C. Izquierdo").puestos, ["LB", "LWB"]);
  assert.deepEqual(jugadoresDeBase([{ Algo: 1 }]), []);
});

test("cada ficha de un 4-3-3 recibe al jugador de su puesto", () => {
  const j = sistemaDePartido("433", "442", "nuestro", "ataque");
  const nuestras = j.fichas.filter((f) => f.equipo === "local");
  assert.deepEqual(puestosDeFicha(nuestras.find((f) => f.rol === "POR")), ["GK"]);
  const reparto = ponerPorPuestos(nuestras, plantillaDe(jugadoresDeBase(filas), "Rojos"));
  const de = (rol) => nuestras.filter((f) => f.rol === rol).map((f) => reparto.get(f.id)?.nombre).sort();
  assert.deepEqual(de("POR"), ["A. Portero"]);
  assert.deepEqual(de("LI"), ["C. Izquierdo"]);
  assert.deepEqual(de("LD"), ["F. Derecho"]);
  assert.deepEqual(de("DFC"), ["D. Central", "E. Central"]);
  assert.deepEqual(de("EI"), ["J. Extremo"]);
  assert.deepEqual(de("ED"), ["K. Extremo"]);
  assert.deepEqual(de("DC"), ["L. Punta"]);
  // Los tres del medio, entre el pivote y los dos interiores; el portero suplente no juega de campo.
  assert.deepEqual([...de("MC"), ...de("MCD")].sort(), ["G. Pivote", "H. Interior", "I. Interior"]);
  assert.ok(![...reparto.values()].some((x) => x.nombre === "B. Suplente"));
});

test("la tarjeta: tres números con su percentil entre los de su línea, y la ficha encuentra a su jugador", () => {
  const todos = jugadoresDeBase(filas);
  const central = todos.find((x) => x.nombre === "D. Central");
  const tarjeta = tarjetaDe(filas, todos, central);
  assert.equal(tarjeta.linea, "defensa");
  assert.equal(tarjeta.metricas.length, 3);
  assert.equal(tarjeta.metricas[0].nombre, "Duelos defensivos ganados, %");
  assert.equal(tarjeta.metricas[0].valor, 75);
  // Es el mejor de los cuatro defensas en duelos defensivos.
  assert.ok(tarjeta.metricas[0].percentil > 80);
  assert.equal(apellido("D. Central"), "Central");
  const ficha = { id: "L4", equipo: "local", dorsal: "4", rol: "DFC", jugador: "L. Punta" };
  assert.equal(jugadorDeFicha(ficha, todos, "Rojos").minutos, 2200);
  assert.equal(jugadorDeFicha({ ...ficha, jugador: undefined }, todos), null);
});
