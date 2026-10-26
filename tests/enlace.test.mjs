import assert from "node:assert/strict";
import test from "node:test";
import { agregarAnotacion, agregarFase, fijarCarrera, jugadaValida, sistemaDePartido } from "../lib/abp.ts";
import { BIBLIOTECA, sistemaDeBiblioteca } from "../lib/biblioteca.ts";
import { PREFIJO, enlaceDeJugada, hashDeJugada, jugadaDeHash } from "../lib/enlace.ts";

const sinId = (j) => JSON.parse(JSON.stringify({ ...j, id: "", actualizada: 0 }));

test("un sistema va y vuelve por el enlace igual, con otro id", async () => {
  let j = sistemaDePartido("433", "4231", "nuestro", "salida");
  j = fijarCarrera(j, 0, "L9", { x: 30, z: 4 }, 3);
  j = agregarAnotacion(j, 0, { id: "b", tipo: "bloque", fichas: ["L2", "L3", "L4", "L5"], color: "#f3b64c", relleno: "atras" });
  j = agregarAnotacion(j, 0, { id: "m", tipo: "medida", a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, color: "#ffffff", desde: "L4" });
  j = agregarFase(j, 0, "Fase 2");
  const hash = await hashDeJugada(j);
  assert.ok(hash.startsWith(`${PREFIJO}1.`));
  assert.match(hash.slice(PREFIJO.length), /^[0-9.A-Za-z_-]+$/);
  const vuelta = await jugadaDeHash(hash);
  assert.notEqual(vuelta.id, j.id);
  // Igual que el mismo sistema guardado y vuelto a abrir.
  assert.deepEqual(sinId(vuelta), sinId(jugadaValida(JSON.parse(JSON.stringify(j)))));
});

test("cada sistema de la biblioteca cabe en un enlace corto", async () => {
  for (const s of BIBLIOTECA) {
    const enlace = await enlaceDeJugada(sistemaDeBiblioteca(s, "es"), "https://felipeorma.github.io/fos-scout-lab/#vieja");
    assert.ok(enlace.startsWith(`https://felipeorma.github.io/fos-scout-lab/${PREFIJO}`), s.id);
    assert.ok(enlace.length < 12000, `${s.id}: ${enlace.length}`);
  }
});

test("un enlace roto, cortado o ajeno no abre nada", async () => {
  const hash = await hashDeJugada(sistemaDePartido("442", "442", "suyo", "defensa"));
  assert.equal(await jugadaDeHash(hash.slice(0, hash.length - 40)), null);
  assert.equal(await jugadaDeHash("#pizarra=1.%%%"), null);
  assert.equal(await jugadaDeHash("#pizarra=9.abc"), null);
  assert.equal(await jugadaDeHash("#otra=1.abc"), null);
  // Sin comprimir también se lee (un navegador sin CompressionStream).
  const crudo = Buffer.from(JSON.stringify(sistemaDePartido("433", "433", "nuestro", "salida"))).toString("base64url");
  assert.ok(await jugadaDeHash(`#pizarra=0.${crudo}`));
});
