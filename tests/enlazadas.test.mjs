import assert from "node:assert/strict";
import test from "node:test";
import {
  agregarAnotacion, agregarFase, agregarMaterial, cambiarAnotacion, desplazarAnotacion, fasesEnlazadas, materialEn, moverMaterial, quitarAnotacion,
  separarDeLasDemas, sistemaDePartido,
} from "../lib/abp.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;
/** Una jugada de cuatro fases con una zona puesta en la primera. */
function conZona() {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  j = agregarAnotacion(j, 0, { id: "z", tipo: "rect", a: { x: 0, z: 0 }, b: { x: 10, z: 10 }, color: "#ffffff", estilo: "translucida" });
  for (let i = 0; i < 3; i += 1) j = agregarFase(j, i, `Fase ${i + 2}`);
  return j;
}
const zona = (j, i) => j.fases[i].anotaciones.find((a) => a.id === "z");

test("cambiar una marca en una fase la cambia en las siguientes, no en las anteriores", () => {
  let j = conZona();
  assert.equal(fasesEnlazadas(j, 0, "z"), 3);
  j = cambiarAnotacion(j, 1, "z", { color: "#ff0000" });
  assert.deepEqual([0, 1, 2, 3].map((i) => zona(j, i).color), ["#ffffff", "#ff0000", "#ff0000", "#ff0000"]);
  j = desplazarAnotacion(j, 2, "z", 5, 0);
  assert.deepEqual([0, 1, 2, 3].map((i) => zona(j, i).a.x), [0, 0, 5, 5]);
  // La fase 3 ya es distinta de la 2: un cambio en la 2 se para ahí.
  j = cambiarAnotacion(j, 1, "z", { estilo: "rayas" });
  assert.deepEqual([0, 1, 2, 3].map((i) => zona(j, i).estilo), ["translucida", "rayas", "translucida", "translucida"]);
});

test("quitar una marca la quita desde esa fase en adelante; separarla deja de enlazarla", () => {
  let j = conZona();
  const sin = quitarAnotacion(j, 2, "z");
  assert.deepEqual([0, 1, 2, 3].map((i) => Boolean(zona(sin, i))), [true, true, false, false]);
  const [separada, nuevo] = separarDeLasDemas(j, 1, "z");
  assert.notEqual(nuevo, "z");
  assert.equal(fasesEnlazadas(separada, 0, "z"), 0);
  const cambiada = cambiarAnotacion(separada, 1, nuevo, { color: "#00ff00" });
  assert.deepEqual([0, 1, 2, 3].map((i) => cambiada.fases[i].anotaciones[0].color), ["#ffffff", "#00ff00", "#ffffff", "#ffffff"]);
});

test("una flecha pegada a jugadores pasa a la fase siguiente; una suelta, no", () => {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  j = agregarAnotacion(j, 0, { id: "p", tipo: "flecha", a: j.fases[0].pos.L4, b: j.fases[0].pos.L8, color: "#fff", estilo: "continua", desde: "L4", hasta: "L8" });
  j = agregarAnotacion(j, 0, { id: "s", tipo: "flecha", a: { x: 0, z: 0 }, b: { x: 9, z: 0 }, color: "#fff", estilo: "continua" });
  j = agregarFase(j, 0, "Fase 2");
  assert.deepEqual(j.fases[1].anotaciones.map((a) => a.id), ["p"]);
});

test("el material movido en una fase se mueve en las siguientes y se ve ir de un sitio a otro", () => {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  j = agregarMaterial(j, 0, [{ id: "c", tipo: "cono", p: { x: 0, z: 0 }, giro: 0, color: "#ff5f1f" }]);
  for (let i = 0; i < 2; i += 1) j = agregarFase(j, i, `Fase ${i + 2}`);
  j = moverMaterial(j, 1, "c", { x: 0, z: 6 });
  assert.deepEqual(j.fases.map((f) => f.material[0].p.z), [0, 6, 6]);
  // De la fase 1 a la 2 se abre: a mitad del movimiento, a medio camino.
  const pieza = j.fases[0].material[0];
  assert.ok(cerca(materialEn(j, 0, pieza, 0).p, { x: 0, z: 0 }));
  assert.ok(cerca(materialEn(j, 0, pieza, 0.5).p, { x: 0, z: 3 }));
  assert.ok(cerca(materialEn(j, 0, pieza, 1).p, { x: 0, z: 6 }));
  // Entre la 2 y la 3 no cambia.
  assert.ok(cerca(materialEn(j, 1, j.fases[1].material[0], 0.5).p, { x: 0, z: 6 }));
});
