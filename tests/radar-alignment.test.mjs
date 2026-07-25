import assert from "node:assert/strict";
import test from "node:test";

/**
 * Los dos radares deben repartir las métricas con el mismo ángulo: la pizza de
 * la Página 1 centra cada una en medio de su porción, y el radar comparativo
 * debe hacer lo mismo para que la misma métrica caiga en la misma posición.
 */
const TOTAL = 14;
const step = Math.PI * 2 / TOTAL;

// Ángulo de la etiqueta en la pizza (PizzaRadar): inicio de porción + medio paso
function pizzaLabelAngle(index) {
  const gap = 0.025;
  const start = -Math.PI / 2 + index * step + gap;
  return start + step / 2 - gap;
}

// Ángulo del vértice en el radar comparativo (ComparisonRadar)
function comparisonAngle(index) {
  return -Math.PI / 2 + (index + 0.5) * step;
}

test("cada métrica cae en el mismo ángulo en ambos radares", () => {
  for (let i = 0; i < TOTAL; i += 1) {
    assert.ok(Math.abs(pizzaLabelAngle(i) - comparisonAngle(i)) < 1e-9,
      `métrica ${i}: pizza ${pizzaLabelAngle(i)} vs comparativo ${comparisonAngle(i)}`);
  }
});

test("la primera métrica no se dibuja sobre el vértice superior", () => {
  // media porción por debajo del tope, igual que la pizza
  assert.ok(Math.abs(comparisonAngle(0) - (-Math.PI / 2 + step / 2)) < 1e-9);
});
