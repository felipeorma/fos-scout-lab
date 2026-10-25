import assert from "node:assert/strict";
import test from "node:test";
import { METRIC_SOURCE_ORDER, buildPlayerReport } from "../lib/scouting.ts";
import { SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "../lib/similarityMetricGroups.ts";

/**
 * El radar se lee como el mapping de roles: un bloque por proveedor
 * (Wyscout → StatsBomb → SkillCorner) y, dentro, por categoría. Ordenar solo
 * por categoría mezclaba los proveedores dentro de cada color.
 */

const delantero = (nombre, i) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25,
  "Minutes played": 900, "Matches played": 10,
  // Wyscout
  "Goals per 90": 0.1 + i * 0.04, "xG per 90": 0.1 + i * 0.05, "Accurate passes, %": 60 + i,
  "Aerial duels won, %": 30 + i * 2, "Successful dribbles, %": 40 + i, "xA per 90": 0.05 + i * 0.02,
  // StatsBomb
  "xG (SB)": 0.1 + i * 0.05, "NP Shots (SB)": 1 + i * 0.3, "Fouls Won (SB)": 0.5 + i * 0.1,
  "Counterpressures (SB)": 2 + i * 0.4, "Aerial win % (SB)": 30 + i * 2,
  // SkillCorner
  "Runs in behind P30 (SC)": 1 + i * 0.2, "Box options P30 (SC)": 2 + i * 0.3,
});

test("las métricas salen por proveedor y, dentro de cada uno, por categoría", () => {
  const filas = Array.from({ length: 12 }, (_, i) => delantero(`P${i}`, i));
  const informe = buildPlayerReport(filas, 11, 0, "CF");
  const fuentes = informe.metrics.map((metrica) => metrica.source ?? "wyscout");
  assert.deepEqual([...new Set(fuentes)], ["wyscout", "statsbomb", "skillcorner"], "un bloque por proveedor, en el orden del mapping");
  const posicion = fuentes.map((fuente) => METRIC_SOURCE_ORDER.indexOf(fuente));
  assert.deepEqual(posicion, [...posicion].sort((a, b) => a - b), "ningún proveedor vuelve a aparecer después de otro");

  const rango = new Map(SIMILARITY_METRIC_GROUPS.map((grupo, indice) => [grupo.id, indice]));
  for (const fuente of METRIC_SOURCE_ORDER) {
    const categorias = informe.metrics
      .filter((metrica) => (metrica.source ?? "wyscout") === fuente)
      .map((metrica) => rango.get(similarityMetricGroup(metrica, informe.cohort).id));
    assert.deepEqual(categorias, [...categorias].sort((a, b) => a - b), `${fuente}: cada categoría en un solo arco`);
  }
});
