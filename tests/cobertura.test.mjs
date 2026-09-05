import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch } from "../lib/similarity.ts";

/**
 * El sesgo por cobertura, que apareció al montar el buscador entre ligas.
 *
 * Un candidato de una liga con menos métricas se compara en menos dimensiones,
 * y menos dimensiones son menos ocasiones de diferir: salía primero por tener
 * peores datos, no por parecerse más. La pantalla corrige con un encogimiento
 * hacia la media ponderado por métricas; esto fija las dos mitades del asunto.
 */

const METRICAS_PARA_CONFIAR = 8;
function conCobertura(candidatos, totalMetricas) {
  if (!candidatos.length) return [];
  const media = candidatos.reduce((suma, c) => suma + c.similarity, 0) / candidatos.length;
  return candidatos.map((c) => {
    const usadas = Math.max(0, Math.round((c.coverage / 100) * totalMetricas));
    return { ...c, ajustado: Math.round((usadas * c.similarity + METRICAS_PARA_CONFIAR * media) / (usadas + METRICAS_PARA_CONFIAR)) };
  }).sort((a, b) => b.ajustado - a.ajustado || b.coverage - a.coverage);
}

const delantero = (nombre, aereo, extra = {}) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25, "Minutes played": 900, "Matches played": 10,
  "Goals per 90": 0.5, "xG per 90": 0.5, "Shots on target, %": 40, "Touches in box per 90": 5,
  "Accurate passes, %": 75, "Received passes per 90": 20, "Aerial duels won, %": aereo, ...extra,
});

function fondoMixto() {
  const rica = Array.from({ length: 10 }, (_, i) => delantero(`Rica${i}`, 50 + i, {
    "Runs in behind P30 (SC)": 2 + i * 0.3, "Dangerous runs behind P30 (SC)": 1 + i * 0.2,
    "Runs received P30 (SC)": 1 + i * 0.2, "Box options P30 (SC)": 3 + i * 0.2,
  }));
  const pobre = Array.from({ length: 10 }, (_, i) => delantero(`Pobre${i}`, 50 + i));
  return [...rica, ...pobre];
}

const SIN_FILTROS = {
  query: "", position: "", secondaryRole: "", side: "", passport: "",
  minimumMinutes: 0, ageMin: null, ageMax: null,
};

test("sin corregir, la liga con menos métricas se cuela arriba", () => {
  const resultado = buildSimilaritySearch(fondoMixto(), 0, SIN_FILTROS);
  const primero = resultado.candidates[0];
  assert.ok(primero.coverage < 100, "el primero sin corregir viene de la liga pobre en datos");
  assert.equal(primero.similarity, 100);
});

test("la corrección por cobertura devuelve el primer puesto a quien tiene datos completos", () => {
  const resultado = buildSimilaritySearch(fondoMixto(), 0, SIN_FILTROS);
  const ordenados = conCobertura(resultado.candidates, resultado.target.metrics.length);
  assert.equal(ordenados[0].coverage, 100);
});

test("con cobertura completa la corrección no reordena nada", () => {
  const soloRica = Array.from({ length: 12 }, (_, i) => delantero(`R${i}`, 40 + i * 2));
  const resultado = buildSimilaritySearch(soloRica, 0, SIN_FILTROS);
  const ordenados = conCobertura(resultado.candidates, resultado.target.metrics.length);
  assert.deepEqual(
    ordenados.map((c) => c.name),
    resultado.candidates.map((c) => c.name),
  );
});
