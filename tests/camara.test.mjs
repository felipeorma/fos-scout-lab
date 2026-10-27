import assert from "node:assert/strict";
import test from "node:test";
import { agregarFase, cambiarCamara, jugadaValida, sistemaDePartido } from "../lib/abp.ts";

const base = () => sistemaDePartido("433", "442", "nuestro", "ataque");

test("cada fase puede tener su cámara y la siguiente la hereda", () => {
  let j = cambiarCamara(base(), 0, { encuadre: "su_area" });
  assert.deepEqual(j.fases[0].camara, { encuadre: "su_area" });
  j = agregarFase(j, 0, "Fase 2");
  assert.deepEqual(j.fases[1].camara, { encuadre: "su_area" });
  // Cambiarla en la segunda no toca la primera.
  j = cambiarCamara(j, 1, { encuadre: "jugada", vista: "3d" });
  assert.deepEqual(j.fases[1].camara, { encuadre: "jugada", vista: "3d" });
  assert.deepEqual(j.fases[0].camara, { encuadre: "su_area" });
});

test("volver a lo del sistema quita la cámara de la fase", () => {
  let j = cambiarCamara(base(), 0, { encuadre: "centro", vista: "cenital" });
  j = cambiarCamara(j, 0, { vista: undefined });
  assert.deepEqual(j.fases[0].camara, { encuadre: "centro" });
  j = cambiarCamara(j, 0, { encuadre: undefined });
  assert.equal("camara" in j.fases[0], false);
});

test("la cámara sobrevive a guardar y abrir, y lo que no se entiende se descarta", () => {
  const j = cambiarCamara(base(), 0, { encuadre: "jugada", vista: "tactica" });
  assert.deepEqual(jugadaValida(JSON.parse(JSON.stringify(j))).fases[0].camara, { encuadre: "jugada", vista: "tactica" });
  const rota = { ...j, fases: [{ ...j.fases[0], camara: { encuadre: "la_grada", vista: "dron" } }] };
  assert.equal("camara" in jugadaValida(rota).fases[0], false);
  const media = { ...j, fases: [{ ...j.fases[0], camara: { encuadre: "su_mitad", vista: "dron" } }] };
  assert.deepEqual(jugadaValida(media).fases[0].camara, { encuadre: "su_mitad" });
});
