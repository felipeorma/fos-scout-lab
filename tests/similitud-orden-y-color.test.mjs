import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Guarda del orden y el color de los dos jugadores en la hoja de Similitud.
 *
 * El encabezado pone al objetivo a la izquierda y al comparable a la derecha.
 * La leyenda del radar, las insignias de percentil y los rótulos de las
 * tarjetas iban al revés (el comparable primero), y los nombres se pintaban
 * siempre en blanco aunque el comparable fuera rojo. Todo sigue el mismo
 * orden y cada nombre lleva el color de su jugador.
 */

const informe = readFileSync(new URL("../app/SimilarityReport.tsx", import.meta.url), "utf8");
const radar = readFileSync(new URL("../app/ComparisonRadar.tsx", import.meta.url), "utf8");

const antes = (texto, primero, segundo) => {
  const a = texto.indexOf(primero);
  const b = texto.indexOf(segundo);
  return a >= 0 && b >= 0 && a < b;
};

test("el encabezado pone al objetivo a la izquierda y al comparable a la derecha", () => {
  assert.ok(antes(informe, 'player={target} label={t("JUGADOR OBJETIVO")} side="left"', 'player={candidate} label={t("JUGADOR COMPARABLE")} side="right"'));
});

test("el nombre del encabezado lleva el color de su jugador", () => {
  assert.match(informe, /<b style=\{\{ color: colorSobreOscuro\(color\) \}\}>\{name\}<\/b>/);
});

test("la leyenda del radar nombra primero al objetivo, cada uno en su color", () => {
  assert.ok(antes(radar, 'className="target" style={{ color: targetColor }}', 'className="candidate" style={{ color: candidateColor }}'));
});

test("las insignias de percentil de cada métrica van con el objetivo a la izquierda", () => {
  assert.ok(antes(radar, '<g className="target">', '<g className="candidate">'));
});

test("las tarjetas dicen primero la marca del objetivo, con cada nombre en su color", () => {
  assert.match(informe, /fraseConColores\(t\("Marca = \{a\} · barra = \{b\}"\)/);
  assert.match(informe, /a: \{ texto: apellido\(target\.name\), color: target\.color \}/);
  assert.match(informe, /b: \{ texto: apellido\(candidate\.name\), color: candidate\.color \}/);
});
