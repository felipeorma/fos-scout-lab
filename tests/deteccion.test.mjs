import assert from "node:assert/strict";
import test from "node:test";
import { abrir, detectarJugadores, dosEquipos, hsv, jugadaDelFotograma, manchas, tonoDelCesped } from "../lib/deteccion.ts";
import { jugadaValida } from "../lib/abp.ts";

// Un campo visto desde arriba: 4 píxeles por metro, el centro en el medio de la imagen.
const K = 4, W = 105 * K + 40, H = 68 * K + 40;
const aCampo = (x, y) => ({ x: (x - W / 2) / K, y: (y - H / 2) / K });
const aPixel = (p) => ({ x: p.x * K + W / 2, y: p.y * K + H / 2 });

function campo(jugadores) {
  const data = new Uint8ClampedArray(W * H * 4);
  const pintar = (x, y, [r, g, b]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const franja = Math.floor((x - W / 2) / (7.5 * K)) % 2 === 0;
    pintar(x, y, franja ? [52, 132, 66] : [46, 120, 60]);
  }
  // Las líneas de cal: el contorno y la de medio campo, de dos píxeles.
  const tl = aPixel({ x: -52.5, y: -34 }), br = aPixel({ x: 52.5, y: 34 }), m = aPixel({ x: 0, y: 0 });
  for (let x = Math.round(tl.x); x <= Math.round(br.x); x += 1) for (const y of [tl.y, br.y]) for (let d = 0; d < 2; d += 1) pintar(x, Math.round(y) + d, [240, 240, 240]);
  for (let y = Math.round(tl.y); y <= Math.round(br.y); y += 1) for (const x of [tl.x, m.x, br.x]) for (let d = 0; d < 2; d += 1) pintar(Math.round(x) + d, y, [240, 240, 240]);
  // Cada jugador, de 3 × 9 píxeles con los pies donde pisa (las piernas oscuras).
  for (const { p, color } of jugadores) {
    const q = aPixel(p);
    for (let dy = 0; dy < 9; dy += 1) for (let dx = -1; dx <= 1; dx += 1) pintar(Math.round(q.x) + dx, Math.round(q.y) - 9 + dy, dy > 6 ? [30, 30, 30] : color);
  }
  return { data, width: W, height: H };
}

const ROJO = [220, 40, 40], BLANCO = [245, 245, 245], AMARILLO = [240, 220, 30];
const JUGADORES = [
  ...[[-30, -5], [-25, 12], [-20, 0], [-10, -20], [5, 15]].map(([x, y]) => ({ p: { x, y }, color: ROJO })),
  // Visto desde arriba, una camiseta blanca encima de una raya es cal: en una imagen de verdad está en alto y no pisa la raya.
  ...[[-38, -10], [-33, 8], [-15, 20], [3, -8]].map(([x, y]) => ({ p: { x, y }, color: BLANCO })),
  { p: { x: -22, y: 25 }, color: AMARILLO },
];

test("el tono del césped y los colores", () => {
  const img = campo([]);
  const tono = tonoDelCesped(img, () => true);
  assert.ok(tono > 110 && tono < 150, String(tono));
  assert.deepEqual(hsv(255, 0, 0).map((v) => Math.round(v * 100) / 100), [0, 1, 1]);
});

test("encuentra a cada jugador donde pisa, sin las líneas de cal, y separa los equipos por la camiseta", () => {
  const encontrados = detectarJugadores(campo(JUGADORES), aCampo);
  assert.equal(encontrados.length, JUGADORES.length);
  for (const j of JUGADORES) {
    const cerca = encontrados.find((e) => Math.hypot(e.pie.x - j.p.x, e.pie.y - j.p.y) < 0.8);
    assert.ok(cerca, `falta el de ${j.p.x}, ${j.p.y}`);
  }
  const deEquipo = (color) => new Set(encontrados.filter((e) => JUGADORES.find((j) => Math.hypot(e.pie.x - j.p.x, e.pie.y - j.p.y) < 0.8).color === color).map((e) => e.equipo));
  const rojos = deEquipo(ROJO), blancos = deEquipo(BLANCO);
  assert.equal(rojos.size, 1);
  assert.equal(blancos.size, 1);
  assert.notDeepEqual([...rojos], [...blancos]);
  assert.deepEqual([...deEquipo(AMARILLO)], [null]);
});

test("un trozo de raya de cal no es un jugador", () => {
  const encontrados = detectarJugadores(campo([]), aCampo);
  assert.equal(encontrados.length, 0);
});

test("las manchas y la apertura: se van las rayas de un píxel, quedan las manchas", () => {
  const w = 8, h = 6, m = new Uint8Array(w * h);
  for (let x = 0; x < w; x += 1) m[0 * w + x] = 1;
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 5; x += 1) m[y * w + x] = 1;
  assert.equal(manchas(m, w, h).length, 2);
  assert.equal(manchas(abrir(m, w, h), w, h).length, 1);
  assert.deepEqual(dosEquipos([[250, 0, 0], [240, 10, 10], [0, 0, 250], [10, 0, 240]]), [0, 0, 1, 1]);
});

test("del fotograma al estudio: nuestros de local, con portero si está cerca de su portería", () => {
  const encontrados = detectarJugadores(campo([...JUGADORES, { p: { x: -50, y: 0 }, color: ROJO }]), aCampo);
  const nuestro = encontrados.find((e) => e.pie.x < -49).equipo;
  const j = jugadaDelFotograma(encontrados, { nuestro, haciaLaDerecha: true, nombre: "Fotograma" });
  const locales = j.fichas.filter((f) => f.equipo === "local");
  assert.equal(locales.length, 6);
  assert.equal(locales.find((f) => f.rol === "POR").dorsal, "1");
  assert.ok(Math.abs(j.fases[0].pos[locales.find((f) => f.rol === "POR").id].x + 50) < 1);
  assert.equal(j.fichas.filter((f) => f.equipo === "rival").length, 4);
  assert.ok(jugadaValida(JSON.parse(JSON.stringify(j))));
  // Atacando hacia la izquierda, el campo se gira: el portero pasa a estar en +x... y deja de ser nuestro portero.
  const girada = jugadaDelFotograma(encontrados, { nuestro, haciaLaDerecha: false, nombre: "Fotograma" });
  assert.ok(Object.values(girada.fases[0].pos).some((p) => p.x > 49));
});
