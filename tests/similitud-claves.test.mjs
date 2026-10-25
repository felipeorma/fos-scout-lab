import assert from "node:assert/strict";
import test from "node:test";
import { clavesDeSimilitud, coincidenciasYDiferencias, duelosDeSimilitud } from "../lib/similitudClaves.ts";

/** Lo que la hoja de Similitud cuenta además del porcentaje, con la comparación real de Kjelsen y Bulkeley. */

const m = (key, label, objetivo, comparable) => ({ key, label, group: 0, weight: 1, targetValue: 0, candidateValue: 0, targetPercentile: objetivo, candidatePercentile: comparable, difference: 0 });
const metricas = [
  m("obv_regate", "OBV regate y conducción (SB)", 53, 12), m("pase", "Precisión de pase % (SB)", 78, 80),
  m("obv_pase", "OBV pase (SB)", 20, 38), m("prog", "Progresiones profundas (SB)", 49, 34),
  m("largo", "Precisión balón largo % (SB)", 86, 32), m("largos", "Balones largos (SB)", 51, 34),
  m("aereo_pct", "Aéreos ganados % (SB)", 7, 0), m("aereo", "Aéreos ganados (SB)", 11, 0),
  m("obv_def", "OBV defensivo (SB)", 45, 87), m("entradas", "Entradas (SB)", 2, 2),
  m("interc", "Intercepciones (SB)", 22, 44), m("bloqueos", "Bloqueos por remate (SB)", 90, 90),
  m("entradas_pct", "Entradas ganadas % (SB)", 75, 1),
];

test("coinciden las más cercanas y se separan las más lejanas, sin repetir", () => {
  const { coinciden, separan } = coincidenciasYDiferencias(metricas);
  assert.deepEqual(coinciden.slice(0, 3).sort(), ["bloqueos", "entradas", "pase"]);
  assert.deepEqual(separan.slice(0, 2), ["entradas_pct", "largo"]);
  assert.equal(new Set([...coinciden, ...separan]).size, coinciden.length + separan.length);
  assert.ok(coinciden.length <= 5 && separan.length <= 5);
  // Con pocas métricas no se repite ninguna entre las dos listas.
  const pocas = coincidenciasYDiferencias(metricas.slice(0, 3));
  assert.equal(pocas.coinciden.length + pocas.separan.length, 2);
});

test("los duelos: percentil medio, edad y minutos", () => {
  const duelos = duelosDeSimilitud(metricas, { edad: 20, minutos: 3131 }, { edad: 21, minutos: 891 });
  assert.deepEqual(duelos.map((d) => d.etiqueta), ["Percentil medio", "Edad", "Minutos"]);
  assert.equal(duelos[0].objetivo, 45);
  assert.equal(duelos[0].comparable, 35);
  assert.equal(duelos[2].comparable, 891);
});

test("las claves dicen en qué coinciden, quién gana dónde, las ligas y la muestra", () => {
  const claves = clavesDeSimilitud({
    metricas,
    objetivo: { nombre: "Aleksander Hammer Kjelsen", minutos: 3131, liga: "OBOS-ligaen" },
    comparable: { nombre: "James Andrew Bulkeley", minutos: 891, liga: "MLS Next Pro" },
  });
  assert.ok(claves.length >= 4 && claves.length <= 5, claves.join("\n"));
  assert.match(claves[0], /^Coinciden en/);
  assert.match(claves.join(" "), /Bulkeley supera a Kjelsen en OBV defensivo \(SB\) \(P87 frente a P45\)/);
  assert.match(claves.join(" "), /Kjelsen supera a Bulkeley en Entradas ganadas % \(SB\) \(P75 frente a P1\)/);
  assert.match(claves.join(" "), /más floja: MLS Next Pro \(Opta 56,0\) frente a OBOS-ligaen/);
  assert.match(claves.join(" "), /Poca muestra: Bulkeley con 891′ \(margen ±12\)/);
  assert.match(claves.join(" "), /Kjelsen con 3\.131′/, "separador de miles también en cuatro cifras");
});

test("sin ligas conocidas ni poca muestra, no se inventa nada", () => {
  const claves = clavesDeSimilitud({
    metricas: metricas.map((x) => ({ ...x, candidatePercentile: x.targetPercentile })),
    objetivo: { nombre: "A B", minutos: 2500, liga: null },
    comparable: { nombre: "C D", minutos: 2600, liga: null },
  });
  assert.equal(claves.length, 1);
  assert.match(claves[0], /^Coinciden en/);
});
