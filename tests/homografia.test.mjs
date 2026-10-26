import assert from "node:assert/strict";
import test from "node:test";
import { aplicar, bienRepartidos, errorMedio, homografia, invertir } from "../lib/homografia.ts";

// Una cámara de tele inventada: una proyección conocida del césped (metros) a la pantalla (0–1).
const VERDAD = [0.0062, 0.0011, 0.5, -0.0004, 0.0049, 0.42, 0.0000, 0.0067, 1];
const camara = (p) => aplicar(VERDAD, p);
const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;

test("con cuatro puntos del campo se recupera la proyección exacta", () => {
  const campo = [{ x: -36, y: -20.16 }, { x: -36, y: 20.16 }, { x: -52.5, y: -20.16 }, { x: -52.5, y: 20.16 }];
  const H = homografia(campo, campo.map(camara));
  assert.ok(H);
  for (const p of [{ x: 0, y: 0 }, { x: -41.5, y: 0 }, { x: 20, y: 30 }]) assert.ok(cerca(aplicar(H, p), camara(p)));
});

test("con más puntos y algo de ruido, mínimos cuadrados: el error queda en el orden del ruido", () => {
  const campo = [{ x: -52.5, y: -34 }, { x: 0, y: -34 }, { x: 0, y: 34 }, { x: -52.5, y: 34 }, { x: -36, y: -20.16 }, { x: -36, y: 20.16 }, { x: 0, y: 0 }];
  const ruido = [0.001, -0.0008, 0.0005, 0.0009, -0.0011, 0.0004, -0.0006];
  const pantalla = campo.map((p, i) => { const q = camara(p); return { x: q.x + ruido[i], y: q.y - ruido[i] }; });
  const H = homografia(campo, pantalla);
  assert.ok(H);
  assert.ok(errorMedio(H, campo, pantalla) < 0.002);
});

test("la inversa vuelve de la pantalla al césped: se mide en metros sobre la imagen", () => {
  const campo = [{ x: -36, y: -20.16 }, { x: -36, y: 20.16 }, { x: -52.5, y: -20.16 }, { x: -52.5, y: 20.16 }];
  const H = homografia(campo, campo.map(camara));
  const Hi = invertir(H);
  const a = aplicar(Hi, camara({ x: -41.5, y: 0 })), b = aplicar(Hi, camara({ x: -52.5, y: 0 }));
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 11) < 1e-6);
});

test("puntos en línea no sirven: no hay homografía", () => {
  const enLinea = [{ x: 0, y: -34 }, { x: 0, y: -9.15 }, { x: 0, y: 0 }, { x: 0, y: 34 }];
  assert.equal(bienRepartidos(enLinea), false);
  assert.equal(homografia(enLinea, enLinea.map(camara)), null);
  assert.equal(homografia(enLinea.slice(0, 3), enLinea.slice(0, 3).map(camara)), null);
});

test("lo que cae detrás del horizonte no se proyecta", () => {
  // Con h31 o h32 grandes, la recta w = 0 cruza el plano: los puntos de detrás dan null.
  const H = [1, 0, 0, 0, 1, 0, 0, -0.1, 1];
  assert.ok(aplicar(H, { x: 0, y: 5 }));
  assert.equal(aplicar(H, { x: 0, y: 20 }), null);
});

test("con una cámara de tele de verdad (inversa con h33 negativo) la imagen vuelve al césped", () => {
  // Fracciones de pantalla de una cámara alta tras la banda cercana, mirando al área izquierda.
  const campo = [{ x: -36, y: -20.16 }, { x: -36, y: 20.16 }, { x: -52.5, y: -20.16 }, { x: -52.5, y: 20.16 }, { x: 0, y: 0 }];
  const imagen = [
    { x: 0.45320535942764584, y: 0.41061987501956687 }, { x: 0.3780452637634703, y: 0.6403042275880512 },
    { x: 0.33247983785241475, y: 0.4058922955177956 }, { x: 0.1788568054625979, y: 0.627082398994967 },
    { x: 0.7725142335513082, y: 0.5134238320978679 },
  ];
  const H = homografia(campo, imagen);
  const Hi = invertir(H);
  const centro = aplicar(Hi, imagen[4]);
  assert.ok(centro && Math.hypot(centro.x, centro.y) < 1e-3);
  const medio = aplicar(Hi, { x: 0.7081682829762312, y: 0.37771405705701966 });
  assert.ok(medio && Math.abs(medio.x) < 1e-3 && Math.abs(medio.y + 34) < 1e-3);
});
