import assert from "node:assert/strict";
import test from "node:test";
import { rankingDeCohorte } from "../lib/ranking.ts";
import { buildPlayerReport, cohortOf } from "../lib/scouting.ts";

/**
 * El ranking por puesto.
 *
 * Dos propiedades que no se ven mirando la lista: que el atajo por posición
 * —descartar antes de construir el informe— devuelve exactamente lo mismo que
 * calcularle el informe a toda la base, y que "extremos directos" no sale
 * vacío. Lo segundo era un fallo real: DWING no lo produce nunca la detección
 * automática, así que buscarlo por la cohorte detectada no encontraba a nadie.
 */

const POSICIONES = ["GK", "LCB", "RCB", "LB", "RB", "DMF", "CMF", "AMF", "LW", "RW", "CF"];

function base(n = 90) {
  const filas = [];
  for (let i = 0; i < n; i += 1) {
    // Números deterministas pero no correlativos, para que el orden del
    // ranking no sea el orden de las filas.
    const v = (k) => ((i * 37 + k * 13) % 100) / 10;
    filas.push({
      Player: `Jugador ${i}`,
      Team: `Club ${i % 9}`,
      Position: POSICIONES[i % POSICIONES.length],
      Age: 18 + (i % 15),
      "Passport country": i % 3 === 0 ? "Canada" : "USA",
      "Minutes played": 300 + ((i * 97) % 1800),
      "Matches played": 10 + (i % 20),
      "Goals per 90": v(1),
      "xG per 90": v(2),
      "Assists per 90": v(3),
      "Shots per 90": v(4),
      "Accurate passes %": 50 + v(5) * 4,
      "Progressive runs per 90": v(6),
      "Successful dribbles %": 30 + v(7) * 5,
      "Defensive duels won %": 40 + v(8) * 4,
      "Aerial duels won %": 35 + v(9) * 5,
      "Interceptions per 90": v(10),
      "Touches in box per 90": v(11),
      "Save rate %": 50 + v(12) * 4,
      "Prevented goals per 90": v(13),
      "Conceded goals per 90": v(14),
      "Accurate long passes %": 40 + v(15) * 5,
      "Aerial duels per 90": v(16),
      "Exits per 90": v(17),
      "xG against per 90": v(18),
    });
  }
  return filas;
}

/** La versión anterior: informe a todo el mundo y descarte después. */
function rankingIngenuo(rows, perfil, minutosMin) {
  const salida = [];
  for (let indice = 0; indice < rows.length; indice += 1) {
    const informe = buildPlayerReport(rows, indice, minutosMin, "AUTO");
    if (!informe || informe.cohort !== perfil || informe.metrics.length < 4) continue;
    const minutos = Number(rows[indice]["Minutes played"]);
    if (Number.isFinite(minutos) && minutosMin > 0 && minutos < minutosMin) continue;
    salida.push({ indice, puntuacion: informe.indice });
  }
  return salida.sort((a, b) => b.puntuacion - a.puntuacion);
}

test("el atajo por posición devuelve lo mismo que calcular toda la base", () => {
  const filas = base();
  for (const perfil of ["GK", "CB", "FB", "DMF", "AM", "WING", "CF"]) {
    const porFila = (xs) => [...xs].sort((a, b) => a[0] - b[0]);
    const rapido = porFila(rankingDeCohorte(filas, perfil, 600).map((f) => [f.indice, f.puntuacionCruda]));
    const lento = porFila(rankingIngenuo(filas, perfil, 600).map((f) => [f.indice, f.puntuacion]));
    assert.deepEqual(rapido, lento, `difieren en ${perfil}`);
  }
});

test("extremos directos ya no sale vacío", () => {
  const filas = base();
  const extremos = rankingDeCohorte(filas, "WING", 600);
  const directos = rankingDeCohorte(filas, "DWING", 600);
  assert.ok(extremos.length > 0, "hace falta que haya extremos para que la prueba valga");
  assert.equal(directos.length, extremos.length, "se buscan entre los extremos, así que son los mismos jugadores");
  assert.deepEqual(
    directos.map((f) => f.indice).sort(),
    extremos.map((f) => f.indice).sort(),
  );
  // Antes del arreglo esto devolvía cero: ningún jugador tiene DWING como
  // cohorte detectada, porque la detección nunca la produce.
  assert.equal(filas.filter((fila) => cohortOf(fila.Position) === "DWING").length, 0);
});

test("el mínimo de minutos deja fuera a quien no llega", () => {
  const filas = base();
  const conMinimo = rankingDeCohorte(filas, "CB", 1500);
  assert.ok(conMinimo.every((f) => f.minutos >= 1500));
  assert.ok(conMinimo.length < rankingDeCohorte(filas, "CB", 0).length);
});

test("cada fila trae todos sus pasaportes y viene ordenada por índice", () => {
  const filas = rankingDeCohorte(base(), "CB", 0);
  assert.ok(filas.length > 1);
  for (let i = 1; i < filas.length; i += 1) {
    assert.ok(filas[i - 1].puntuacion >= filas[i].puntuacion, "el orden es descendente por índice");
  }
  assert.ok(filas.some((f) => f.pasaportes.includes("Canada")));
});

test("el ranking corrige por cobertura y conserva el índice crudo", () => {
  const filas = base();
  const r = rankingDeCohorte(filas, "CB", 0);
  assert.ok(r.length > 3);
  for (const f of r) {
    assert.equal(typeof f.puntuacionCruda, "number", "el índice sin corregir viaja con cada fila");
    assert.ok(f.metricas >= 4, "y también con cuántas métricas se calculó");
  }
  // Ordena por el corregido, no por el crudo.
  for (let i = 1; i < r.length; i += 1) {
    assert.ok(r[i - 1].puntuacion >= r[i].puntuacion);
  }
});

test("el corregido siempre cae entre el crudo y la media del puesto", () => {
  // La propiedad que define un encogimiento: nunca empuja más allá de la
  // media ni deja el valor donde estaba, salvo que ya estuviera en la media.
  const r = rankingDeCohorte(base(), "CB", 0);
  assert.ok(r.length > 3);
  const media = r.reduce((s, f) => s + f.puntuacionCruda, 0) / r.length;
  for (const f of r) {
    const [bajo, alto] = f.puntuacionCruda <= media ? [f.puntuacionCruda, media] : [media, f.puntuacionCruda];
    assert.ok(f.puntuacion >= Math.floor(bajo) && f.puntuacion <= Math.ceil(alto),
      `${f.jugador}: corregido ${f.puntuacion} fuera de [${bajo.toFixed(1)}, ${alto.toFixed(1)}]`);
  }
});

