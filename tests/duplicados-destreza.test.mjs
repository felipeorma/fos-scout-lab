import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerReport } from "../lib/scouting.ts";

/**
 * Una destreza, una métrica.
 *
 * Al enlazar StatsBomb sobre Wyscout entraban las dos versiones de lo mismo
 * y esa destreza pesaba el doble en el índice, que es la media de los
 * percentiles. Un delantero bueno de cabeza subía por partida doble.
 */

const delantero = (nombre, aereo, extra = {}) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25,
  "Minutes played": 900, "Matches played": 10,
  "Goals per 90": 0.5, "xG per 90": 0.5, "Shots on target, %": 40,
  "Touches in box per 90": 5, "Accurate passes, %": 75, "Received passes per 90": 20,
  "Aerial duels won, %": aereo, ...extra,
});

const conAmbasPlataformas = () => Array.from({ length: 12 }, (_, i) =>
  delantero(`P${i}`, 30 + i * 5, { "Aerial win % (SB)": 30 + i * 5 }));

test("el juego aéreo no entra dos veces por venir de dos plataformas", () => {
  const informe = buildPlayerReport(conAmbasPlataformas(), 11, 0, "CF");
  const aereas = informe.metrics.filter((m) => /aére/i.test(m.label));
  assert.equal(aereas.length, 1);
});

test("sin la segunda plataforma el radar no pierde nada", () => {
  const soloWyscout = Array.from({ length: 12 }, (_, i) => delantero(`P${i}`, 30 + i * 5));
  const informe = buildPlayerReport(soloWyscout, 11, 0, "CF");
  assert.ok(informe.metrics.some((m) => m.label === "Duelos aéreos ganados, %"));
});

test("con base de StatsBomb se queda la métrica de StatsBomb", () => {
  const soloSb = Array.from({ length: 12 }, (_, i) => {
    const fila = delantero(`P${i}`, 0, { "Aerial win % (SB)": 30 + i * 5 });
    delete fila["Aerial duels won, %"];
    return fila;
  });
  const informe = buildPlayerReport(soloSb, 11, 0, "CF");
  const aereas = informe.metrics.filter((m) => /aére/i.test(m.label));
  assert.equal(aereas.length, 1);
  assert.match(aereas[0].label, /\(SB\)/);
});

test("una elección manual de métricas manda sobre el descarte", () => {
  const informe = buildPlayerReport(conAmbasPlataformas(), 11, 0, "CF",
    ["Duelos aéreos ganados, %", "Aéreos ganados % (SB)", "Goles /90"]);
  const aereas = informe.metrics.filter((m) => /aére/i.test(m.label));
  assert.equal(aereas.length, 2, "si el scout pide las dos a propósito, salen las dos");
});

test("una tasa y un volumen de la misma acción siguen siendo métricas distintas", () => {
  // "Regates exitosos, %" mide eficacia; "Regates exitosos (SB)", volumen.
  const rows = Array.from({ length: 12 }, (_, i) =>
    delantero(`P${i}`, 50, { "Successful dribbles, %": 40 + i, "Successful dribbles (SB)": 1 + i * 0.2 }));
  const informe = buildPlayerReport(rows, 11, 0, "CF", ["Regates exitosos, %", "Regates exitosos (SB)"]);
  assert.equal(informe.metrics.length, 2);
});
