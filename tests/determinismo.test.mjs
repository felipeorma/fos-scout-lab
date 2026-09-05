import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport } from "../lib/scouting.ts";

/**
 * Dos scouts con los mismos archivos tienen que ver lo mismo.
 *
 * El cruce dependía del orden de carga en la identidad del jugador: club y
 * posición salían del archivo que hubiera entrado antes. Con un juvenil que
 * juega en el primer equipo y en el filial de la misma temporada, eso no era
 * solo irreproducible: mostraba el club equivocado.
 */

const base = (nombre, filas) => ({
  fileName: nombre, season: 2026, provider: "statsbomb",
  headers: Object.keys(filas[0]), rows: filas,
});

const jugador = (extra) => ({
  Player: "Gallatin Sandnes", Age: 18, "Matches played": 4,
  "Goals per 90": 0.1, "xG per 90": 0.1, "Shots on target, %": 30,
  "Touches in box per 90": 2, "Accurate passes, %": 70, "Received passes per 90": 12,
  ...extra,
});

/** Un juvenil con un cameo arriba y la temporada entera en el filial. */
const primerEquipo = base("MLS", [jugador({ Team: "Seattle Sounders", Position: "RCMF", "Minutes played": 34 })]);
const filial = base("MLS Next Pro", [jugador({ Team: "Tacoma Defiance", Position: "LCMF", "Minutes played": 2016 })]);

test("el club es donde de verdad jugó, no el del archivo que entró primero", () => {
  const enUnOrden = aggregateDatasets([primerEquipo, filial]).rows[0];
  const enElOtro = aggregateDatasets([filial, primerEquipo]).rows[0];
  assert.equal(enUnOrden.Team, "Tacoma Defiance");
  assert.equal(enElOtro.Team, "Tacoma Defiance");
});

test("la posición principal también sale de donde más jugó", () => {
  const a = String(aggregateDatasets([primerEquipo, filial]).rows[0].Position);
  const b = String(aggregateDatasets([filial, primerEquipo]).rows[0].Position);
  assert.equal(a, b);
  assert.ok(a.startsWith("LCMF"), `la principal debe ser la del filial, llegó "${a}"`);
});

test("un traspaso sí muestra el club nuevo aunque allí haya jugado menos", () => {
  const viejo = { ...base("Liga 2025", [jugador({ Team: "Club Viejo", Position: "RCMF", "Minutes played": 2400 })]), season: 2025 };
  const nuevo = base("Liga 2026", [jugador({ Team: "Club Nuevo", Position: "RCMF", "Minutes played": 300 })]);
  assert.equal(aggregateDatasets([viejo, nuevo]).rows[0].Team, "Club Nuevo");
  assert.equal(aggregateDatasets([nuevo, viejo]).rows[0].Team, "Club Nuevo");
});

test("el orden de carga no cambia el contenido de la base", () => {
  const liga = (sufijo, desplazamiento) => base(`Liga ${sufijo}`, Array.from({ length: 30 }, (_, i) => jugador({
    Player: `Nombre${i}${sufijo} Apellido${i}${sufijo}`, Team: `Club${i % 5}`,
    Position: "RCMF", "Minutes played": 600 + i * 10 + desplazamiento,
  })));
  const bases = [liga("a", 0), liga("b", 3), liga("c", 7)];
  const huella = (bs) => aggregateDatasets(bs).rows
    .map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]])))
    .sort().join("\n");
  const normal = huella(bases);
  assert.equal(huella([...bases].reverse()), normal);
  assert.equal(huella([bases[1], bases[2], bases[0]]), normal);
});

test("cargar la misma liga dos veces no duplica jugadores", () => {
  const una = aggregateDatasets([filial]).rows.length;
  const dos = aggregateDatasets([filial, { ...filial, fileName: "Copia" }]).rows.length;
  assert.equal(dos, una);
});

test("una jornada más mueve el índice poco, no lo reordena entero", () => {
  const plantel = (bonus) => base("Liga", Array.from({ length: 24 }, (_, i) => jugador({
    Player: `Jugador${i} Apellido${i}`, Team: `Club${i % 6}`, Position: "RCMF",
    "Minutes played": 900 + bonus, "Goals per 90": (i % 9) / 10 + bonus / 100000,
    "xG per 90": (i % 7) / 10, "Shots on target, %": 30 + (i % 40),
  })));
  const antes = aggregateDatasets([plantel(0)]).rows;
  const despues = aggregateDatasets([plantel(90)]).rows;
  let mayor = 0;
  for (let i = 0; i < antes.length; i += 1) {
    const a = buildPlayerReport(antes, i, 0, "AUTO");
    const d = buildPlayerReport(despues, i, 0, "AUTO");
    if (a?.metrics.length && d?.metrics.length) mayor = Math.max(mayor, Math.abs(a.score - d.score));
  }
  assert.ok(mayor <= 10, `el índice se movió ${mayor} puntos con una jornada más`);
});
