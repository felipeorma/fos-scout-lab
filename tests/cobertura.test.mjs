import assert from "node:assert/strict";
import test from "node:test";
import { buildSimilaritySearch } from "../lib/similarity.ts";
import { METRICAS_PARA_CONFIAR, encogerHaciaLaMedia, ordenarPorCobertura } from "../lib/cobertura.ts";

/**
 * El sesgo por cobertura, que apareció al montar el buscador entre ligas.
 *
 * Un candidato de una liga con menos métricas se compara en menos dimensiones,
 * y menos dimensiones son menos ocasiones de diferir: salía primero por tener
 * peores datos, no por parecerse más. La pantalla corrige con un encogimiento
 * hacia la media ponderado por métricas; esto fija las dos mitades del asunto.
 */

// La misma función que ordena la lista de Similitud: se prueba el código que corre, no una copia.
const conCobertura = ordenarPorCobertura;

/*
 * Las métricas de Wyscout varían con el jugador, como en una base de verdad:
 * la similitud mide en desviaciones típicas y una columna constante no
 * distingue a nadie, así que no cuenta. Las dos ligas comparten esos valores
 * (dependen solo de `aereo`); la rica añade además las de SkillCorner.
 */
const delantero = (nombre, aereo, extra = {}) => ({
  Player: nombre, Team: "T", Position: "CF", Age: 25, "Minutes played": 900, "Matches played": 10,
  "Goals per 90": 0.3 + aereo / 200, "xG per 90": 0.25 + aereo / 220, "Shots on target, %": aereo * 0.8, "Touches in box per 90": aereo / 10,
  "Accurate passes, %": 60 + aereo / 4, "Received passes per 90": aereo / 3, "Aerial duels won, %": aereo, ...extra,
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

test("nombres cortos del mismo jugador entre plataformas", async () => {
  const { aggregateDatasets } = await import("../lib/scouting.ts");
  const fila = (nombre, edad, extra = {}) => ({
    Player: nombre, Team: "Boreham Wood", Position: "CB", Age: edad,
    "Minutes played": 1800, "Matches played": 20,
    "Defensive duels won %": 55, "Aerial duels won %": 60, "Interceptions per 90": 5,
    "Accurate passes %": 80, ...extra,
  });
  const cruzar = (a, b) => aggregateDatasets([
    { fileName: "StatsBomb · Liga 2026", season: 2026, headers: Object.keys(a), rows: [a], provider: "statsbomb" },
    { fileName: "SkillCorner · Liga 2026", season: 2026, headers: Object.keys(b), rows: [b], provider: "skillcorner" },
  ]).rows;

  // Casos vistos sin enlazar en la base real: el nombre de registro contra el
  // corto, mismo club y misma edad.
  assert.equal(cruzar(fila("Oluwafemi Ilesanmi", 35), fila("Femi Ilesanmi", 35)).length, 1);
  assert.equal(cruzar(fila("Oluwarotimi Mark Odusina", 26), fila("Timi Odusina", 26)).length, 1);
  assert.equal(cruzar(fila("Emmanuel Omrore", 27), fila("Manny Omrore", 27)).length, 1);
  assert.equal(cruzar(fila("Paulin Daniel Goprou", 27), fila("Dany Goprou", 27)).length, 1);
});

test("dos personas distintas con el mismo apellido siguen separadas", async () => {
  const { aggregateDatasets } = await import("../lib/scouting.ts");
  const fila = (nombre, edad) => ({
    Player: nombre, Team: "Vancouver Whitecaps II", Position: "CB", Age: edad,
    "Minutes played": 1200, "Matches played": 15,
    "Defensive duels won %": 55, "Aerial duels won %": 60, "Interceptions per 90": 5,
    "Accurate passes %": 80,
  });
  const cruzar = (a, b) => aggregateDatasets([
    { fileName: "StatsBomb · Liga 2026", season: 2026, headers: Object.keys(a), rows: [a], provider: "statsbomb" },
    { fileName: "SkillCorner · Liga 2026", season: 2026, headers: Object.keys(b), rows: [b], provider: "skillcorner" },
  ]).rows;
  // Ampliar la regla de nombres cortos no puede juntar a estos: son dos
  // jugadores del mismo club con diecinueve años de diferencia.
  assert.equal(cruzar(fila("Liam Campagna", 17), fila("Luigi Campagna", 36)).length, 2);
  assert.equal(cruzar(fila("Lowell Wright", 23), fila("Tre Wright", 22)).length, 2);
});

test("lo que su liga no publica no le resta: mismo parecido, mismo ajustado", async () => {
  const { coberturaDeLigas } = await import("../lib/cobertura.ts");
  // Dos ligas; la segunda no publica la métrica M4 (de SkillCorner, por ejemplo).
  const filas = [
    ...Array.from({ length: 8 }, () => ({ M1: 1, M2: 1, M3: 1, M4: 1 })),
    ...Array.from({ length: 8 }, () => ({ M1: 1, M2: 1, M3: 1 })),
  ];
  // Un fichaje fusionado de la primera a la segunda no hace que la segunda "publique" M4.
  filas.push({ M1: 1, M2: 1, M3: 1, M4: 1 });
  const ligas = filas.map((_, i) => [i < 8 ? "Con 2026" : "Sin 2026"]);
  const cobertura = coberturaDeLigas(filas, ligas, ["M1", "M2", "M3", "M4"]);
  assert.equal(cobertura(0).disponibles, 4);
  assert.equal(cobertura(9).disponibles, 3, "su liga no publica M4");
  const candidatos = [
    { name: "Con", index: 0, similarity: 80, coverage: 100 },
    { name: "Sin", index: 9, similarity: 80, coverage: 75 },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Resto${i}`, index: 1 + (i % 7), similarity: 50 + i, coverage: 100 })),
  ];
  const antes = ordenarPorCobertura(candidatos, 4);
  const ahora = ordenarPorCobertura(candidatos, 4, (c) => cobertura(c.index));
  const de = (lista, nombre) => lista.find((c) => c.name === nombre).ajustado;
  assert.ok(de(antes, "Con") > de(antes, "Sin"), "antes le restaba lo que su liga no publica");
  assert.equal(de(ahora, "Con"), de(ahora, "Sin"));
});

test("lo que le falta a él con su liga publicándolo sí le resta", () => {
  const candidatos = [
    { name: "Completo", similarity: 80, coverage: 100 },
    { name: "Sin sus datos", similarity: 80, coverage: 60 },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Resto${i}`, similarity: 50 + i, coverage: 100 })),
  ];
  const mismaLiga = () => ({ disponibles: 10 });
  const ordenados = ordenarPorCobertura(candidatos, 10, mismaLiga);
  const de = (nombre) => ordenados.find((c) => c.name === nombre).ajustado;
  assert.ok(de("Completo") > de("Sin sus datos"), "su liga lo publica: el hueco es suyo");
});
