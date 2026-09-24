import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPUESTAS,
  aVertical,
  densidad,
  enjambre,
  familiasCompuestas,
  fuenteStatsbomb,
  rejilla,
} from "../lib/snapshot.ts";

/**
 * La ficha ampliada: familias compuestas y los agregados de los mapas.
 */

test("ninguna métrica entra en dos familias", () => {
  const vistas = new Map();
  for (const familia of COMPUESTAS) {
    for (const columna of familia.columnas) {
      assert.ok(!vistas.has(columna), `${columna} está en ${vistas.get(columna)} y en ${familia.id}`);
      vistas.set(columna, familia.id);
    }
  }
});

const jugador = (nombre, k, extra = {}) => {
  const fila = { Player: nombre, Team: "T", Position: "RDMF", Age: 25, "Minutes played": 1500, "Matches played": 18 };
  for (const familia of COMPUESTAS) for (const columna of familia.columnas) fila[columna] = 10 + k;
  return { ...fila, ...extra };
};

test("las familias son la media de las desviaciones típicas contra la misma posición", () => {
  const filas = Array.from({ length: 11 }, (_, i) => jugador(`P${i}`, i));
  // Un delantero con números enormes no debe mover la escala de los pivotes.
  filas.push({ ...jugador("Delantero", 500), Position: "CF" });
  const grupo = familiasCompuestas(filas, "DMF", 0);
  assert.equal(grupo.indices.length, 11);
  const medio = grupo.valores.get(5).construccion;
  assert.ok(Math.abs(medio.z) < 1e-9, "el del medio queda en cero");
  assert.equal(medio.percentil, 50);
  assert.ok(grupo.valores.get(10).progresion.z > 1.5);
  assert.ok(grupo.valores.get(0).progresion.z < -1.5);
});

test("el jugador objetivo se puntúa aunque no llegue al mínimo de minutos", () => {
  const filas = Array.from({ length: 10 }, (_, i) => jugador(`P${i}`, i));
  filas.push(jugador("Suplente", 9, { "Minutes played": 200 }));
  const grupo = familiasCompuestas(filas, "DMF", 900, 10);
  assert.equal(grupo.indices.includes(10), false, "no forma parte del grupo");
  assert.ok(grupo.valores.get(10)?.amenaza, "pero tiene sus familias");
});

test("con menos de la mitad de las métricas de una familia no se inventa el número", () => {
  const filas = Array.from({ length: 10 }, (_, i) => {
    const fila = jugador(`P${i}`, i);
    // Construcción tiene cuatro métricas; solo queda una.
    delete fila["Passing % (SB)"]; delete fila["Pressured pass % (SB)"]; delete fila["OP xG buildup (SB)"];
    return fila;
  });
  const grupo = familiasCompuestas(filas, "DMF", 0);
  assert.equal(grupo.valores.get(3).construccion, undefined);
  assert.ok(grupo.valores.get(3).progresion);
});

test("las zonas del campo: la fila 0 es la portería rival y la columna 0 la banda izquierda", () => {
  const { conteos, total } = rejilla([[119, 1], [1, 79], [60, 40]]);
  assert.equal(total, 3);
  assert.equal(conteos[0][0], 1, "junto a la portería rival, por la izquierda");
  assert.equal(conteos[5][4], 1, "junto a la propia, por la derecha");
  assert.equal(conteos[3][2], 1, "el centro del campo");
});

test("de StatsBomb a campo vertical: el ataque va hacia arriba", () => {
  assert.deepEqual(aVertical([120, 40]), [40, 0]);
  assert.deepEqual(aVertical([0, 0]), [0, 120]);
});

test("el mapa de calor se normaliza a 1 en la zona con más acciones", () => {
  const puntos = [...Array(20).fill([100, 40]), [20, 10]];
  const { celdas } = densidad(puntos);
  const todas = celdas.flat();
  assert.equal(Math.max(...todas), 1);
  assert.ok(todas.every((v) => v >= 0 && v <= 1));
});

test("el enjambre no pisa puntos y es siempre el mismo", () => {
  const xs = [10, 10.5, 11, 11.2, 30, 30.1, 30.2, 30.3, 30.4];
  const r = 3;
  const ys = enjambre(xs, r);
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const distancia = Math.hypot(xs[i] - xs[j], ys[i] - ys[j]);
      assert.ok(distancia >= r * 1.9 - 1e-9, `se pisan ${i} y ${j}`);
    }
  }
  assert.deepEqual(enjambre(xs, r), ys);
});

test("de la columna de fuentes sale la liga y la temporada de StatsBomb", () => {
  assert.deepEqual(fuenteStatsbomb("SkillCorner · Eerste Divisie 2025/2026, StatsBomb · Eerste Divisie 2025/2026"), { liga: "Eerste Divisie", temporada: "2025/2026" });
  assert.deepEqual(fuenteStatsbomb("StatsBomb · Canadian Premier League 2025"), { liga: "Canadian Premier League", temporada: "2025" });
  assert.equal(fuenteStatsbomb("liga-uno.csv"), null, "un archivo de Wyscout no tiene eventos");
});
