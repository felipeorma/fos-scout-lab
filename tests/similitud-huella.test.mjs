import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch } from "../lib/similarity.ts";
import { pesoPorRepetibilidad, PESO_SIN_MEDIR } from "../lib/fiabilidad.ts";

/**
 * El parecido se mide con la huella completa —todas las métricas de la base,
 * pesadas por lo que se repiten— salvo que el scout ponga su propia lente.
 */

const SIN_FILTROS = { query: "", position: "", secondaryRole: "", side: "", passport: "", minimumMinutes: 0, ageMin: null, ageMax: null };
// Delanteros: el perfil de Wyscout es igual de parecido para X e Y; solo las
// métricas de StatsBomb, fuera del perfil de la hoja, distinguen a X.
const delantero = (nombre, i, sb) => ({
  Player: nombre, Team: `T${i % 3}`, Position: "CF", Age: 25, "Minutes played": 1500, "Matches played": 18,
  "Goals per 90": 0.2 + i * 0.03, "xG per 90": 0.2 + i * 0.02, "Touches in box per 90": 3 + i * 0.3,
  "Accurate passes, %": 65 + i, "Received passes per 90": 15 + i,
  "Carries (SB)": sb, "Deep progressions (SB)": sb / 2, "OP passes (SB)": 20 + sb,
});
const fondo = Array.from({ length: 10 }, (_, i) => delantero(`F${i}`, i, 2 + i));
const filas = [
  delantero("Objetivo", 5, 14), delantero("X", 5, 14), delantero("Y", 5, 2),
  ...fondo,
];

test("por defecto, las métricas fuera del perfil también distinguen", () => {
  const busqueda = buildSimilaritySearch(filas, 0, SIN_FILTROS);
  const puesto = (nombre) => busqueda.candidates.findIndex((c) => c.name === nombre);
  assert.ok(puesto("X") < puesto("Y"), `X ${puesto("X")} · Y ${puesto("Y")}`);
  assert.equal(busqueda.candidates[0].name, "X");
});

test("con una lente propia (un peso tocado) se mide solo con el perfil", () => {
  const pesos = { "Goals per 90": 1.5 };
  const busqueda = buildSimilaritySearch(filas, 0, SIN_FILTROS, pesos);
  const x = busqueda.candidates.find((c) => c.name === "X");
  const y = busqueda.candidates.find((c) => c.name === "Y");
  assert.equal(x.similarity, y.similarity, "en el perfil X e Y son idénticos");
});

test("el peso de cada métrica es su repetibilidad, con suelo y valor por defecto", () => {
  assert.equal(pesoPorRepetibilidad("Pases JA (SB)"), 0.74);
  assert.equal(pesoPorRepetibilidad("Atajadas % (SB)"), 0.05);
  assert.equal(pesoPorRepetibilidad("Pases /90"), PESO_SIN_MEDIR);
});
