import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPO, agregarFase, agregarMaterial, cambiarAnotacion, cambiarFicha, cambiarMaterial, fasesEnlazadas, jugadaValida, materialCerca, materialEn,
  moverMaterial, plantilla,
} from "../lib/abp.ts";
import { ESPACIOS, centroQueCabe, estirarZona, piezasDeEspacio, ponerEspacio, tamanoDeZona } from "../lib/entrenamiento.ts";
import {
  agregarBloque, bloquesConSistema, cambiarBloque, inicios, minutosTotales, moverBloque, planValido, planVacio, quitarBloque,
} from "../lib/planDeSesion.ts";

const libre = () => plantilla("libre");
const espacio = (id) => ESPACIOS.find((e) => e.id === id);

test("un espacio de juego: su rectángulo a medida, rotulado, con setas y porterías donde toca", () => {
  const rondo = piezasDeEspacio(espacio("rondo20"), { x: 0, z: 0 }, "#ffffff");
  assert.equal(rondo.zona.tipo, "rect");
  assert.equal(rondo.zona.medidas, true);
  assert.deepEqual(tamanoDeZona(rondo.zona.a, rondo.zona.b), { largo: 20, ancho: 20 });
  assert.equal(rondo.material.filter((m) => m.tipo === "seta").length, 4);
  assert.equal(rondo.material.some((m) => m.tipo.includes("porteria")), false);

  const siete = piezasDeEspacio(espacio("reducido7"), { x: 0, z: 0 }, "#ffffff");
  const porterias = siete.material.filter((m) => m.tipo === "porteria");
  assert.equal(porterias.length, 2);
  // Las bocas, una frente a la otra: la de atrás sin girar y la de delante, media vuelta.
  assert.deepEqual(porterias.map((m) => [m.p.x, m.giro]), [[-27.5, 0], [27.5, 180]]);
  assert.equal(piezasDeEspacio(espacio("reducido5"), { x: 0, z: 0 }, "#fff").material.filter((m) => m.tipo === "miniporteria").length, 2);
});

test("el espacio cabe en el campo aunque se pida junto a la banda", () => {
  const c = centroQueCabe({ x: 50, z: 33 }, 40, 30);
  assert.equal(c.x, CAMPO.largo / 2 - 20);
  assert.equal(c.z, CAMPO.ancho / 2 - 15);
  const { zona } = piezasDeEspacio(espacio("reducido9"), { x: 52, z: -30 }, "#fff");
  assert.ok(Math.max(zona.a.x, zona.b.x) <= CAMPO.largo / 2 + 1e-9);
  assert.ok(Math.min(zona.a.z, zona.b.z) >= -CAMPO.ancho / 2 - 1e-9);
});

test("se pone en esta fase y en las siguientes, enlazado", () => {
  let j = agregarFase(agregarFase(libre(), 0, "Fase 2"), 1, "Fase 3");
  const puesto = ponerEspacio(j, 1, espacio("posesion30"), { x: 0, z: 0 }, "#ffffff");
  j = puesto.jugada;
  assert.equal(j.fases[0].anotaciones.some((a) => a.id === puesto.zona), false);
  assert.equal(fasesEnlazadas(j, 1, puesto.zona), 1);
  // Cambiar su tamaño en la fase 2 lo cambia también en la 3.
  j = cambiarAnotacion(j, 1, puesto.zona, { tamano: { largo: 36, ancho: 24 } });
  const zona3 = j.fases[2].anotaciones.find((a) => a.id === puesto.zona);
  assert.deepEqual(tamanoDeZona(zona3.a, zona3.b), { largo: 36, ancho: 24 });
});

test("una zona se estira por una esquina y se rotula o no", () => {
  let j = libre();
  j = { ...j, fases: [{ ...j.fases[0], anotaciones: [{ id: "z", tipo: "rect", a: { x: -5, z: -5 }, b: { x: 5, z: 5 }, color: "#ffffff", estilo: "borde" }] }] };
  j = cambiarAnotacion(j, 0, "z", { caja: { a: { x: -5, z: -5 }, b: { x: 15, z: 3 } } });
  let z = j.fases[0].anotaciones[0];
  assert.deepEqual(tamanoDeZona(z.a, z.b), { largo: 20, ancho: 8 });
  // Nunca menos de un metro por lado.
  j = cambiarAnotacion(j, 0, "z", { caja: { a: { x: -5, z: -5 }, b: { x: -5, z: -5 } } });
  z = j.fases[0].anotaciones[0];
  assert.deepEqual(tamanoDeZona(z.a, z.b), { largo: 1, ancho: 1 });
  j = cambiarAnotacion(j, 0, "z", { medidas: true });
  assert.equal(j.fases[0].anotaciones[0].medidas, true);
  assert.equal(jugadaValida(JSON.parse(JSON.stringify(j))).fases[0].anotaciones[0].medidas, true);
  j = cambiarAnotacion(j, 0, "z", { medidas: false });
  assert.equal(JSON.parse(JSON.stringify(j)).fases[0].anotaciones[0].medidas, undefined);
});

test("petos: se ponen, se quitan y sobreviven a guardar y abrir", () => {
  const base = plantilla("rondo");
  const id = base.fichas[0].id;
  let j = cambiarFicha(base, id, { peto: "#f4e04d" });
  assert.equal(jugadaValida(JSON.parse(JSON.stringify(j))).fichas[0].peto, "#f4e04d");
  j = cambiarFicha(j, id, { peto: undefined });
  assert.equal(jugadaValida(JSON.parse(JSON.stringify(j))).fichas[0].peto, undefined);
  assert.equal(jugadaValida({ ...base, fichas: [{ ...base.fichas[0], peto: "amarillo" }] }).fichas[0].peto, undefined);
});

test("el tamaño del material: con límites, enlazado, animado entre fases y al buscar la pieza", () => {
  let j = agregarMaterial(libre(), 0, [{ id: "m1", tipo: "miniporteria", p: { x: 0, z: 0 }, giro: 0, color: "#ffffff" }]);
  j = agregarFase(j, 0, "Fase 2");
  j = cambiarMaterial(j, 0, "m1", { escala: 2 });
  assert.equal(j.fases[1].material[0].escala, 2);
  j = cambiarMaterial(j, 0, "m1", { escala: 9 });
  assert.equal(j.fases[0].material[0].escala, 3);
  j = cambiarMaterial(j, 0, "m1", { escala: 1 });
  assert.equal("escala" in j.fases[0].material[0], false);
  j = cambiarMaterial(j, 1, "m1", { escala: 2 });
  // Del tamaño de serie en la fase 1 al doble en la 2: a mitad de camino, entre los dos.
  const enMedio = materialEn(j, 0, j.fases[0].material[0], 0.5, true);
  assert.ok(enMedio.escala > 1 && enMedio.escala < 2);
  // Grande, se elige desde más lejos.
  j = moverMaterial(j, 1, "m1", { x: 0, z: 0 });
  assert.equal(materialCerca(j.fases[1], { x: 0, z: 1.9 }), "m1");
  assert.equal(materialCerca(j.fases[0], { x: 0, z: 1.9 }), null);
  assert.equal(jugadaValida(JSON.parse(JSON.stringify(j))).fases[1].material[0].escala, 2);
});

test("el plan de sesión: bloques en orden, minutos y lo guardado roto no rompe nada", () => {
  const a = { ...libre(), id: "ja" }, b = { ...libre(), id: "jb" };
  let plan = agregarBloque(agregarBloque(planVacio(), [a, b]), [a, b]);
  assert.deepEqual(plan.bloques.map((x) => x.jugadaId), ["ja", "jb"]);
  plan = cambiarBloque(plan, plan.bloques[0].id, { minutos: 20, notas: "Dos toques" });
  plan = cambiarBloque(plan, plan.bloques[1].id, { minutos: 500 });
  assert.equal(minutosTotales(plan, [a, b]), 200);
  assert.deepEqual(inicios(plan.bloques.map((x) => x.minutos)), [0, 20]);
  plan = moverBloque(plan, plan.bloques[1].id, -1);
  assert.equal(plan.bloques[0].jugadaId, "jb");
  // Un sistema borrado no sale en el PDF ni cuenta minutos.
  assert.equal(bloquesConSistema(plan, [a]).length, 1);
  assert.equal(minutosTotales(plan, [a]), 20);
  plan = quitarBloque(plan, plan.bloques[0].id);
  assert.equal(plan.bloques.length, 1);
  const leido = planValido(JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(leido, plan);
  assert.deepEqual(planValido(null).bloques, []);
  assert.equal(planValido({ fecha: "mañana", bloques: [{ jugadaId: "ja", minutos: "x" }, { nada: 1 }] }).bloques[0].minutos, 15);
});

test("al estirar un espacio, sus setas y porterías van con él; lo de dentro se queda", () => {
  let j = libre();
  const puesto = ponerEspacio(j, 0, espacio("reducido5"), { x: 0, z: 0 }, "#ffffff");
  j = agregarMaterial(puesto.jugada, 0, [{ id: "dentro", tipo: "cono", p: { x: 3, z: 2 }, giro: 0, color: "#ff5f1f" }]);
  j = estirarZona(j, 0, puesto.zona, { tamano: { largo: 50, ancho: 30 } });
  const material = j.fases[0].material;
  const setas = material.filter((m) => m.tipo === "seta").map((m) => [m.p.x, m.p.z]);
  assert.deepEqual(setas.slice(0, 4), [[-25, -15], [25, -15], [25, 15], [-25, 15]]);
  assert.deepEqual(material.filter((m) => m.tipo === "miniporteria").map((m) => m.p.x), [-25, 25]);
  assert.deepEqual(material.find((m) => m.id === "dentro").p, { x: 3, z: 2 });
  // Por una esquina: la de enfrente se queda; la seta de esa esquina va adonde se suelta.
  j = estirarZona(j, 0, puesto.zona, { caja: { a: { x: -25, z: -15 }, b: { x: 15, z: 5 } } });
  const z = j.fases[0].anotaciones.find((a) => a.id === puesto.zona);
  assert.deepEqual(tamanoDeZona(z.a, z.b), { largo: 40, ancho: 20 });
  assert.ok(j.fases[0].material.some((m) => m.tipo === "seta" && m.p.x === 15 && m.p.z === 5));
});
