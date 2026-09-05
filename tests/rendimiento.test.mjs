import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport, headersOf } from "../lib/scouting.ts";

/**
 * Guardas de rendimiento del cruce y los informes.
 *
 * No miden segundos —eso depende de la máquina— sino las dos propiedades que
 * hacían inviable juntar muchas ligas: que el cruce creciera al cuadrado y
 * que cada informe recorriera la base entera solo para juntar sus cabeceras.
 */

const jugador = (nombre, club, i) => ({
  Player: nombre, Team: club, Position: "CF", Age: 24, "Minutes played": 900,
  "Matches played": 10, "Goals per 90": (i % 9) / 10, "xG per 90": (i % 7) / 10,
  "Shots on target, %": 30 + (i % 40), "Touches in box per 90": 2 + (i % 8),
  "Accurate passes, %": 60 + (i % 30), "Received passes per 90": 10 + (i % 25),
});

/** Apellidos distintos: sin coincidencias no hay fusiones, solo comparaciones. */
function baseDe(n, sufijo) {
  return {
    fileName: `Liga ${sufijo}`, season: 2026, provider: "wyscout",
    headers: Object.keys(jugador("x", "y", 0)),
    rows: Array.from({ length: n }, (_, i) => jugador(`Nombre${i}${sufijo} Apellido${i}${sufijo}`, `Club${i % 20}`, i)),
  };
}

test("el cruce no crece al cuadrado con el tamaño de la base", () => {
  const medir = (n) => {
    const inicio = process.hrtime.bigint();
    aggregateDatasets([baseDe(n, "a"), baseDe(n, "b")]);
    return Number(process.hrtime.bigint() - inicio) / 1e6;
  };
  medir(200); // calentar
  const chico = Math.max(medir(400), 1);
  const grande = medir(1600);
  // Cuadrático daría ~16×. Se deja margen amplio: lo que se vigila es el orden
  // de magnitud, no el reloj de una máquina concreta.
  assert.ok(grande / chico < 8,
    `cuadruplicar la base multiplicó el cruce por ${(grande / chico).toFixed(1)}, apunta a crecimiento cuadrático`);
});

test("las cabeceras de una base se calculan una vez, no en cada informe", () => {
  const filas = baseDe(300, "c").rows;
  const primera = headersOf(filas);
  assert.equal(headersOf(filas), primera, "debe devolver el mismo array recordado");
});

test("una base que cambia de tamaño recalcula sus cabeceras", () => {
  const filas = baseDe(10, "d").rows;
  const antes = headersOf(filas);
  filas.push({ ...filas[0], "Columna nueva": 1 });
  const despues = headersOf(filas);
  assert.notEqual(despues, antes);
  assert.ok(despues.includes("Columna nueva"));
});

test("el cruce sigue fusionando lo que debe tras la poda por apellido", () => {
  const resultado = aggregateDatasets([
    { fileName: "A", season: 2026, provider: "statsbomb", headers: ["Player", "Team", "Age", "Minutes played", "Matches played", "Goals per 90"],
      rows: [{ Player: "Sebastien Dewaele", Team: "Cavalry FC", Age: 27, "Minutes played": 900, "Matches played": 10, "Goals per 90": 0.2 }] },
    { fileName: "B", season: 2026, provider: "skillcorner", headers: ["Player", "Team", "Age", "Minutes played", "Matches played", "PSV-99 (SC)"],
      rows: [{ Player: "S. Dewaele", Team: "Cavalry", Age: 27, "Minutes played": 900, "Matches played": 10, "PSV-99 (SC)": 31 }] },
  ]);
  assert.equal(resultado.rows.length, 1, "el nombre abreviado debe seguir fusionándose con el completo");
});
