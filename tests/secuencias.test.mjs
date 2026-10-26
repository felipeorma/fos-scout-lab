import assert from "node:assert/strict";
import test from "node:test";
import { agregarFase, balonFinal, carrerasDe, fijarCarrera, fijarPase, pasesDe, posFinal, sistemaDePartido } from "../lib/abp.ts";
import { enEspejo, ladoDe, quienesSeMueven, repartirPapeles, secuenciaDe, secuenciasValidas, soltarSecuencia } from "../lib/secuencias.ts";

const cerca = (a, b, tol = 1e-6) => Math.abs(a.x - b.x) < tol && Math.abs(a.z - b.z) < tol;

/** Una pared por la izquierda: el 4 se la da al 8 y sale; el 8 se la devuelve al hueco. */
function conPared() {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  const f0 = j.fases[0];
  const L4 = f0.pos.L4, L8 = f0.pos.L8;
  j = { ...j, fases: [{ ...f0, balon: { ...L4 } }] };
  j = fijarPase(j, 0, L8, "raso", 0);
  const hueco = { x: L4.x + 16, z: L4.z - 4 };
  j = fijarCarrera(j, 0, "L4", hueco, 2, 0);
  j = agregarFase(j, 0, "La vuelta");
  j = fijarPase(j, 1, hueco, "raso", 0);
  return { j, hueco };
}

test("una secuencia guarda a los que se mueven y a los del envío, sin sus nombres", () => {
  const { j } = conPared();
  assert.deepEqual(quienesSeMueven(j, 0, 1).sort(), ["L4", "L8"]);
  const s = secuenciaDe(j, 0, 1, "Pared por la izquierda");
  assert.equal(s.papeles.length, 2);
  assert.ok(s.papeles.every((p) => p.equipo === "local" && /^s\d$/.test(p.clave)));
  assert.equal(s.fases.length, 2);
  assert.equal(JSON.stringify(s).includes("L4"), false);
  assert.equal(s.fases[0].carreras.length, 1);
  assert.equal(s.fases[1].pases.length, 1);
  assert.equal(secuenciaDe(j, 0, 1, "Solo el 8", ["L8"]).papeles.length, 1);
  assert.equal(ladoDe(s), "izquierda");
});

test("al soltarla en otro sistema, los más cercanos hacen el papel detrás de la fase actual", () => {
  const { j, hueco } = conPared();
  const s = secuenciaDe(j, 0, 1, "Pared");
  const otro = sistemaDePartido("4231", "433", "nuestro", "ataque");
  const papel = repartirPapeles(s, otro.fases[0], otro.fichas);
  assert.equal(papel.size, 2);
  assert.ok([...papel.values()].every((id) => id.startsWith("L")));
  const { jugada, papeles } = soltarSecuencia(otro, 0, s);
  assert.equal(papeles, 2);
  assert.equal(jugada.fases.length, 3);
  assert.equal(jugada.fases[1].nombre, s.fases[0].nombre);
  // El que hace de 4 acaba la fase actual en el sitio de salida de la secuencia y después corre al hueco.
  const id4 = papel.get(s.papeles.find((p) => cerca(s.fases[0].pos[p.clave], j.fases[0].pos.L4)).clave);
  assert.ok(cerca(posFinal(jugada.fases[0], id4), j.fases[0].pos.L4));
  assert.ok(cerca(carrerasDe(jugada.fases[1], id4)[0].hasta, hueco));
  // Los envíos van igual: al 8 y de vuelta al hueco.
  assert.ok(cerca(pasesDe(jugada.fases[1])[0].hasta, j.fases[0].pos.L8));
  assert.ok(cerca(balonFinal(jugada.fases[2]), hueco));
});

test("en espejo, por la otra banda", () => {
  const { j, hueco } = conPared();
  const s = secuenciaDe(j, 0, 1, "Pared");
  const espejo = enEspejo(s);
  assert.equal(ladoDe(espejo), "derecha");
  assert.equal(espejo.fases[0].carreras[0].curva, -s.fases[0].carreras[0].curva);
  const { jugada } = soltarSecuencia(sistemaDePartido("433", "442", "nuestro", "ataque"), 0, s, true);
  assert.ok(cerca(balonFinal(jugada.fases[2]), { x: hueco.x, z: -hueco.z }));
});

test("lo guardado roto se descarta y lo bueno vuelve igual", () => {
  const { j } = conPared();
  const s = secuenciaDe(j, 0, 1, "Pared");
  assert.deepEqual(secuenciasValidas(JSON.parse(JSON.stringify([s]))), [s]);
  assert.deepEqual(secuenciasValidas(null), []);
  assert.deepEqual(secuenciasValidas([{ id: "x", papeles: [], fases: [] }, { nada: 1 }]), []);
  // Un sistema sin nadie de ese equipo no puede hacer la secuencia.
  const sinLocales = { ...j, fichas: j.fichas.filter((f) => f.equipo === "rival") };
  assert.equal(soltarSecuencia(sinLocales, 0, s).papeles, 0);
});

test("los porteros solo hacen de porteros", () => {
  let j = sistemaDePartido("433", "442", "nuestro", "ataque");
  // El portero sale a por un balón largo y un central abre a la banda.
  j = fijarCarrera(j, 0, "L1", { x: j.fases[0].pos.L1.x + 8, z: 0 }, 0, 0);
  j = fijarCarrera(j, 0, "L4", { x: j.fases[0].pos.L4.x, z: j.fases[0].pos.L4.z - 10 }, 0, 0);
  j = agregarFase(j, 0, "Fase 2");
  const s = secuenciaDe(j, 0, 1, "Salida");
  assert.equal(s.papeles.filter((p) => p.portero).length, 1);
  // En el sistema de destino, el portero está lejísimos de todo... y aun así le toca solo su papel.
  const otro = sistemaDePartido("4231", "442", "nuestro", "ataque");
  const papel = repartirPapeles(s, otro.fases[0], otro.fichas);
  const delPortero = papel.get(s.papeles.find((p) => p.portero).clave);
  assert.equal(otro.fichas.find((f) => f.id === delPortero).rol, "POR");
  for (const [clave, id] of papel) if (!s.papeles.find((p) => p.clave === clave).portero) assert.notEqual(otro.fichas.find((f) => f.id === id).rol, "POR");
});
