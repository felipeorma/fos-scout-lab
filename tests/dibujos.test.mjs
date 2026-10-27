import assert from "node:assert/strict";
import test from "node:test";
import {
  FORMACIONES, agregarFase, cambiarDibujo, cambiarFicha, carrerasDe, fijarCarrera, jugadaValida, nombreDeFormacion, plantilla, posFinal, sistemaDePartido, sitiosDeDibujo,
} from "../lib/abp.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;

test("el estudio tiene veintiséis dibujos, cada uno con su once y un portero", () => {
  assert.equal(FORMACIONES.length, 26);
  for (const codigo of FORMACIONES) {
    const sitios = sitiosDeDibujo(codigo, "local");
    assert.equal(sitios.length, 11, codigo);
    assert.equal(sitios.filter((s) => s.rol === "POR").length, 1, codigo);
    assert.equal(new Set(sitios.map((s) => s.dorsal)).size, 11, codigo);
    assert.ok(sitios.every((s) => Math.abs(s.p.x) <= 52.5 && Math.abs(s.p.z) <= 34), codigo);
  }
  assert.equal(nombreDeFormacion("433f"), "4-3-3 falso 9");
  assert.equal(nombreDeFormacion("4231"), "4-2-3-1");
  // Los rivales, girados media vuelta.
  assert.ok(cerca(sitiosDeDibujo("424", "rival")[0].p, { x: -sitiosDeDibujo("424", "local")[0].p.x, z: -sitiosDeDibujo("424", "local")[0].p.z }));
});

test("cambiar el dibujo desde el principio conserva nombres, dorsales y carreras", () => {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  j = cambiarFicha(j, "L9", { nombre: "Haaland" });
  const destino = { x: 30, z: 4 };
  j = fijarCarrera(j, 0, "L9", destino, 0, 0);
  j = agregarFase(j, 0, "Fase 2");
  const cambiado = cambiarDibujo(j, 1, "local", "352", "principio");
  assert.equal(cambiado.fichas.length, j.fichas.length);
  assert.equal(cambiado.fichas.find((f) => f.id === "L9").nombre, "Haaland");
  assert.equal(cambiado.fichas.find((f) => f.id === "L9").dorsal, "9");
  assert.equal(cambiado.fichas.find((f) => f.id === "L1").rol, "POR");
  assert.equal(cambiado.fichas.filter((f) => f.equipo === "local" && f.rol === "DFC").length, 3);
  // La carrera sigue y la salida del 9 es un sitio del dibujo nuevo.
  assert.ok(cerca(carrerasDe(cambiado.fases[0], "L9")[0].hasta, destino));
  const sitios = sitiosDeDibujo("352", "local").map((s) => s.p);
  assert.ok(sitios.some((p) => cerca(p, cambiado.fases[0].pos.L9)));
  // Los rivales no se tocan.
  assert.deepEqual(cambiado.fases[0].pos.R9, j.fases[0].pos.R9);
  assert.ok(jugadaValida(JSON.parse(JSON.stringify(cambiado))));
});

test("cambiar desde una fase: el equipo llega al dibujo nuevo desde la anterior", () => {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  j = agregarFase(j, 0, "Fase 2");
  const cambiado = cambiarDibujo(j, 1, "local", "4231", "fase");
  // La fase 1 empieza igual que antes…
  assert.deepEqual(cambiado.fases[0].pos, j.fases[0].pos);
  // …y en ella cada uno corre a su sitio del 4-2-3-1, donde empieza la fase 2.
  const sitios = sitiosDeDibujo("4231", "local").map((s) => s.p);
  for (const f of cambiado.fichas.filter((x) => x.equipo === "local")) {
    assert.ok(sitios.some((p) => cerca(p, cambiado.fases[1].pos[f.id])), f.id);
    assert.ok(cerca(posFinal(cambiado.fases[0], f.id), cambiado.fases[1].pos[f.id]), f.id);
  }
});

test("si faltan fichas para el once, se añaden en los sitios libres", () => {
  const rondo = plantilla("rondo");
  const antes = rondo.fichas.filter((f) => f.equipo === "local").length;
  const cambiado = cambiarDibujo(rondo, 0, "local", "442", "principio");
  const locales = cambiado.fichas.filter((f) => f.equipo === "local");
  assert.equal(locales.length, 11);
  assert.ok(antes < 11);
  assert.equal(new Set(locales.map((f) => f.id)).size, 11);
  assert.ok(cambiado.fases.every((fase) => locales.every((f) => fase.pos[f.id])));
});
