import assert from "node:assert/strict";
import test from "node:test";
import { colorContrastante } from "../lib/colores.ts";

/**
 * El color del candidato se elige contra el del objetivo.
 *
 * El fallo que arregla: el objetivo tomaba el acento del cliente y el
 * candidato era un naranja rojizo fijo. Con Cavalry salían dos rojos a diez
 * grados de tono, y en un radar de dos áreas superpuestas eso significa no
 * saber quién es quién.
 */

const tono = (hex) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const separacion = (a, b) => { const d = Math.abs(tono(a) - tono(b)); return Math.min(d, 360 - d); };

test("ningún acento de cliente produce dos colores parecidos", () => {
  const acentos = [
    ["Cavalry", "#cd2b2b"],
    ["Maldonado", "#17804a"],
    ["neutro", "#6f747c"],
    ["azul", "#1f5fd6"],
    ["naranja", "#f97316"],
  ];
  for (const [nombre, acento] of acentos) {
    const d = separacion(acento, colorContrastante(acento));
    assert.ok(d >= 60, `${nombre}: solo ${d.toFixed(0)} grados entre los dos colores`);
  }
});

test("con el rojo de Cavalry sale el azul, que es el par más seguro", () => {
  assert.equal(colorContrastante("#cd2b2b"), "#1f5fd6");
});

test("con el verde de Maldonado el azul queda cerca, así que sale otro", () => {
  const elegido = colorContrastante("#17804a");
  assert.notEqual(elegido, "#1f5fd6");
  assert.ok(separacion("#17804a", elegido) > separacion("#17804a", "#1f5fd6"));
});

test("el par de antes habría fallado esta prueba", () => {
  // #cd2b2b contra #e95b3f, que es lo que había: diez grados.
  assert.ok(separacion("#cd2b2b", "#e95b3f") < 15);
});

test("cada conjunto va de un tono apagado a uno claro, y los de plataforma igual", async () => {
  const { SIMILARITY_METRIC_GROUPS, tonosDe } = await import("../lib/similarityMetricGroups.ts");
  const luz = (hex) => [1, 3, 5].reduce((suma, i) => suma + parseInt(hex.slice(i, i + 2), 16), 0);
  for (const grupo of SIMILARITY_METRIC_GROUPS) {
    assert.deepEqual(tonosDe(grupo.color), { bajo: grupo.bajo, alto: grupo.alto });
    assert.ok(luz(grupo.bajo) < luz(grupo.color) && luz(grupo.color) < luz(grupo.alto), grupo.id);
  }
  // Los de plataforma salen con la misma regla que los aprobados: el bajo de
  // Finalización es su color con el 35 % de #3A3A45.
  const statsbomb = tonosDe("#b0243a");
  assert.ok(luz(statsbomb.bajo) < luz("#b0243a") && luz("#b0243a") < luz(statsbomb.alto));
  assert.deepEqual(tonosDe("rgb(1,2,3)"), { bajo: "rgb(1,2,3)", alto: "rgb(1,2,3)" });
});

test("el texto sobre el color de un jugador se lee: oscuro sobre claro, blanco sobre oscuro", async () => {
  const { textoSobre } = await import("../lib/colores.ts");
  assert.equal(textoSobre("#f5f5f7"), "#0b0b0f");
  assert.equal(textoSobre("#ffffff"), "#0b0b0f");
  assert.equal(textoSobre("#111111"), "#ffffff");
  assert.equal(textoSobre("#ff3b30"), "#ffffff");
  assert.equal(textoSobre("#1f5fd6"), "#ffffff");
  assert.equal(textoSobre("rojo"), "#ffffff");
});
