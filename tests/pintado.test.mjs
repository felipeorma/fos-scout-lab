import assert from "node:assert/strict";
import test from "node:test";
import { desplazar, duplicar, escalar, idDeYoutube, inicioDeYoutube, limites, tocaTrazo, trazoEn } from "../lib/pintado.ts";

const trazo = (tipo, puntos, extra = {}) => ({ id: tipo, tipo, puntos, color: "#ff3b30", relleno: "", grosor: 4, opacidad: 1, ...extra });

test("el id de YouTube sale de cualquier forma de enlace", () => {
  const id = "dQw4w9WgXcQ";
  for (const enlace of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://youtu.be/${id}?t=10`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}`,
    id,
  ]) assert.equal(idDeYoutube(enlace), id, enlace);
  assert.equal(idDeYoutube("https://vimeo.com/123"), null);
  assert.equal(idDeYoutube("no es un enlace"), null);
});

test("el segundo de inicio de un enlace", () => {
  assert.equal(inicioDeYoutube("https://youtu.be/dQw4w9WgXcQ?t=90"), 90);
  assert.equal(inicioDeYoutube("https://youtu.be/dQw4w9WgXcQ?t=90s"), 90);
  assert.equal(inicioDeYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"), 90);
  assert.equal(inicioDeYoutube("https://www.youtube.com/embed/dQw4w9WgXcQ?start=12"), 12);
  assert.equal(inicioDeYoutube("https://youtu.be/dQw4w9WgXcQ"), 0);
});

test("tocar: una flecha recta por su línea, un rectángulo por dentro, el de más arriba gana", () => {
  const recta = trazo("flechaRecta", [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }]);
  assert.ok(tocaTrazo(recta, { x: 0.3, y: 0.505 }));
  assert.ok(!tocaTrazo(recta, { x: 0.3, y: 0.6 }));
  const caja = trazo("rect", [{ x: 0.2, y: 0.2 }, { x: 0.6, y: 0.8 }]);
  assert.ok(tocaTrazo(caja, { x: 0.4, y: 0.5 }));
  assert.equal(trazoEn([caja, recta], { x: 0.3, y: 0.5 }), "flechaRecta");
  assert.equal(trazoEn([caja, recta], { x: 0.9, y: 0.1 }), null);
});

test("la flecha curva se toca por su curva, no por la recta entre sus puntas", () => {
  const curva = trazo("flecha", [{ x: 0.1, y: 0.5 }, { x: 0.7, y: 0.5 }]);
  // El centro de la recta queda lejos de una curva tan abierta.
  assert.ok(!tocaTrazo(curva, { x: 0.4, y: 0.5 }));
  assert.ok(tocaTrazo(curva, { x: 0.1, y: 0.5 }));
  assert.ok(tocaTrazo(curva, { x: 0.7, y: 0.5 }));
});

test("mover, escalar y duplicar no sacan el trazo del escenario", () => {
  const caja = trazo("rect", [{ x: 0.8, y: 0.8 }, { x: 0.95, y: 0.95 }]);
  const movida = desplazar(caja, 0.2, 0.2);
  assert.ok(movida.puntos.every((p) => p.x <= 1 && p.y <= 1));
  const grande = escalar(trazo("rect", [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }]), 2);
  const l = limites(grande);
  assert.ok(Math.abs(l.x0 - 0.3) < 1e-9 && Math.abs(l.x1 - 0.7) < 1e-9);
  const texto = escalar(trazo("texto", [{ x: 0.5, y: 0.5 }], { texto: "Hola" }), 2);
  assert.equal(texto.grosor, 8, "un texto crece en letra, no en puntos");
  const copia = duplicar(caja);
  assert.notEqual(copia.id, caja.id);
});
