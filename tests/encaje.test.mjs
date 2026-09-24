import assert from "node:assert/strict";
import test from "node:test";
import { NIVEL_REFUERZO, ajustarPuesto, compararConPuesto, nivelFrenteAPlantilla, percentilAZ, perfilDelPuesto, presenciaDelPuesto, sugerirRefuerzos } from "../lib/encaje.ts";

/**
 * El encaje de un jugador en un equipo: lo que pide el puesto, si hay sitio
 * en el dibujo y si sube el nivel.
 */

test("lo que pide el puesto pesa por minutos", () => {
  const puesto = perfilDelPuesto([
    { perfil: { progresion: 2, aereo: 0 }, minutos: 2000 },
    { perfil: { progresion: -1, aereo: 1 }, minutos: 500 },
    { perfil: { progresion: 5 }, minutos: 0 },
  ]);
  assert.equal(puesto.progresion, (2 * 2000 - 1 * 500) / 2500);
  assert.equal(puesto.aereo, 500 / 2500);
});

test("el parecido con el puesto: igual es 100, lo contrario 0, y dice qué pide y qué falta", () => {
  const puesto = { progresion: 1.5, creacion: 1, aereo: -0.5, defensa: 0.6 };
  assert.equal(compararConPuesto({ ...puesto }, puesto).parecido, 100);
  const contrario = Object.fromEntries(Object.entries(puesto).map(([k, v]) => [k, -v]));
  assert.equal(compararConPuesto(contrario, puesto).parecido, 0);

  const jugador = { progresion: 1.6, creacion: -0.2, aereo: 1.5, defensa: 0.5 };
  const r = compararConPuesto(jugador, puesto);
  assert.deepEqual(r.pideYDa, ["progresion", "defensa"]);
  assert.deepEqual(r.pideYNoDa, ["creacion"]);
  assert.deepEqual(r.daDeMas, ["aereo"]);
  assert.equal(compararConPuesto({ progresion: 1 }, puesto), null, "con menos de tres dimensiones no se compara");
});

test("de percentil a la escala de z", () => {
  assert.equal(percentilAZ(50), 0);
  assert.equal(percentilAZ(90), 1.6);
});

test("sitio en el dibujo: el puesto exacto y cualquier puesto de su familia, un partido cada vez", () => {
  const alineaciones = {
    partidos: 4,
    puestos: {},
    porPartido: [["GK", "LW", "RW"], ["GK", "RW"], ["GK", "LWB", "RWB"], ["GK", "LW"]],
  };
  const lw = presenciaDelPuesto(alineaciones, "LW, RW");
  assert.equal(lw.codigo, "LW");
  assert.equal(lw.exacto, 2);
  assert.equal(lw.deRol, 3, "un partido con dos extremos cuenta una vez");
  assert.equal(lw.porcentajeExacto, 50);
  assert.equal(lw.porcentajeRol, 75);
});

test("el nivel frente a la plantilla: en qué lugar quedaría", () => {
  const r = nivelFrenteAPlantilla(70, [
    { nombre: "A", indice: 75, minutos: 1800 },
    { nombre: "B", indice: 60, minutos: 900 },
    { nombre: "C", indice: 40, minutos: 300 },
  ]);
  assert.equal(r.lugar, 2);
  assert.equal(r.de, 4);
  assert.deepEqual(r.actuales.map((a) => a.nombre), ["A", "B", "C"]);
});

test("el ajuste refuerza solo lo elegido y deja el resto del puesto como está", () => {
  // Extremos flojos en centros y progresión: la plantilla pide poco de eso.
  const puesto = { centros: -0.9, progresion: -0.4, presion_rival: 1.2, asociacion: 0.8 };
  const { perfil, pesos } = ajustarPuesto(puesto, ["centros", "progresion", "inexistente"]);
  assert.equal(perfil.centros, NIVEL_REFUERZO);
  assert.equal(perfil.progresion, NIVEL_REFUERZO);
  assert.equal(perfil.presion_rival, 1.2, "la esencia del modelo no se toca");
  assert.equal(perfil.asociacion, 0.8);
  assert.deepEqual(Object.keys(pesos).sort(), ["centros", "progresion"]);
  assert.equal(ajustarPuesto({ centros: 1.8 }, ["centros"]).perfil.centros, 1.8, "si ya pide más, no se baja");
});

test("con el ajuste sube quien da lo que falta, sin dejar de lado el resto", () => {
  const puesto = { centros: -0.9, progresion: -0.4, presion_rival: 1.2, asociacion: 0.8 };
  const centrador = { centros: 1.6, progresion: 1.1, presion_rival: 1.0, asociacion: 0.5 };
  const sinAjuste = compararConPuesto(centrador, puesto).parecido;
  const { perfil, pesos } = ajustarPuesto(puesto, ["centros", "progresion"]);
  const conAjuste = compararConPuesto(centrador, perfil, pesos).parecido;
  assert.ok(conAjuste > sinAjuste + 10, `${sinAjuste} → ${conAjuste}`);
  // Uno que centra pero no presiona nada no gana tanto: la esencia sigue pesando.
  const soloCentra = { centros: 1.6, progresion: 1.1, presion_rival: -1.5, asociacion: -1 };
  assert.ok(compararConPuesto(soloCentra, perfil, pesos).parecido < conAjuste);
});

test("las sugerencias son lo que la plantilla hace por debajo de la media, de lo más flojo a lo menos", () => {
  assert.deepEqual(sugerirRefuerzos({ centros: -0.9, progresion: -0.4, presion_rival: 1.2, aereo: -0.1 }), ["centros", "progresion"]);
});
