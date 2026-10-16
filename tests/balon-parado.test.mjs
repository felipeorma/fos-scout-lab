import assert from "node:assert/strict";
import test from "node:test";
import { balonParadoDe, balonParadoDeLaLiga, lecturasDeParado } from "../lib/balonParado.ts";

/** El balón parado de un equipo frente a su liga, con datos hechos a mano. */

const corner = (equipo, extra = {}) => ({ clase: "corner", equipo, lanzador: "Saca Uno", lado: "izquierda", rosca: "inswinging", corto: false, zona: "centro", contacto: "defensa", quien: null, remate: false, rematador: null, xg: 0, gol: false, ...extra });

test("a favor y en contra, zonas sobre los córners al área y el corto aparte", () => {
  const liga = { fallidos: 0, partidos: [
    { partido: 1, fecha: "2026-01-01", local: 1, visita: 2, acciones: [
      corner(1, { zona: "primer_palo", contacto: "ataque", quien: "Cabecea Uno" }),
      corner(1, { zona: "primer_palo", remate: true, rematador: "Cabecea Uno", xg: 0.2, gol: true }),
      corner(1, { corto: true, zona: "corto" }),
      corner(2, { zona: "segundo_palo", lanzador: "Otro", lado: "derecha" }),
    ] },
  ] };
  const p = balonParadoDe(liga, 1);
  assert.equal(p.favor.corners, 3);
  assert.equal(p.favor.enCorto, 1 / 3);
  assert.equal(p.favor.zonas.primer_palo, 1, "de los dos al área, los dos al primer palo");
  assert.equal(p.favor.primerContacto, 0.5);
  assert.equal(p.favor.goles, 1);
  assert.equal(p.contra.corners, 1);
  assert.deepEqual(p.primeros, [{ nombre: "Cabecea Uno", veces: 1 }]);
  assert.equal(p.rematadores[0].nombre, "Cabecea Uno");
  assert.equal(p.lanzadores[0].lado, "izquierda");
  const ref = balonParadoDeLaLiga(liga);
  assert.equal(ref.cornersPorPartido, 2, "cuatro córners entre dos equipos en un partido");
});

test("las frases: solo lo que se separa de la liga con muestra suficiente", () => {
  const acciones = [
    ...Array.from({ length: 20 }, () => corner(1, { zona: "primer_palo" })),
    ...Array.from({ length: 10 }, () => corner(1)),
    ...Array.from({ length: 30 }, () => corner(2)),
  ];
  const liga = { fallidos: 0, partidos: [{ partido: 1, fecha: "2026-01-01", local: 1, visita: 2, acciones }] };
  const lecturas = lecturasDeParado(balonParadoDe(liga, 1), null, balonParadoDeLaLiga(liga));
  assert.ok(lecturas.some((l) => l.valores.donde === "al primer palo" && l.valores.p === 67), "20 de 30 al primer palo frente a 20 de 60 en la liga");
  const pocos = { fallidos: 0, partidos: [{ partido: 1, fecha: "2026-01-01", local: 1, visita: 2, acciones: acciones.slice(0, 5).concat(acciones.slice(30)) }] };
  assert.equal(lecturasDeParado(balonParadoDe(pocos, 1), null, balonParadoDeLaLiga(pocos)).length, 0, "con cinco córners no se dice nada");
});
