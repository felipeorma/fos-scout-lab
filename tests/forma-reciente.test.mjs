import assert from "node:assert/strict";
import test from "node:test";
import { compararForma, filaConLaForma } from "../lib/formaReciente.ts";

test("la fila de la forma sustituye las métricas y deja vacías las que no hay por partido", () => {
  const original = { Player: "Adam Pearlman", "Minutes played": 2552, "Pass OBV (SB)": 0.24, "PAdj tackles interceptions (SB)": 3.1, "PSV-99 (SC)": 30.3 };
  const reciente = filaConLaForma(original, { "Pass OBV (SB)": 0.21 });
  assert.equal(reciente["Pass OBV (SB)"], 0.21);
  assert.equal(reciente["PAdj tackles interceptions (SB)"], "");
  assert.equal(reciente["PSV-99 (SC)"], "");
  // Lo que no es una métrica (nombre, minutos) se queda como estaba.
  assert.equal(reciente.Player, "Adam Pearlman");
  assert.equal(reciente["Minutes played"], 2552);
  assert.equal(original["Pass OBV (SB)"], 0.24);
});

test("compara métrica a métrica, de lo que más sube a lo que más baja, y cuenta las que faltan", () => {
  const m = (key, percentile, value = 1) => ({ key, label: key, value, percentile, group: 1 });
  const { cambios, sinDato } = compararForma(
    [m("a", 50), m("b", 80), m("c", 30), m("d", 60)],
    [m("a", 70), m("b", 60), m("c", 30), m("d", 0, Number.NaN)],
  );
  assert.deepEqual(cambios.map((c) => [c.key, c.cambio]), [["a", 20], ["c", 0], ["b", -20]]);
  assert.equal(sinDato, 1);
});
