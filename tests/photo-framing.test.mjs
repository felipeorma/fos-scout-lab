import assert from "node:assert/strict";
import test from "node:test";
import { framePhotoTransform, opaqueBounds } from "../lib/photoFraming.ts";

function canvasWithBox(width, height, box) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = box.y; y < box.y + box.height; y += 1) {
    for (let x = box.x; x < box.x + box.width; x += 1) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

test("detecta la caja opaca dentro de un lienzo transparente", () => {
  const box = { x: 20, y: 10, width: 40, height: 60 };
  const found = opaqueBounds(canvasWithBox(100, 100, box), 100, 100);
  assert.ok(found);
  // el muestreo puede desplazar el borde como mucho un paso
  assert.ok(Math.abs(found.x - box.x) <= 2 && Math.abs(found.y - box.y) <= 2);
  assert.ok(Math.abs(found.width - box.width) <= 3 && Math.abs(found.height - box.height) <= 3);
});

test("devuelve null cuando la imagen es totalmente transparente", () => {
  assert.equal(opaqueBounds(new Uint8ClampedArray(40 * 40 * 4), 40, 40), null);
});

test("apoya la caja centrada sobre la base del marco", () => {
  const box = { x: 10, y: 0, width: 50, height: 100 };
  const { scale, translateX, translateY } = framePhotoTransform(box, 200, 150, 1, 0);
  assert.equal(scale, 1.5); // limitado por el alto: 150/100
  // el borde inferior de la caja cae exactamente en la base del marco
  assert.equal(translateY + scale * (box.y + box.height), 150);
  // y queda centrada horizontalmente
  const left = translateX + scale * box.x;
  assert.equal(Math.round(left + scale * box.width / 2), 100);
});

test("dos fotos con el jugador a distinta altura terminan igual de apoyadas", () => {
  const alta = framePhotoTransform({ x: 0, y: 0, width: 60, height: 80 }, 120, 160, 1, 0);
  const baja = framePhotoTransform({ x: 0, y: 60, width: 60, height: 80 }, 120, 160, 1, 0);
  assert.equal(alta.translateY + alta.scale * 80, 160);
  assert.equal(baja.translateY + baja.scale * (60 + 80), 160);
});
