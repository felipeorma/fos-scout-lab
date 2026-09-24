import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerReport } from "../lib/scouting.ts";

/**
 * Lo que se enseña y lo que ordena no son lo mismo.
 *
 * El radar dibuja todas las métricas del perfil. El índice deja fuera las que
 * no separan a nadie —medido sobre las dieciséis ligas: el 70% de los
 * delanteros tiene cero penales ganados— y cuenta una sola por familia de
 * métricas que miden lo mismo, porque el índice es un promedio y esa destreza
 * entraba cinco veces.
 */

const delantero = (nombre, i, extra = {}) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25,
  "Minutes played": 900, "Matches played": 10,
  "xG (SB)": 0.1 + i * 0.05,
  "NP Shots (SB)": 1 + i * 0.3,
  "Goals per 90 (SB)": 0.1 + i * 0.05,
  "NP PSxG (SB)": 0.1 + i * 0.05,
  "Touches in box (SB)": 2 + i * 0.5,
  "Aerial win % (SB)": 30 + i * 2,
  "Penalty Wins (SB)": i * 0.02,
  ...extra,
});

const base = (extraDelUltimo = {}) => Array.from({ length: 12 }, (_, i) => (
  i === 11 ? delantero(`P${i}`, i, extraDelUltimo) : delantero(`P${i}`, i)
));

test("la familia del remate entra una sola vez en el índice", () => {
  const informe = buildPlayerReport(base(), 11, 0, "CF");
  const familia = ["xG (SB)", "Remates (SB)", "Goles /90 (SB)", "PSxG sin penales (SB)"];
  const enElRadar = informe.metrics.filter((metrica) => familia.includes(metrica.label));
  assert.equal(enElRadar.length, 4, "el radar sigue enseñando las cuatro");
  // Tres de la familia y los penales quedan fuera del índice.
  assert.equal(informe.metricasDelIndice, informe.metrics.length - 4);
});

test("los penales ganados se ven pero no mueven el índice", () => {
  const conPenales = buildPlayerReport(base({ "Penalty Wins (SB)": 5 }), 11, 0, "CF");
  const sinPenales = buildPlayerReport(base({ "Penalty Wins (SB)": 0 }), 11, 0, "CF");
  assert.ok(conPenales.metrics.some((metrica) => metrica.label === "Penales ganados (SB)"));
  assert.equal(conPenales.indice, sinPenales.indice);
  // Y el centro del radar, que sí es la media de todo lo dibujado, sí cambia.
  assert.notEqual(conPenales.score, sinPenales.score);
});

test("mejorar en la métrica principal de la familia sí mueve el índice", () => {
  const flojo = buildPlayerReport(base({ "xG (SB)": 0.05 }), 11, 0, "CF");
  const bueno = buildPlayerReport(base({ "xG (SB)": 9 }), 11, 0, "CF");
  assert.ok(bueno.indice > flojo.indice, `${bueno.indice} debería superar a ${flojo.indice}`);
});

test("una elección manual de métricas manda sobre el recorte", () => {
  const elegidas = ["xG (SB)", "Remates (SB)", "Goles /90 (SB)", "Penales ganados (SB)"];
  const informe = buildPlayerReport(base(), 11, 0, "CF", elegidas);
  assert.equal(informe.metricasDelIndice, elegidas.length, "si el scout las pide, entran todas");
});
