import assert from "node:assert/strict";
import test from "node:test";
import { camposDeLiga, cuantil, desenfocar, mediaDeLiga, resumenesDeLiga } from "../lib/flujoPosesion.ts";

/**
 * El flujo de posesión: las rutas habituales de cada equipo como un mapa de
 * viento.
 *
 * Lo que se fija aquí son las tres reglas que separan un mapa legible de una
 * maraña: las direcciones no se promedian, la escala es de toda la liga y lo
 * poco transitado queda en calma. Y que el resumen en números —el promedio de
 * cada equipo— diga lo mismo que dibuja la cancha.
 */

// Una cancha de juguete: 6 × 4 celdas de 20 unidades, 16 direcciones.
const COLS = 6;
const FILAS = 4;
const DIRS = 16;
const CELDAS = COLS * FILAS;
const ESTE = 0; // hacia la portería rival
const SUR = 4; // y creciente: hacia la banda derecha del que ataca
const OESTE = 8; // hacia la portería propia
const NORTE = 12; // hacia la banda izquierda

let siguiente = 1;
function equipo(rutas, { partidos = 10, recorrido = {}, tiempo = {}, nombre } = {}) {
  const flujo = new Array(CELDAS * DIRS).fill(0);
  for (const [celda, direccion, cantidad] of rutas) flujo[celda * DIRS + direccion] += cantidad;
  const ident = siguiente++;
  return {
    equipo: ident,
    nombre: nombre ?? `Equipo ${ident}`,
    partidos,
    tramos: 0,
    flujo,
    recorrido: Array.from({ length: CELDAS }, (_, i) => recorrido[i] ?? 0),
    tiempo: Array.from({ length: CELDAS }, (_, i) => tiempo[i] ?? 0),
  };
}
const liga = (...equipos) => ({ liga: "Liga", temporada: "2026", partidos: 0, fallidos: 0, celda: 20, cols: COLS, filas: FILAS, direcciones: DIRS, equipos });
const celda = (c, f) => f * COLS + c;

test("un reparto parejo entre dos sentidos da dos corrientes, no una media nula", () => {
  /* Promediar el vector de una zona donde la mitad sale hacia una banda y la
     mitad hacia la otra da cero: la zona parecería en calma y escondería dos
     rutas. Deben salir las dos, cada una en su sentido. */
  const i = celda(2, 1);
  const { campos } = camposDeLiga(liga(equipo([[i, SUR, 500], [i, NORTE, 500]])), { detalle: 0, ancho: 0 });
  const [campo] = campos.values();
  const [principal, segunda] = campo.corrientes;
  assert.ok(principal.fuerza[i] > 0.9, "la zona no puede quedar en calma");
  assert.ok(segunda.fuerza[i] > 0.9, "la segunda corriente tiene el mismo peso");
  assert.ok(Math.abs(principal.uy[i]) > 0.99 && Math.abs(principal.ux[i]) < 0.01);
  assert.ok(principal.uy[i] * segunda.uy[i] < 0, "van en sentidos contrarios");
});

test("la segunda corriente solo aparece con un reparto parejo, o al subir el detalle", () => {
  const i = celda(2, 1);
  const datos = liga(equipo([[i, ESTE, 700], [i, NORTE, 300]]));
  const poco = camposDeLiga(datos, { detalle: 0, ancho: 0 }).campos.values().next().value;
  const mucho = camposDeLiga(datos, { detalle: 1, ancho: 0 }).campos.values().next().value;
  assert.equal(poco.corrientes[1].fuerza[i], 0, "un 70/30 no es una bifurcación con poco detalle");
  assert.ok(mucho.corrientes[1].fuerza[i] > 0, "con todo el detalle, la ruta secundaria se ve");
  assert.ok(poco.corrientes[0].ux[i] > 0.99, "la principal sigue siendo la dominante");
});

test("la escala es de la liga: el mismo tráfico por partido pesa lo mismo en los dos equipos", () => {
  const ruta = [[celda(1, 1), ESTE, 400], [celda(2, 1), ESTE, 400], [celda(3, 1), ESTE, 400]];
  const a = equipo(ruta, { partidos: 10 });
  const gemelo = equipo(ruta, { partidos: 10 });
  const mitad = equipo(ruta, { partidos: 20 });
  const { campos } = camposDeLiga(liga(a, gemelo, mitad), { detalle: 0.5, ancho: 0 });
  const i = celda(2, 1);
  assert.equal(campos.get(a.equipo).intensidad[i], campos.get(gemelo.equipo).intensidad[i]);
  assert.ok(campos.get(mitad.equipo).intensidad[i] < campos.get(a.equipo).intensidad[i],
    "con el mismo total en el doble de partidos, la ruta es más fina");
  assert.ok(campos.get(mitad.equipo).particulas < campos.get(a.equipo).particulas);
});

test("lo poco transitado queda en calma, sin ruido tenue", () => {
  const todas = Array.from({ length: CELDAS }, (_, i) => i);
  const intenso = equipo(todas.map((i) => [i, ESTE, 1000 + i * 40]));
  const flojo = equipo(todas.map((i) => [i, ESTE, 20]));
  const { campos } = camposDeLiga(liga(intenso, flojo), { detalle: 0, ancho: 0 });
  assert.ok(campos.get(flojo.equipo).intensidad.every((valor) => valor === 0));
  assert.equal(campos.get(flojo.equipo).particulas, 0);
  assert.ok(campos.get(intenso.equipo).intensidad.some((valor) => valor > 0));
});

test("más detalle nunca quita rutas", () => {
  const rutas = Array.from({ length: CELDAS }, (_, i) => [i, (i * 5) % DIRS, 50 + i * 37]);
  const datos = liga(equipo(rutas), equipo(rutas.map(([i, d, n]) => [i, (d + 3) % DIRS, n * 0.6])));
  const activas = (detalle) => [...camposDeLiga(datos, { detalle, ancho: 0.3 }).campos.values()]
    .reduce((suma, campo) => suma + campo.intensidad.filter((valor) => valor > 0).length, 0);
  assert.ok(activas(0) <= activas(0.5));
  assert.ok(activas(0.5) <= activas(1));
  assert.ok(activas(1) > activas(0));
});

test("la rapidez es la posición de la velocidad del balón en la liga", () => {
  const i = celda(2, 1);
  const ruta = [[i, ESTE, 500]];
  const lento = equipo(ruta, { recorrido: { [i]: 500 }, tiempo: { [i]: 100 } });
  const rapido = equipo(ruta, { recorrido: { [i]: 500 }, tiempo: { [i]: 50 } });
  const { campos } = camposDeLiga(liga(lento, rapido), { detalle: 0.5, ancho: 0 });
  const a = campos.get(lento.equipo);
  const b = campos.get(rapido.equipo);
  assert.ok(b.rapidez[i] > a.rapidez[i]);
  assert.ok(a.rapidez[i] >= 0 && b.rapidez[i] <= 1);
  assert.ok(Math.abs(b.velocidad[i] - 2 * a.velocidad[i]) < 1e-3, "el doble de rápido en m/s");
});

test("el desenfoque no apaga las celdas de la orilla", () => {
  const plano = new Float32Array(CELDAS).fill(3);
  for (const valor of desenfocar(plano, COLS, FILAS, 1.5)) assert.ok(Math.abs(valor - 3) < 1e-5);
});

test("el promedio de cada equipo: recorrido por partido, carriles, sentido y velocidad por tercio", () => {
  // Fila 0 (y 0–20) es el carril izquierdo; fila 3 (y 60–80), el derecho.
  // Columna 0 (x 0–20) es la salida; columna 5 (x 100–120), el último tercio.
  const datos = liga(equipo([[celda(0, 0), ESTE, 100], [celda(5, 3), OESTE, 100]], {
    partidos: 4,
    recorrido: { [celda(0, 0)]: 100, [celda(5, 3)]: 100 },
    tiempo: { [celda(0, 0)]: 10, [celda(5, 3)]: 25 },
  }));
  const [resumen] = resumenesDeLiga(datos);
  assert.ok(Math.abs(resumen.metros - (200 / 4) * 0.9144) < 1e-9);
  assert.deepEqual(resumen.carriles, [0.5, 0, 0.5]);
  assert.equal(resumen.adelante, 0.5);
  assert.equal(resumen.atras, 0.5);
  assert.ok(Math.abs(resumen.velocidad[0] - 10 * 0.9144) < 1e-9);
  assert.ok(Number.isNaN(resumen.velocidad[1]), "sin balón en el medio, sin velocidad");
  assert.ok(Math.abs(resumen.velocidad[2] - 4 * 0.9144) < 1e-9);
  assert.ok(Math.abs(resumen.velocidadMedia - (200 / 35) * 0.9144) < 1e-9);
});

test("la media de la liga ignora lo que no se pudo medir", () => {
  const media = mediaDeLiga([
    { metros: 100, carriles: [0.2, 0.5, 0.3], adelante: 0.4, atras: 0.2, velocidad: [6, Number.NaN, 8], velocidadMedia: 7 },
    { metros: 300, carriles: [0.4, 0.3, 0.3], adelante: 0.6, atras: 0.1, velocidad: [8, 7, 6], velocidadMedia: 7 },
  ]);
  assert.equal(media.metros, 200);
  assert.equal(media.velocidad[1], 7);
  assert.ok(Math.abs(media.carriles[0] - 0.3) < 1e-12);
});

test("cuantil interpola entre vecinos", () => {
  assert.equal(cuantil([0, 10], 0.5), 5);
  assert.equal(cuantil([1, 2, 3], 1), 3);
  assert.ok(Number.isNaN(cuantil([], 0.5)));
});
