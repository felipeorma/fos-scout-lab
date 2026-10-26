import assert from "node:assert/strict";
import test from "node:test";
import { aplicar, homografia, invertir } from "../lib/homografia.ts";
import {
  LINEAS_DEL_CAMPO, PUNTOS_DEL_CAMPO, contornoDeMarca, desplazarMarca, marcaDeArrastre, proyectar, puntaEnCampo, puntoDeCampo, siguientePunto,
} from "../lib/perspectiva.ts";

const VERDAD = [0.0062, 0.0011, 0.5, -0.0004, 0.0049, 0.42, 0.0000, 0.0067, 1];

test("los puntos del campo son únicos y están dentro del campo", () => {
  const ids = PUNTOS_DEL_CAMPO.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of PUNTOS_DEL_CAMPO) assert.ok(Math.abs(x.p.x) <= 52.5 && Math.abs(x.p.y) <= 34, x.id);
  assert.deepEqual(puntoDeCampo("izquierda-penalti").p, { x: -41.5, y: 0 });
});

test("al calibrar, el siguiente punto es el próximo sin poner de la misma zona", () => {
  assert.equal(siguientePunto("izquierda-area-lejana", new Set(["izquierda-area-lejana"])), "izquierda-area-cercana");
  const casiTodos = new Set(PUNTOS_DEL_CAMPO.filter((x) => x.grupo === "medio" && x.id !== "centro").map((x) => x.id));
  assert.equal(siguientePunto("medio-lejano", casiTodos), "centro");
  assert.equal(siguientePunto("centro", new Set([...casiTodos, "centro"])), null);
});

test("la medialuna empieza y acaba en la línea del área", () => {
  const medialunas = LINEAS_DEL_CAMPO.filter((l) => l.length === 25);
  assert.equal(medialunas.length, 2);
  for (const arco of medialunas) for (const p of [arco[0], arco[arco.length - 1]]) assert.ok(Math.abs(Math.abs(p.x) - 36) < 1e-9);
});

test("una marca se dibuja proyectada y se mide de vuelta en metros", () => {
  const campo = ["izquierda-area-lejana", "izquierda-area-cercana", "izquierda-area-fondo-lejana", "izquierda-area-fondo-cercana"].map((id) => puntoDeCampo(id).p);
  const H = homografia(campo, campo.map((p) => aplicar(VERDAD, p)));
  const Hi = invertir(H);
  const m = marcaDeArrastre("medida", "m", { x: -41.5, y: 0 }, { x: -36, y: 0 }, "#fff");
  const [a, b] = contornoDeMarca(m).map((p) => aplicar(Hi, aplicar(H, p)));
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 5.5) < 1e-6);
  assert.equal(proyectar(H, contornoDeMarca({ id: "f", tipo: "fuera", x: -30, color: "#fff" })).length, 1);
  assert.equal(marcaDeArrastre("zona", "z", { x: 0, y: 0 }, { x: 0.1, y: 0.1 }, "#fff"), null);
  const c = marcaDeArrastre("circulo", "c", { x: 0, y: 0 }, { x: 3, y: 4 }, "#fff");
  assert.equal(c.r, 5);
  assert.deepEqual(desplazarMarca(c, 1, -1).c, { x: 1, y: -1 });
  assert.equal(desplazarMarca({ id: "f", tipo: "fuera", x: 50, color: "#fff" }, 10, 0).x, 52.5);
  assert.deepEqual(puntaEnCampo({ x: 0, y: 0 }, { x: 10, y: 0 })[0], { x: 10, y: 0 });
});
