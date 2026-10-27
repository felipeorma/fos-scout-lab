import assert from "node:assert/strict";
import test from "node:test";
import { duracionTotal, plantilla } from "../lib/abp.ts";
import {
  agregarMomento, agregarSistema, cambiarNota, claveDePresentacion, diapositivas, duracionDePresentacion, moverElemento, presentacionValida, presentacionVacia, quitarElemento,
} from "../lib/presentacion.ts";

const momento = (id, inicio, fin) => ({ id, codigo: "c1", t: inicio + 8, inicio, fin, nota: "" });

test("clips y sistemas en orden, con su nota, sin repetir clips", () => {
  const rondo = plantilla("rondo");
  let p = presentacionVacia();
  p = agregarMomento(p, "m1", "Mirad la presión");
  p = agregarMomento(p, "m1");
  p = agregarSistema(p, rondo.id);
  p = agregarMomento(p, "m2");
  assert.deepEqual(p.elementos.map((e) => e.tipo), ["momento", "sistema", "momento"]);
  p = moverElemento(p, p.elementos[2].id, -1);
  assert.deepEqual(p.elementos.map((e) => e.momento ?? e.jugada), ["m1", "m2", rondo.id]);
  p = cambiarNota(p, p.elementos[2].id, "Así salimos");
  assert.equal(p.elementos[2].nota, "Así salimos");
  p = quitarElemento(p, p.elementos[1].id);
  assert.equal(p.elementos.length, 2);
  assert.equal(claveDePresentacion(null), "fos-scout-lab:presentacion:general");
});

test("cada diapositiva con lo que enseña y cuánto dura; lo que ya no está, falta", () => {
  const rondo = plantilla("rondo");
  let p = agregarMomento(presentacionVacia(), "m1");
  p = agregarSistema(p, rondo.id);
  p = agregarMomento(p, "borrado");
  const lista = diapositivas(p, [momento("m1", 92, 105)], [rondo]);
  assert.deepEqual(lista.map((d) => [d.tipo, d.segundos]), [["momento", 13], ["sistema", duracionTotal(rondo) + 1], ["falta", 0]]);
  assert.ok(Math.abs(duracionDePresentacion(lista) - (13 + duracionTotal(rondo) + 1 + 2 * 1.2)) < 1e-9);
});

test("lo guardado roto vuelve sano", () => {
  assert.deepEqual(presentacionValida(null), presentacionVacia());
  const p = presentacionValida({ titulo: 3, elementos: [{ id: "a", tipo: "momento", momento: "m1" }, { id: "b", tipo: "otro" }, { tipo: "sistema", jugada: "j" }] });
  assert.deepEqual(p.elementos, [{ id: "a", tipo: "momento", momento: "m1", nota: "" }]);
});
