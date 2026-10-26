import assert from "node:assert/strict";
import test from "node:test";
import { fijarCarrera, sistemaDePartido } from "../lib/abp.ts";
import { APERTURA, dentroDeLaCuna, miradaDe, quienVe } from "../lib/mirada.ts";

const base = () => sistemaDePartido("433", "442", "nuestro", "ataque");
const conBalon = (j, balon) => ({ ...j, fases: [{ ...j.fases[0], balon }] });

test("mira al balón: el ángulo apunta de la ficha al balón", () => {
  const j = base();
  const yo = j.fases[0].pos.L4;
  const balon = { x: yo.x + 10, z: yo.z + 10 };
  const m = miradaDe(conBalon(j, balon), conBalon(j, balon).fases[0], "L4", 0);
  assert.ok(Math.abs(m.angulo - Math.PI / 4) < 1e-9);
  assert.deepEqual({ x: m.mira.x, z: m.mira.z }, balon);
});

test("con el balón en los pies, mira a la portería que ataca; corriendo, hacia donde corre", () => {
  let j = base();
  const yo = j.fases[0].pos.L4;
  j = conBalon(j, { x: yo.x + 0.5, z: yo.z });
  assert.equal(miradaDe(j, j.fases[0], "L4", 0).angulo, 0);
  const rival = j.fichas.find((f) => f.equipo === "rival").id;
  const suyo = j.fases[0].pos[rival];
  const r = conBalon(j, { x: suyo.x, z: suyo.z + 1 });
  assert.equal(miradaDe(r, r.fases[0], rival, 0).angulo, Math.PI);
  j = fijarCarrera(j, 0, "L4", { x: yo.x, z: yo.z + 20 }, 0, 0);
  assert.ok(Math.abs(miradaDe(j, j.fases[0], "L4", 0).angulo - Math.PI / 2) < 0.05);
});

test("la cuña tiene la apertura que dice y cuenta compañeros y rivales", () => {
  const m = { desde: { x: 0, z: 0 }, angulo: 0, mira: { x: 10, z: 0, y: 0 } };
  const borde = (APERTURA / 2 - 1) * (Math.PI / 180);
  assert.ok(dentroDeLaCuna(m, { x: Math.cos(borde) * 10, z: Math.sin(borde) * 10 }));
  assert.ok(!dentroDeLaCuna(m, { x: 0, z: 10 }));
  assert.ok(!dentroDeLaCuna(m, { x: -10, z: 0 }));
  assert.ok(!dentroDeLaCuna(m, { x: 40, z: 0 }, 30));
  const j = base();
  const visto = quienVe(j, j.fases[0], "L4", 0);
  assert.ok(visto.companeros + visto.rivales > 0);
  assert.equal(miradaDe(j, j.fases[0], "nadie", 0), null);
});
