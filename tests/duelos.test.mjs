import assert from "node:assert/strict";
import test from "node:test";
import { emparejar, encoger, mediasDeDuelo, mejorParaElDuelo, probabilidadAerea, probabilidadDeRegate, tasas } from "../lib/duelos.ts";
import { DIBUJOS } from "../lib/pizarra.ts";

/** Los duelos de la pizarra: log5 con tasas encogidas hacia su liga. */

const perfil = (x = {}) => ({ minutos: 1800, regates90: 1, regatePct: 0.5, regateado90: 0.5, frenaPct: 0.6, aereos90: 1, aereoPct: 0.5, ...x });
const LIGA = { regate: 0.5, frena: 0.6, aereo: 0.5 };

test("con todo en la media, el duelo es la media de la liga", () => {
  assert.ok(Math.abs(probabilidadDeRegate(perfil(), LIGA, perfil(), LIGA) - 0.5) < 1e-9);
  assert.ok(Math.abs(probabilidadAerea(perfil(), LIGA, perfil(), LIGA) - 0.5) < 1e-9);
});

test("un buen regateador contra un defensor que frena poco gana más; contra uno que frena mucho, menos", () => {
  const regateador = perfil({ regates90: 3, regatePct: 0.7 });
  const flojo = perfil({ regateado90: 2, frenaPct: 0.4 });
  const muro = perfil({ regateado90: 0.3, frenaPct: 0.9 });
  const contraFlojo = probabilidadDeRegate(regateador, LIGA, flojo, LIGA);
  const contraMuro = probabilidadDeRegate(regateador, LIGA, muro, LIGA);
  assert.ok(contraFlojo > 0.7 && contraMuro < 0.6, `${contraFlojo} ${contraMuro}`);
  assert.ok(contraFlojo > contraMuro);
});

test("pocos intentos: la tasa vuelve a la media", () => {
  assert.equal(encoger(1, 0, 0.5), 0.5);
  assert.ok(Math.abs(encoger(1, 3, 0.5) - 0.6) < 1e-9, "tres de tres no es un 100%");
  const pocos = perfil({ minutos: 90, regates90: 3, regatePct: 1 });
  assert.ok(tasas(pocos, LIGA).regate < 0.7);
});

test("las medias de la liga, ponderadas por intentos y solo con 450′ o más", () => {
  const medias = mediasDeDuelo([perfil({ regatePct: 0.4 }), perfil({ regatePct: 0.6, regates90: 3 }), perfil({ minutos: 100, regatePct: 1 })]);
  // 1 completado al 40 % son 2,5 intentos/90; 3 al 60 %, 5. (1 + 3) / 7,5 ≈ 0,533
  assert.ok(Math.abs(medias.regate - 4 / 7.5) < 1e-9);
});

test("los emparejamientos de la pizarra: extremo con lateral, punta con central (y en el aire)", () => {
  const duelos = emparejar(DIBUJOS["4231"], DIBUJOS["4231"]);
  const de = (ataca, puesto) => duelos.find((d) => d.ataca === ataca && DIBUJOS["4231"][d.puestoAtacante] === puesto);
  // Nuestro extremo izquierdo cae sobre su lateral derecho (su derecha está en nuestra izquierda).
  assert.equal(DIBUJOS["4231"][de("a", "LW").puestoDefensor], "RB");
  const punta = de("a", "CF");
  assert.ok(["LCB", "RCB"].includes(DIBUJOS["4231"][punta.puestoDefensor]));
  assert.deepEqual(punta.tipos, ["regate", "aereo"]);
  assert.ok(!duelos.some((d) => DIBUJOS["4231"][d.puestoAtacante] === "GK"));
});

test("el mejor del plantel para un duelo: cabe en el puesto, tiene minutos y mejora al menos 5 puntos", () => {
  const plantel = [
    { nombre: "Titular", posicion: "LW", minutos: 2000, duelo: perfil({ regatePct: 0.45 }) },
    { nombre: "Bueno", posicion: "LW", minutos: 900, duelo: perfil({ regatePct: 0.7, regates90: 2 }) },
    { nombre: "Central", posicion: "LCB", minutos: 2000, duelo: perfil({ regatePct: 0.9, regates90: 3 }) },
    { nombre: "Ráfaga", posicion: "LW", minutos: 200, duelo: perfil({ regatePct: 1, regates90: 5 }) },
    { nombre: "Lateral", posicion: "LB", minutos: 2000, duelo: perfil({ regatePct: 0.95, regates90: 4 }) },
  ];
  const valor = (p) => tasas(p, LIGA).regate;
  const mejor = mejorParaElDuelo("LW", "Titular", plantel, () => false, valor);
  assert.equal(mejor.jugador.nombre, "Bueno", "ni el central ni el lateral son extremos, y la ráfaga no tiene minutos");
  assert.ok(mejor.ganancia >= 0.05);
  assert.equal(mejorParaElDuelo("LW", "Bueno", plantel, () => false, valor), null, "nadie lo mejora");
});
