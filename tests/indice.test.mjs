import assert from "node:assert/strict";
import test from "node:test";
import { indiceDeScouting } from "../lib/scouting.ts";

/**
 * El índice tiene que premiar al que sobresale en algo, que es lo que la app
 * promete en pantalla, sin dejarse engañar por un pico suelto.
 */

const ESPECIALISTA = [99, 97, 95, 20, 15, 10, 25, 30, 12, 18];
const ESPIGA_SUELTA = [88, 42, 40, 43, 50, 47, 20, 38, 5, 8, 2, 7];
const REGULAR_SOLIDO = [68, 72, 65, 70, 66, 71, 69, 67, 64, 73];
const MEDIOCRE_PAREJO = [50, 52, 48, 51, 49, 50, 53, 47, 50, 51];
const ELITE_COMPLETO = [92, 88, 90, 85, 91, 87, 89, 86, 93, 84];

test("el especialista supera al mediocre parejo, que es lo que antes fallaba", () => {
  // Con el percentil medio a secas salía 42 contra 50: al revés de lo que
  // la mesa de detección promete en su propio encabezado.
  assert.ok(
    indiceDeScouting(ESPECIALISTA) > indiceDeScouting(MEDIOCRE_PAREJO),
    `especialista ${indiceDeScouting(ESPECIALISTA)} debería superar a mediocre ${indiceDeScouting(MEDIOCRE_PAREJO)}`,
  );
});

test("un pico aislado no basta: sigue por debajo del mediocre parejo", () => {
  // Emiliano Chavez daba P88 en entradas+intercepciones con P5 en
  // recuperaciones. Con 556 minutos eso es la muestra, no el jugador.
  assert.ok(
    indiceDeScouting(ESPIGA_SUELTA) < indiceDeScouting(MEDIOCRE_PAREJO),
    `espiga ${indiceDeScouting(ESPIGA_SUELTA)} no debería superar a mediocre ${indiceDeScouting(MEDIOCRE_PAREJO)}`,
  );
});

test("destacar en tres cosas no vale más que ser bueno en todas", () => {
  assert.ok(indiceDeScouting(REGULAR_SOLIDO) > indiceDeScouting(ESPECIALISTA));
  assert.ok(indiceDeScouting(ELITE_COMPLETO) > indiceDeScouting(REGULAR_SOLIDO));
});

test("con un perfil plano el índice es el percentil medio", () => {
  assert.equal(indiceDeScouting([50, 50, 50, 50]), 50);
  assert.equal(indiceDeScouting([70, 70, 70]), 70);
});

test("mejorar en una métrica nunca baja el índice", () => {
  const base = [40, 55, 60, 30, 45, 50];
  const antes = indiceDeScouting(base);
  for (let i = 0; i < base.length; i += 1) {
    const mejor = [...base];
    mejor[i] = Math.min(100, mejor[i] + 20);
    assert.ok(indiceDeScouting(mejor) >= antes, `subir la métrica ${i} bajó el índice`);
  }
});

test("sin métricas devuelve cero en vez de romper", () => {
  assert.equal(indiceDeScouting([]), 0);
});
