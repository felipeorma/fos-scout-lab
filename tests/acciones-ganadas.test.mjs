import assert from "node:assert/strict";
import test from "node:test";
import { defensivasGanadas, ofensivasGanadas } from "../lib/snapshot.ts";

/**
 * Las acciones ganadas del mapa de la Ficha ampliada. Lo que cuenta como
 * ganar sale de los resultados de StatsBomb; si esto se equivoca, el mapa
 * pinta como fuerte una zona donde el jugador pierde.
 */
const en = (e) => ({ j: "X", l: [60, 40], ...e });

test("defensivas: entradas e intercepciones ganadas, recuperaciones, bloqueos y despejes", () => {
  const lista = [
    en({ t: "Duel", dt: "Tackle", o: "Won" }),
    en({ t: "Duel", dt: "Tackle", o: "Success In Play" }),
    en({ t: "Duel", dt: "Tackle", o: "Lost In Play" }),
    en({ t: "Duel", dt: "Aerial Lost" }),
    en({ t: "Interception", o: "Won" }),
    en({ t: "Interception", o: "Lost Out" }),
    en({ t: "Ball Recovery" }),
    en({ t: "Ball Recovery", rf: true }),
    en({ t: "Block" }),
    en({ t: "Clearance" }),
    en({ t: "Dribble", o: "Complete" }),
  ];
  assert.equal(defensivasGanadas(lista).length, 6);
});

test("con un puente anterior, sin resultado, la intercepción cuenta como ganada", () => {
  assert.equal(defensivasGanadas([en({ t: "Interception" })]).length, 1);
});

test("ofensivas: regates completados, faltas recibidas y aéreos ganados en pases y remates", () => {
  const lista = [
    en({ t: "Dribble", o: "Complete" }),
    en({ t: "Dribble", o: "Incomplete" }),
    en({ t: "Foul Won" }),
    en({ t: "Pass", aw: true }),
    en({ t: "Pass" }),
    en({ t: "Shot", aw: true }),
    en({ t: "Clearance", aw: true }),
  ];
  assert.equal(ofensivasGanadas(lista).length, 4);
});

test("sin ubicación no se dibuja ni se cuenta", () => {
  assert.equal(defensivasGanadas([{ t: "Block", j: "X", l: null }]).length, 0);
  assert.equal(ofensivasGanadas([{ t: "Foul Won", j: "X" }]).length, 0);
});

test("el mapa colorea cada zona por lo que gana más ahí", async () => {
  const { mapaDeGanadas, COLORES_GANADAS } = await import("../lib/snapshot.ts");
  // Defensa en su campo (x baja), ataque cerca del área rival (x alta).
  const defensa = Array.from({ length: 20 }, () => [20, 40]);
  const ataque = Array.from({ length: 20 }, () => [105, 40]);
  const celdas = mapaDeGanadas(defensa, ataque);
  assert.ok(celdas.length > 0);
  const masDefensa = celdas.reduce((a, b) => (a.parte < b.parte ? a : b));
  const masAtaque = celdas.reduce((a, b) => (a.parte > b.parte ? a : b));
  assert.equal(masDefensa.parte, 0);
  assert.equal(masAtaque.parte, 1);
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")})`;
  assert.equal(masDefensa.color, rgb(COLORES_GANADAS.defensiva));
  assert.equal(masAtaque.color, rgb(COLORES_GANADAS.ofensiva));
  // En el campo vertical el ataque va arriba: la zona ofensiva queda más arriba que la defensiva.
  assert.ok(masAtaque.y < masDefensa.y);
  assert.deepEqual(mapaDeGanadas([], []), []);
});
