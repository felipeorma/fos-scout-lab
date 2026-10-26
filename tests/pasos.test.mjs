import assert from "node:assert/strict";
import test from "node:test";
import {
  agregarFase, antesDelPaso, balonEn, balonFinal, carreraDe, fijarCarrera, fijarPase, jugadaValida, posFinal, posicionEn, posar, posarBalon,
  pasosDe, quitarCarrera, quitarPase, sistemaDePartido, tipoDePase,
} from "../lib/abp.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;
const base = () => sistemaDePartido("433", "442", "nuestro", "ataque");

test("una pared: pase (paso 1), desmarque (paso 1) y vuelta (paso 2), en orden", () => {
  let j = base();
  const f0 = j.fases[0];
  const L4 = f0.pos.L4, L8 = f0.pos.L8;
  j = { ...j, fases: [{ ...f0, balon: { ...L4 } }] };
  // Paso 1: el 4 se la da al 8 y sale corriendo.
  j = fijarPase(j, 0, L8, "raso", 0);
  const hueco = { x: L4.x + 18, z: L4.z + 6 };
  j = fijarCarrera(j, 0, "L4", hueco, 0, 0);
  // Paso 2: el 8 se la devuelve al hueco.
  j = fijarPase(j, 0, hueco, "raso", 1);
  const fase = j.fases[0];
  assert.equal(pasosDe(fase), 2);
  // A mitad del paso 1, el balón va hacia el 8 y el 4 va de camino.
  assert.ok(balonEn(fase, 0.25).x !== L4.x);
  assert.ok(cerca(balonEn(fase, 0.5), L8));
  // En el paso 2, el balón sale de donde está el 8 y llega al hueco.
  assert.ok(cerca(balonEn(fase, 1), hueco));
  assert.ok(cerca(balonFinal(fase), hueco));
  assert.ok(cerca(posicionEn(fase, "L4", 0.5), hueco));
  assert.ok(cerca(posicionEn(fase, "L4", 1), hueco));
  // La fase siguiente empieza con el balón en el hueco.
  assert.ok(cerca(agregarFase(j, 0, "Fase 2").fases[1].balon, hueco));
});

test("un zigzag: dos carreras de la misma ficha, cada una desde donde acabó la anterior", () => {
  let j = base();
  const salida = j.fases[0].pos.L9;
  const a = { x: salida.x + 8, z: salida.z + 6 }, b = { x: salida.x + 16, z: salida.z - 2 };
  j = fijarCarrera(j, 0, "L9", a, 0, 0);
  j = fijarCarrera(j, 0, "L9", b, 0, 1);
  const fase = j.fases[0];
  assert.equal(fase.carreras.filter((c) => c.fichaId === "L9").length, 2);
  assert.ok(cerca(antesDelPaso(fase, "L9", 1), a));
  assert.ok(cerca(posicionEn(fase, "L9", 0.5), a));
  assert.ok(cerca(posFinal(fase, "L9"), b));
  // Rehacer el primer tramo no rompe el segundo: sigue desde el nuevo final.
  const otra = { x: salida.x + 6, z: salida.z + 10 };
  const cambiada = fijarCarrera(j, 0, "L9", otra, 0, 0).fases[0];
  assert.ok(cerca(antesDelPaso(cambiada, "L9", 1), otra));
  assert.ok(cerca(posFinal(cambiada, "L9"), b));
  // Quitar solo un paso.
  const sinPrimera = quitarCarrera(j, 0, "L9", 0).fases[0];
  assert.equal(carreraDe(sinPrimera, "L9", 0), undefined);
  assert.ok(carreraDe(sinPrimera, "L9", 1));
});

test("posar en la fase siguiente cambia la última carrera y el último envío", () => {
  let j = base();
  const salida = j.fases[0].pos.L9;
  j = fijarCarrera(j, 0, "L9", { x: salida.x + 8, z: salida.z }, 0, 0);
  j = fijarCarrera(j, 0, "L9", { x: salida.x + 16, z: salida.z }, 0, 1);
  j = fijarPase(j, 0, { x: 10, z: 0 }, "raso", 0);
  j = fijarPase(j, 0, { x: 20, z: 5 }, "aereo", 1);
  j = agregarFase(j, 0, "Fase 2");
  j = posar(j, 1, "L9", { x: salida.x + 20, z: salida.z + 4 });
  assert.ok(cerca(carreraDe(j.fases[0], "L9", 1).hasta, { x: salida.x + 20, z: salida.z + 4 }));
  assert.ok(cerca(carreraDe(j.fases[0], "L9", 0).hasta, { x: salida.x + 8, z: salida.z }));
  j = posarBalon(j, 1, { x: 25, z: 8 });
  assert.equal(j.fases[0].pases.at(-1).tipo, "aereo");
  assert.ok(cerca(j.fases[0].pases.at(-1).hasta, { x: 25, z: 8 }));
  // El tipo y quitar, por paso.
  assert.equal(tipoDePase(j, 0, "raso", 1).fases[0].pases[1].tipo, "raso");
  assert.equal(quitarPase(j, 0, 0).fases[0].pases.length, 1);
  assert.equal(quitarPase(j, 0).fases[0].pases.length, 0);
});

test("lo guardado con un solo pase se abre como envío del paso 1, y los pasos se guardan", () => {
  let j = base();
  const vieja = JSON.parse(JSON.stringify(j));
  vieja.fases[0].pase = { hasta: { x: 5, z: 5 }, tipo: "raso" };
  delete vieja.fases[0].pases;
  const leida = jugadaValida(vieja);
  assert.equal(leida.fases[0].pases.length, 1);
  assert.ok(cerca(leida.fases[0].pases[0].hasta, { x: 5, z: 5 }));
  j = fijarPase(j, 0, { x: 10, z: 0 }, "raso", 0);
  j = fijarPase(j, 0, { x: 20, z: 5 }, "aereo", 2);
  const ida = jugadaValida(JSON.parse(JSON.stringify(j)));
  assert.deepEqual(ida.fases[0].pases.map((p) => p.paso ?? 0), [0, 2]);
  assert.equal(pasosDe(ida.fases[0]), 3);
  // Un paso fuera de rango se queda en el último permitido; dos envíos en el mismo paso, el último.
  const rara = JSON.parse(JSON.stringify(j));
  rara.fases[0].pases.push({ hasta: { x: 1, z: 1 }, tipo: "raso", paso: 9 }, { hasta: { x: 2, z: 2 }, tipo: "raso", paso: 3 });
  assert.deepEqual(jugadaValida(rara).fases[0].pases.map((p) => p.paso ?? 0), [0, 2, 3]);
});
