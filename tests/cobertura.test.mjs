import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch } from "../lib/similarity.ts";
import { METRICAS_PARA_CONFIAR, encogerHaciaLaMedia } from "../lib/cobertura.ts";

/**
 * El sesgo por cobertura, que apareció al montar el buscador entre ligas.
 *
 * Un candidato de una liga con menos métricas se compara en menos dimensiones,
 * y menos dimensiones son menos ocasiones de diferir: salía primero por tener
 * peores datos, no por parecerse más. La pantalla corrige con un encogimiento
 * hacia la media ponderado por métricas; esto fija las dos mitades del asunto.
 */

/*
 * La misma corrección que aplica la pantalla, llamando al cálculo de verdad.
 * Antes esto era una copia del algoritmo escrita para la prueba, así que
 * verificaba una réplica y no el código que corre en producción: podían
 * separarse sin que nada lo avisara.
 */
function conCobertura(candidatos, totalMetricas) {
  if (!candidatos.length) return [];
  const usadas = candidatos.map((c) => Math.max(0, Math.round((c.coverage / 100) * totalMetricas)));
  const ajustados = encogerHaciaLaMedia(candidatos.map((c) => c.similarity), usadas);
  return candidatos
    .map((c, i) => ({ ...c, ajustado: Math.round(ajustados[i]) }))
    .sort((a, b) => b.ajustado - a.ajustado || b.coverage - a.coverage);
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


/*
 * El encogimiento salió de esta pantalla a lib/cobertura.ts cuando el ranking
 * necesitó la misma corrección: dos copias del mismo ajuste acabarían dando
 * órdenes distintos para la misma base. Lo de abajo prueba el cálculo suelto;
 * lo de arriba, que el buscador lo aplica donde toca.
 */

const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

test("no toca nada cuando todos tienen el mismo soporte", () => {
  const valores = [90, 70, 50, 30];
  const ajustados = encogerHaciaLaMedia(valores, [10, 10, 10, 10]);
  // El orden se conserva y la media también: encoger a todos por igual no
  // reordena a nadie.
  assert.deepEqual([...ajustados].sort((a, b) => b - a), ajustados);
  assert.ok(Math.abs(media(ajustados) - media(valores)) < 1e-9);
});

test("acerca más a la media a quien se apoya en menos métricas", () => {
  // Dos jugadores con el MISMO 90 y un tercero que baja la media, para que
  // haya hacia dónde encoger: con [90, 90] la media es 90 y no se mueve nadie.
  const valores = [90, 90, 30];
  const m = media(valores);
  const [conMuchas, conPocas] = encogerHaciaLaMedia(valores, [32, 2, 10]);
  assert.ok(Math.abs(conPocas - m) < Math.abs(conMuchas - m),
    "con dos métricas el número tiene que quedar más cerca de la media que con treinta y dos");
  assert.ok(conMuchas > conPocas, "y por tanto el sólido queda por encima del ruidoso");
});

test("un valor alto sostenido por poco cede ante uno algo menor pero sólido", () => {
  // Doce jugadores en la media y dos que destacan: uno con evidencia y otro
  // sin ella. Sin corregir gana el ruidoso; corregido, gana el sólido.
  const valores = [95, 88, ...Array(12).fill(60)];
  const soportes = [3, 17, ...Array(12).fill(17)];
  const ajustados = encogerHaciaLaMedia(valores, soportes);
  assert.ok(valores[0] > valores[1], "sin corregir manda el de 95");
  assert.ok(ajustados[1] > ajustados[0], "corregido tiene que mandar el de 88, que se apoya en 17 métricas");
});

test("con soporte igual a la constante, el valor queda a medio camino", () => {
  const valores = [100, 0];
  const m = media(valores);
  const [alto] = encogerHaciaLaMedia(valores, [METRICAS_PARA_CONFIAR, METRICAS_PARA_CONFIAR]);
  assert.ok(Math.abs(alto - (100 + m) / 2) < 1e-9);
});

test("soporte cero deja el valor en la media del grupo", () => {
  const valores = [100, 40, 40, 40];
  const [sinNada] = encogerHaciaLaMedia(valores, [0, 9, 9, 9]);
  assert.ok(Math.abs(sinNada - media(valores)) < 1e-9,
    "sin ninguna métrica detrás, lo único que se puede decir es la media");
});

test("aguanta una lista vacía y soportes que faltan", () => {
  assert.deepEqual(encogerHaciaLaMedia([], []), []);
  const r = encogerHaciaLaMedia([80, 40], []);
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => Math.abs(x - 60) < 1e-9), "sin soporte, todo a la media");
});
