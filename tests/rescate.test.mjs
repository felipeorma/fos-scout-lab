import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerReport } from "../lib/scouting.ts";

/**
 * Un jugador con minutos no se queda sin radar.
 *
 * Auditado sobre las dieciséis ligas en octubre de 2026: de 7.835 jugadores,
 * 256 daban "no encontramos métricas para esta cohorte" y solo 6 de ellos
 * tenían cero minutos. El resto eran filas a las que StatsBomb no da posición
 * (170, todas con menos de 100 minutos), filas sueltas de SkillCorner con solo
 * físicos, y bases pequeñas donde nadie del puesto llega al mínimo. La ficha
 * pide `rescate` y dice cómo consiguió el radar; el ranking y la similitud no
 * lo piden y siguen como estaban.
 */

const SB = { "Carries (SB)": 0, "OP key passes (SB)": 0, "Passing % (SB)": 0, "Tackles interceptions (SB)": 0, "Ball recoveries (SB)": 0 };

function fila(nombre, posicion, minutos, extra = {}) {
  return { Player: nombre, Team: "Club Test", Position: posicion, Age: 24, "Matches played": 20, "Minutes played": minutos, ...extra };
}

function base() {
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push(fila(`Extremo ${i}`, "RW", 1500, { ...SB, "Carries (SB)": 20 + i, "OP key passes (SB)": 1 + i / 10, "Passing % (SB)": 70 + i, "Tackles interceptions (SB)": 2 + i / 5, "Ball recoveries (SB)": 4 + i / 4, "PSV-99 (SC)": 30 + i / 10 }));
    rows.push(fila(`Central ${i}`, "CB", 1500, { ...SB, "Carries (SB)": 10 + i, "OP key passes (SB)": i / 20, "Passing % (SB)": 80 + i / 2, "Tackles interceptions (SB)": 4 + i / 5, "Ball recoveries (SB)": 6 + i / 4, "PSV-99 (SC)": 29 + i / 10 }));
  }
  return rows;
}

const indiceDe = (rows, nombre) => rows.findIndex((row) => row.Player === nombre);

test("sin posición registrada: se mide contra todos los de campo y se dice", () => {
  const rows = [...base(), fila("Sin Puesto", "", 74, { ...SB, "Carries (SB)": 25, "OP key passes (SB)": 1.5, "Passing % (SB)": 75, "Tackles interceptions (SB)": 3, "Ball recoveries (SB)": 5 })];
  const i = indiceDe(rows, "Sin Puesto");
  assert.equal(buildPlayerReport(rows, i, 500).metrics.length, 0, "sin rescate sigue vacío: el ranking no debe cambiar");
  const informe = buildPlayerReport(rows, i, 500, "AUTO", null, { rescate: true });
  assert.ok(informe.metrics.length > 0, "con rescate hay radar");
  assert.equal(informe.rescate, "sin-posicion");
  assert.equal(informe.cohortSize, 24, "contra los 24 de campo con el mínimo de minutos");
});

test("nadie de su posición llega al mínimo: se mide contra todos los de su posición", () => {
  const rows = base().map((row) => ({ ...row, "Minutes played": 300 }));
  const i = indiceDe(rows, "Extremo 3");
  assert.equal(buildPlayerReport(rows, i, 900).metrics.length, 0);
  const informe = buildPlayerReport(rows, i, 900, "AUTO", null, { rescate: true });
  assert.ok(informe.metrics.length > 0);
  assert.equal(informe.rescate, "sin-minimo");
  assert.equal(informe.cohortSize, 12);
});

test("una fila con solo físicos enseña los físicos en vez de quedarse en blanco", () => {
  const rows = [...base(), fila("Solo Fisico", "RW", 2400, { "PSV-99 (SC)": 31.5 })];
  const i = indiceDe(rows, "Solo Fisico");
  const informe = buildPlayerReport(rows, i, 500, "AUTO", null, { rescate: true });
  assert.ok(informe.metrics.length > 0);
  assert.ok(informe.metrics.every((metric) => metric.source === "skillcorner"), "solo lo que de verdad tiene");
  assert.ok(["solo-disponibles", undefined].includes(informe.rescate));
});

test("con cero minutos no hay nada que rescatar", () => {
  const rows = [...base(), fila("No Jugo", "RW", 0, {})];
  const informe = buildPlayerReport(rows, indiceDe(rows, "No Jugo"), 500, "AUTO", null, { rescate: true });
  assert.equal(informe.metrics.length, 0);
  assert.equal(informe.rescate, undefined);
  assert.equal(informe.minutes, 0);
});

test("el rescate no toca un informe que ya tenía métricas", () => {
  const rows = base();
  const i = indiceDe(rows, "Extremo 5");
  const sin = buildPlayerReport(rows, i, 500);
  const con = buildPlayerReport(rows, i, 500, "AUTO", null, { rescate: true });
  assert.deepEqual(con, sin);
});

test("una cohorte forzada que no encaja sigue vacía: la decisión de volver a la automática es de la ficha", () => {
  const rows = base();
  const informe = buildPlayerReport(rows, indiceDe(rows, "Extremo 5"), 500, "GK", null, { rescate: true });
  assert.equal(informe.metrics.length, 0);
});
