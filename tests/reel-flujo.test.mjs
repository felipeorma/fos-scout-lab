import assert from "node:assert/strict";
import test from "node:test";
import { REEL, disenoDelReel } from "../lib/reelFlujo.ts";

/**
 * El reel de Football Blueprints es vertical (1080 × 1920) y tiene que caber
 * entero con cualquier liga: los treinta equipos de la MLS en dos
 * conferencias, los ocho de la CPL o los doce de una liga europea. Nada se
 * puede salir del lienzo ni pisar la leyenda, y ninguna cancha a otra.
 */

const solapan = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [nombre, tamanos] of [["MLS", [15, 15]], ["CPL", [8]], ["liga europea", [18]], ["con un tercer grupo", [14, 15, 1]], ["liga corta", [4]]]) {
  test(`el reel cabe con ${nombre} (${tamanos.join(" + ")} equipos)`, () => {
    const diseno = disenoDelReel(tamanos);
    const celdas = diseno.grupos.flatMap((grupo) => grupo.celdas);
    assert.equal(celdas.length, tamanos.reduce((a, b) => a + b, 0));
    for (const celda of celdas) {
      assert.ok(celda.x >= 0 && celda.x + celda.w <= REEL.ancho, "dentro de ancho");
      // El nombre del equipo va debajo de la cancha: también tiene que caber antes de la leyenda.
      assert.ok(celda.y >= 440 && celda.y + celda.h + 30 <= diseno.leyendaY + 24, "por encima de la leyenda");
    }
    for (let i = 0; i < celdas.length; i += 1) {
      for (let j = i + 1; j < celdas.length; j += 1) assert.ok(!solapan(celdas[i], celdas[j]), `celdas ${i} y ${j} se pisan`);
    }
    assert.ok(diseno.leyendaY + 24 + 60 < REEL.alto - 90, "la leyenda deja sitio a los créditos");
    // Las canchas conservan su proporción.
    for (const celda of celdas) assert.ok(Math.abs(celda.w / celda.h - 126 / 86) < 1e-6);
  });
}

test("la MLS va en dos bloques de cinco columnas y tres filas", () => {
  const { grupos } = disenoDelReel([15, 15]);
  for (const grupo of grupos) {
    assert.equal(new Set(grupo.celdas.map((c) => Math.round(c.x))).size, 5);
    assert.equal(new Set(grupo.celdas.map((c) => Math.round(c.y))).size, 3);
  }
  assert.ok(grupos[1].rotulo.y > grupos[0].celdas.at(-1).y + grupos[0].celdas.at(-1).h, "el Oeste va debajo del Este");
});
