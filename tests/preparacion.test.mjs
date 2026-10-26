import assert from "node:assert/strict";
import test from "node:test";
import { jugadaValida, lineaDeBloque } from "../lib/abp.ts";
import { medidasDeEquipo } from "../lib/medidas.ts";
import { ajustarBloque, defensasDe, pizarraDelPartido } from "../lib/preparacion.ts";

const once = (prefijo) => Array.from({ length: 11 }, (_, i) => `${prefijo} Jugador${i + 1}`);

test("el bloque del rival se coloca con su altura, su largo y su ancho reales", () => {
  const j = pizarraDelPartido(
    { equipo: "Cavalry", formacion: "433", nombres: once("Nuestro") },
    { equipo: "Forge", formacion: "442", nombres: once("Suyo"), bloque: { altura: 40, largo: 32, ancho: 44 } },
  );
  assert.ok(jugadaValida(JSON.parse(JSON.stringify(j))));
  const suyas = medidasDeEquipo(j, j.fases[0], "rival");
  assert.ok(Math.abs(suyas.profundidad - 32) < 1e-6);
  assert.ok(Math.abs(suyas.anchura - 44) < 1e-6);
  // El centro del bloque a 40 m de su portería (x = 52,5): de 24 a 56 m.
  assert.ok(Math.abs(suyas.lineaDefensiva - 24) < 1e-6);
  // Los nombres, bajo la ficha; dentro, el puesto.
  assert.equal(j.ambiente.fichas, "puesto");
  assert.ok(j.fichas.filter((f) => f.equipo === "rival").every((f) => f.nombre?.startsWith("Jugador")));
  // Su línea de cuatro, sombreada; su profundidad, pegada a quienes la marcan.
  const [bloque, largo, etiqueta] = j.fases[0].anotaciones;
  assert.equal(bloque.tipo, "bloque");
  assert.equal(bloque.fichas.length, 4);
  assert.equal(lineaDeBloque(bloque, j.fases[0], 0).length, 4);
  assert.equal(largo.tipo, "medida");
  assert.ok(largo.desde && largo.hasta);
  assert.equal(etiqueta.tipo, "etiqueta");
  assert.match(j.fases[0].nota, /centro a 40 m de su portería, 32 × 44 m/);
  assert.match(j.fases[0].nota, /Por tercios, nosotros–ellos: \d+–\d+ atrás, \d+–\d+ en medio, \d+–\d+ arriba\./);
  assert.ok(j.fases[0].nota.length <= 160);
});

test("sin datos del bloque, la forma del dibujo; un dibujo desconocido pasa a 4-2-3-1 sin nombres", () => {
  const j = pizarraDelPartido({ equipo: "A", formacion: "433", nombres: [] }, { equipo: "B", formacion: "3-3-3-1", nombres: once("X") }, "en");
  assert.equal(j.fichas.filter((f) => f.equipo === "rival").length, 11);
  assert.ok(j.fichas.every((f) => !f.nombre));
  assert.equal(j.fases[0].nombre, "B's block");
  assert.match(j.fases[0].nota, /^By third, us–them:/);
});

test("ajustar un bloque no lo saca del campo y cuenta los defensores del dibujo", () => {
  const sitios = [{ id: "a", p: { x: 40, z: -20 } }, { id: "b", p: { x: 10, z: 20 } }, { id: "c", p: { x: 25, z: 0 } }];
  const muyHondo = ajustarBloque(sitios, 52.5, { altura: 2, largo: 60, ancho: 90 });
  for (const p of muyHondo.values()) assert.ok(p.x <= 52.5 - 4 + 1e-9 && Math.abs(p.z) <= 32);
  assert.deepEqual([defensasDe("4231"), defensasDe("352"), defensasDe("541"), defensasDe("")], [4, 3, 5, 4]);
});

test("con su bloque, nuestros de arriba quedan a la altura de su última línea, no detrás", () => {
  const j = pizarraDelPartido({ equipo: "A", formacion: "433", nombres: [] }, { equipo: "B", formacion: "442", nombres: [], bloque: { altura: 40, largo: 32, ancho: 44 } });
  const fase = j.fases[0];
  const x = (equipo) => j.fichas.filter((f) => f.equipo === equipo && !/^(portero|por|gk)$/i.test(f.rol)).map((f) => fase.pos[f.id].x);
  assert.ok(Math.max(...x("local")) <= Math.max(...x("rival")));
  assert.ok(Math.max(...x("local")) > Math.max(...x("rival")) - 2);
  assert.ok(Math.max(...x("local")) - Math.min(...x("local")) <= 45 + 1e-6);
});
