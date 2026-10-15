import assert from "node:assert/strict";
import test from "node:test";
import {
  aTemporadaDeJugador, anterioresAMano, claveDeJugador, datosDeFilaWyscout, errorDeTemporadaAMano, nuevaTemporadaAMano, parecidoDeNombre,
} from "../lib/temporadasAMano.ts";

/** La temporada anterior que no está en ninguna base: escrita a mano o sacada de una fila de Wyscout. */

const datos = (cambios = {}) => ({
  etiqueta: "2024", liga: "Liga Profesional Argentina", equipo: "Lanús", partidos: 21, minutos: 1630, goles: 3, asistencias: 2, origen: "mano", ...cambios,
});

test("se valida antes de guardar: liga, temporada anterior a la que se mira, equipo y minutos", () => {
  assert.equal(errorDeTemporadaAMano(datos(), 2025), "");
  assert.match(errorDeTemporadaAMano(datos({ liga: " " }), 2025), /liga/);
  assert.match(errorDeTemporadaAMano(datos({ etiqueta: "24" }), 2025), /2026 o 2025\/2026/);
  assert.match(errorDeTemporadaAMano(datos({ etiqueta: "2025" }), 2025), /anterior/);
  assert.equal(errorDeTemporadaAMano(datos({ etiqueta: "2023/2024" }), 2024), "", "una de año cruzado que empieza antes vale");
  assert.match(errorDeTemporadaAMano(datos({ equipo: "" }), 2025), /equipo/);
  assert.match(errorDeTemporadaAMano(datos({ minutos: Number.NaN }), 2025), /minutos/);
  // Goles y asistencias pueden no saberse.
  assert.equal(errorDeTemporadaAMano(datos({ goles: Number.NaN, asistencias: Number.NaN }), 2025), "");
});

test("la misma temporada, liga y equipo es la misma: se reemplaza, no se duplica", () => {
  const una = nuevaTemporadaAMano(datos({ liga: "  Liga   Profesional Argentina ", etiqueta: " 2024 " }));
  const otra = nuevaTemporadaAMano(datos({ minutos: 900 }));
  assert.equal(una.id, otra.id);
  assert.equal(una.liga, "Liga Profesional Argentina");
  assert.equal(una.etiqueta, "2024");
  assert.equal(claveDeJugador(" Sean Young ", "2001-05-02"), "Sean Young|2001-05-02");
});

test("en la franja se lee como una temporada más, y solo cuentan las anteriores a la que se mira", () => {
  const vieja = nuevaTemporadaAMano(datos({ etiqueta: "2022" }));
  const reciente = nuevaTemporadaAMano(datos({ etiqueta: "2024", equipo: "Banfield" }));
  const posterior = nuevaTemporadaAMano(datos({ etiqueta: "2026" }));
  assert.deepEqual(anterioresAMano([vieja, posterior, reciente], 2025).map((t) => t.etiqueta), ["2024", "2022"]);
  const comoTemporada = aTemporadaDeJugador(reciente);
  assert.equal(comoTemporada.anio, 2024);
  assert.deepEqual(comoTemporada.ligas, ["Liga Profesional Argentina"]);
  assert.equal(comoTemporada.equipoPorLiga["Liga Profesional Argentina"], "Banfield");
  assert.equal(comoTemporada.aMano, reciente);
});

test("en un Excel de Wyscout se encuentra al jugador aunque venga con la inicial", () => {
  assert.equal(parecidoDeNombre("Aleksander Hammer Kjelsen", "Aleksander Hammer Kjelsen"), 4);
  assert.equal(parecidoDeNombre("A. Hammer Kjelsen", "Aleksander Hammer Kjelsen"), 3);
  assert.equal(parecidoDeNombre("Á. Gómez", "Ángel Gomez"), 3, "sin acentos ni mayúsculas");
  assert.equal(parecidoDeNombre("J. Kjelsen", "Aleksander Hammer Kjelsen"), 2, "otro nombre, mismo apellido");
  assert.equal(parecidoDeNombre("Hammer Olsen", "Aleksander Hammer Kjelsen"), 1);
  assert.equal(parecidoDeNombre("P. Smith", "Aleksander Hammer Kjelsen"), 0);
});

test("de su fila salen club, partidos, minutos, goles y asistencias", () => {
  const fila = { Player: "A. Hammer Kjelsen", Team: "Vålerenga", "Team within selected timeframe": "Vålerenga II", "Matches played": "10", "Minutes played": "551", Goals: 0, Assists: "" };
  const leida = datosDeFilaWyscout(fila, "OBOS-ligaen", "2024");
  assert.equal(leida.equipo, "Vålerenga II", "el club del periodo elegido manda");
  assert.equal(leida.partidos, 10);
  assert.equal(leida.minutos, 551);
  assert.equal(leida.goles, 0);
  assert.ok(Number.isNaN(leida.asistencias), "vacío no es cero");
  assert.equal(leida.origen, "wyscout");
});
