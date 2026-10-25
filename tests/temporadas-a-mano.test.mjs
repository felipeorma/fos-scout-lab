import assert from "node:assert/strict";
import test from "node:test";
import { activeLang, setActiveLang } from "../lib/i18n.ts";
import {
  aTemporadaDeJugador, anterioresAMano, claveDeJugador, datosDeFilaWyscout, delMismoAnioAMano, errorDeTemporadaAMano, nuevaTemporadaAMano, parecidoDeNombre,
} from "../lib/temporadasAMano.ts";

/** La temporada anterior que no está en ninguna base: escrita a mano o sacada de una fila de Wyscout. */

const datos = (cambios = {}) => ({
  etiqueta: "2024", liga: "Liga Profesional Argentina", equipo: "Lanús", partidos: 21, minutos: 1630, goles: 3, asistencias: 2, origen: "mano", ...cambios,
});

test("se valida antes de guardar: liga, temporada del mismo año o anterior, equipo y minutos", () => {
  assert.equal(errorDeTemporadaAMano(datos(), 2025), "");
  assert.match(errorDeTemporadaAMano(datos({ liga: " " }), 2025), /liga/);
  assert.match(errorDeTemporadaAMano(datos({ etiqueta: "24" }), 2025), /2026 o 2025\/2026/);
  assert.equal(errorDeTemporadaAMano(datos({ etiqueta: "2025" }), 2025), "");
  assert.match(errorDeTemporadaAMano(datos({ etiqueta: "2026" }), 2025), /posterior/);
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

test("el formulario del mismo año sigue rechazando años distintos", () => {
  assert.equal(errorDeTemporadaAMano(datos({ etiqueta: "2025" }), 2025, true), "");
  assert.equal(errorDeTemporadaAMano(datos({ etiqueta: "2025/2026" }), 2025, true), "");
  for (const etiqueta of ["2024", "2024/2025", "2026"]) {
    assert.match(errorDeTemporadaAMano(datos({ etiqueta }), 2025, true), /mismo año/);
  }
  assert.equal(errorDeTemporadaAMano(datos({ etiqueta: "2025" }), 2025), "");
  assert.match(errorDeTemporadaAMano(datos({ etiqueta: "2025", equipo: "" }), 2025, true), /equipo/);
});

test("Typing the data permite otra liga de 2024 al mirar 2024, también en inglés", () => {
  const idiomaAnterior = activeLang();
  try {
    for (const idioma of ["es", "en"]) {
      setActiveLang(idioma);
      // La barra lateral usa la validación por defecto, sin el modo exclusivo del mismo año.
      for (const etiqueta of ["2024", "2024/2025", "2023", "2023/2024"]) {
        assert.equal(errorDeTemporadaAMano(datos({ etiqueta }), 2024), "", `${idioma}: ${etiqueta}`);
      }
      for (const etiqueta of ["2025", "2025/2026"]) {
        const error = errorDeTemporadaAMano(datos({ etiqueta }), 2024);
        assert.equal(error, idioma === "en"
          ? "It cannot be later than the season shown (2024)."
          : "No puede ser posterior a la temporada que se mira (2024).");
      }
    }
  } finally {
    setActiveLang(idiomaAnterior);
  }
});

test("varias ligas del mismo año conviven con la temporada anterior y se filtran al cambiar de año", () => {
  const anterior = nuevaTemporadaAMano(datos({ etiqueta: "2024" }));
  const usl = nuevaTemporadaAMano(datos({ etiqueta: "2025", liga: "USL Championship", equipo: "Pittsburgh" }));
  const mls = nuevaTemporadaAMano(datos({ etiqueta: "2025", liga: "MLS", equipo: "Toronto FC" }));
  const lista = [anterior, usl, mls];
  assert.deepEqual(delMismoAnioAMano(lista, 2025), [usl, mls]);
  assert.deepEqual(anterioresAMano(lista, 2025), [anterior]);
  assert.deepEqual(delMismoAnioAMano(lista, 2024), [anterior]);
  assert.deepEqual(delMismoAnioAMano(lista, 0), []);
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
