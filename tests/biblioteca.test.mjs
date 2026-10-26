import assert from "node:assert/strict";
import test from "node:test";
import { balonFinal, jugadaValida, posFinal } from "../lib/abp.ts";
import { BIBLIOTECA, TEMAS, sistemaDeBiblioteca } from "../lib/biblioteca.ts";

const cerca = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

test("la biblioteca: cada tema tiene sistemas y cada sistema es de un tema", () => {
  const temas = new Set(TEMAS.map((t) => t.id));
  for (const tema of temas) assert.ok(BIBLIOTECA.some((s) => s.tema === tema), `${tema} sin sistemas`);
  for (const s of BIBLIOTECA) assert.ok(temas.has(s.tema), s.id);
  assert.equal(new Set(BIBLIOTECA.map((s) => s.id)).size, BIBLIOTECA.length);
});

test("cada sistema de la biblioteca se monta, es continuo y solo mueve fichas que existen", () => {
  for (const s of BIBLIOTECA) {
    for (const idioma of ["es", "en"]) {
      const j = sistemaDeBiblioteca(s, idioma);
      assert.ok(jugadaValida(JSON.parse(JSON.stringify(j))), `${s.id} (${idioma}) no se puede guardar`);
      assert.equal(j.nombre, s.titulo[idioma]);
      if (s.pasos.length) assert.equal(j.fases.length, s.pasos.length, s.id);
      const ids = new Set(j.fichas.map((f) => f.id));
      for (const id of Object.keys(s.colocar ?? {})) assert.ok(ids.has(id), `${s.id}: ${id} no existe`);
      s.pasos.forEach((paso, i) => {
        for (const id of Object.keys(paso.mover ?? {})) assert.ok(ids.has(id), `${s.id}, fase ${i + 1}: ${id} no existe`);
        assert.equal(j.fases[i].nota, paso.nota[idioma]);
        // Cada movimiento pedido quedó como carrera, y el envío, como envío.
        assert.equal(j.fases[i].carreras.length, Object.keys(paso.mover ?? {}).length, `${s.id}, fase ${i + 1}`);
        assert.equal(j.fases[i].pases.length, paso.pase ? 1 : 0, `${s.id}, fase ${i + 1}`);
      });
      for (let k = 1; k < j.fases.length; k += 1) {
        for (const id of ids) assert.ok(cerca(j.fases[k].pos[id], posFinal(j.fases[k - 1], id)), `${s.id}: ${id} salta en la fase ${k + 1}`);
        assert.ok(cerca(j.fases[k].balon, balonFinal(j.fases[k - 1])), `${s.id}: el balón salta en la fase ${k + 1}`);
      }
      // Todo dentro del campo, con un poco de margen fuera de las líneas.
      for (const f of j.fases) for (const p of Object.values(f.pos)) assert.ok(Math.abs(p.x) <= 54 && Math.abs(p.z) <= 36, `${s.id}: ficha fuera del campo`);
    }
  }
});

test("abrir dos veces el mismo sistema da dos copias distintas", () => {
  const a = sistemaDeBiblioteca(BIBLIOTECA[0], "es"), b = sistemaDeBiblioteca(BIBLIOTECA[0], "es");
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.fases[0].id, b.fases[0].id);
});

test("los ejercicios de entrenamiento traen sus fichas, su material en cada fase y sus equipaciones", () => {
  const ejercicios = BIBLIOTECA.filter((s) => s.tema === "entrenamiento");
  assert.ok(ejercicios.length >= 2);
  for (const s of ejercicios.filter((e) => e.material)) {
    const j = sistemaDeBiblioteca(s, "en");
    for (const f of j.fases) assert.deepEqual(f.material.map((m) => m.id), j.fases[0].material.map((m) => m.id), s.id);
    assert.equal(j.fases[0].material.length, s.material.length, s.id);
  }
  const circuito = sistemaDeBiblioteca(BIBLIOTECA.find((s) => s.id === "circuito-tecnico"), "en");
  assert.deepEqual(circuito.fichas.map((f) => [f.id, f.rol]), [["L1", "Player"], ["L2", "Server"]]);
  // La miniportería del remate mira hacia el jugador, que llega desde la izquierda.
  assert.equal(circuito.fases[0].material.find((m) => m.tipo === "miniporteria").giro, 180);
  const reducido = sistemaDeBiblioteca(BIBLIOTECA.find((s) => s.id === "reducido-4-contra-4"), "es");
  assert.equal(reducido.fichas.length, 8);
  assert.equal(reducido.equipaciones.local.patron, "rayas");
  assert.equal(reducido.equipaciones.rival.dorsal, "negro");
});
