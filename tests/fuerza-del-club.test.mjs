import assert from "node:assert/strict";
import test from "node:test";
import { PUNTOS_POR_XGD, ajustePorClub, fuerzaDelJugador, fuerzasDeLiga } from "../lib/fuerzaDelClub.ts";

const equipo = (team_name, a, c) => ({ team_name, team_season_np_xg_pg: a, team_season_np_xg_conceded_pg: c });
const temporada = (etiqueta, liga, equipoNombre, minutos) => ({
  etiqueta, anio: Number(etiqueta.slice(-4)), ligas: [liga], equipo: equipoNombre, equipoPorLiga: { [liga]: equipoNombre },
  partidos: 20, minutos, goles: 0, asistencias: 0,
});

test("la fuerza de cada club es su xGD por partido, con su puesto en la liga", () => {
  const liga = fuerzasDeLiga([equipo("Cavalry FC", 1.68, 0.72), equipo("Pacific FC", 1.22, 1.46), equipo("Forge FC", 1.42, 0.96), { team_name: "Sin datos" }]);
  assert.equal(liga.size, 3);
  assert.equal(liga.get("Cavalry FC").puesto, 1);
  assert.equal(liga.get("Pacific FC").puesto, 3);
  assert.ok(Math.abs(liga.get("Cavalry FC").xgd - 0.96) < 1e-9);
});

test("un club que domina resta, uno que sufre suma, uno medio no toca", () => {
  assert.ok(ajustePorClub(1) < 0);
  assert.ok(ajustePorClub(-0.5) > 0);
  assert.equal(Math.abs(ajustePorClub(0)), 0);
  assert.equal(ajustePorClub(1), -PUNTOS_POR_XGD);
});

test("con dos temporadas, la fuerza se pondera por sus minutos en cada club", () => {
  const fuerzas = new Map([
    ["CPL|2025|HFX Wanderers FC", { xgd: -0.32, puesto: 6, equipos: 8 }],
    ["CPL|2026|Cavalry FC", { xgd: 0.96, puesto: 1, equipos: 8 }],
  ]);
  const fuerza = fuerzaDelJugador(
    [temporada("2025", "CPL", "HFX Wanderers FC", 1000), temporada("2026", "CPL", "Cavalry FC", 3000)],
    (liga, t, e) => fuerzas.get(`${liga}|${t}|${e}`) ?? null,
  );
  assert.ok(fuerza);
  assert.ok(Math.abs(fuerza.xgd - (-0.32 * 1000 + 0.96 * 3000) / 4000) < 1e-9);
  assert.equal(fuerza.clubes.length, 2);
  assert.ok(fuerza.ajuste < 0);
});

test("sin datos de equipo de ninguna temporada, no inventa un ajuste", () => {
  assert.equal(fuerzaDelJugador([temporada("2026", "Wyscout", "Club", 900)], () => null), null);
});
