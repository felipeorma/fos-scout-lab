import assert from "node:assert/strict";
import test from "node:test";
import {
  METRICAS_ESTILO,
  cabezaACabeza,
  entraEnReferencia,
  equiposParecidos,
  parecidoDeEstilo,
  perfilesDeEstilo,
  unaTemporadaPorEquipo,
} from "../lib/estiloEquipo.ts";

/**
 * El estilo de juego de un equipo y cuánto se parece a otro.
 *
 * Lo que se fija aquí es lo que hace útil al modelo para fichar: el parecido
 * mide CÓMO juega un equipo, no cuánto rinde, y el grupo de referencia no se
 * deja arrastrar por la NCAA.
 */

let siguiente = 1;
const equipo = (nombre, campos = {}, competicion = "Liga Pro") => ({
  team_id: siguiente++, team_name: nombre,
  competition_id: competicion === "Liga Pro" ? 1 : 2, competition_name: competicion,
  season_id: 1, season_name: "2026", team_season_matches: 20,
  team_season_gk_long_pass_ratio: 0.4, team_season_passes_pg: 450, team_season_possessions: 220,
  team_season_possession: 0.5, team_season_directness: 0.87, team_season_pace_towards_goal: 2.7,
  team_season_opp_passing_ratio: 0.77, team_season_deep_progressions_pg: 44, team_season_deep_completions_pg: 4.3,
  team_season_passes_inside_box_pg: 3, team_season_crosses_into_box_pg: 9, team_season_counter_attacking_shots_pg: 1,
  team_season_op_shots_outside_box_pg: 3.7, team_season_op_shots_pg: 10, team_season_np_shots_pg: 13,
  team_season_op_xg_pg: 1, team_season_sp_xg_pg: 0.3, team_season_np_xg_per_shot: 0.1,
  team_season_ppda: 11, team_season_defensive_distance: 46, team_season_fhalf_pressures_ratio: 0.49,
  team_season_counterpressures_pg: 30, team_season_high_press_shots_pg: 3.3, team_season_np_shots_conceded_pg: 12,
  team_season_np_xg_per_shot_conceded: 0.1, team_season_deep_completions_conceded_pg: 4,
  ...campos,
});

/** Un grupo con variedad real: cada equipo mueve varias métricas a la vez. */
function grupo() {
  siguiente = 1;
  const filas = [];
  for (let i = 0; i < 20; i += 1) {
    const k = (i - 10) / 10;
    filas.push(equipo(`Equipo ${i}`, {
      team_season_possession: 0.5 + k * 0.08,
      team_season_directness: 0.87 - k * 0.04,
      team_season_ppda: 11 - k * 4,
      team_season_defensive_distance: 46 + k * 4,
      team_season_gk_long_pass_ratio: 0.42 - k * 0.1,
      team_season_counter_attacking_shots_pg: 1 + ((i * 7) % 5 - 2) * 0.3,
      team_season_crosses_into_box_pg: 9 + ((i * 3) % 7 - 3),
      team_season_np_xg_per_shot: 0.1 + ((i * 5) % 9 - 4) * 0.004,
    }));
  }
  return filas;
}

test("un equipo es idéntico a sí mismo: parecido 100", () => {
  const perfiles = perfilesDeEstilo(grupo());
  assert.equal(parecidoDeEstilo(perfiles[3], perfiles[3]), 100);
});

test("el parecido es simétrico", () => {
  const perfiles = perfilesDeEstilo(grupo());
  assert.equal(parecidoDeEstilo(perfiles[2], perfiles[15]), parecidoDeEstilo(perfiles[15], perfiles[2]));
});

test("el estilo opuesto queda por debajo de 50 y el vecino por encima", () => {
  const perfiles = perfilesDeEstilo(grupo());
  const extremo = perfiles[0], opuesto = perfiles[19], vecino = perfiles[1];
  assert.ok(parecidoDeEstilo(extremo, opuesto) < 50, "presionar arriba y salir en corto frente a lo contrario");
  assert.ok(parecidoDeEstilo(extremo, vecino) > 50);
});

test("el rendimiento no cambia el parecido: solo cuentan las métricas de estilo", () => {
  const filas = grupo();
  const base = perfilesDeEstilo(filas);
  // El mismo equipo, pero con el doble de xG y la mitad de tiros concedidos.
  filas[5] = { ...filas[5], team_season_op_xg_pg: 2.4, team_season_np_shots_conceded_pg: 6, team_season_np_xg_per_shot: 0.15 };
  const despues = perfilesDeEstilo(filas);
  assert.equal(parecidoDeEstilo(base[5], base[8]), parecidoDeEstilo(despues[5], despues[8]));
});

test("la PPDA va invertida: presionar más da un z positivo", () => {
  const perfiles = perfilesDeEstilo(grupo());
  const presiona = perfiles.reduce((a, b) => (a.valores.ppda.bruto < b.valores.ppda.bruto ? a : b));
  assert.ok(presiona.valores.ppda.z > 0);
  assert.ok(presiona.valores.ppda.percentil > 50);
});

test("los percentiles quedan entre 0 y 100", () => {
  for (const perfil of perfilesDeEstilo(grupo())) {
    for (const valor of Object.values(perfil.valores)) {
      assert.ok(valor.percentil >= 0 && valor.percentil <= 100, `${perfil.equipo} ${valor.id} = ${valor.percentil}`);
    }
  }
});

test("la NCAA se puntúa pero no forma las medias", () => {
  const pro = grupo();
  const universitario = equipo("College", { team_season_possession: 0.95 }, "NCAA D1 Big Ten");
  assert.equal(entraEnReferencia(universitario), false);
  const sin = perfilesDeEstilo(pro);
  const con = perfilesDeEstilo([...pro, universitario]);
  // Un equipo profesional tiene el mismo z tanto si el universitario está como si no.
  assert.equal(sin[4].valores.posesion.z, con[4].valores.posesion.z);
  const college = con.find((perfil) => perfil.equipo === "College");
  assert.equal(college.referencia, false);
  assert.ok(college.valores.posesion.z > 3, "se le mide contra los profesionales");
});

test("equiposParecidos no se incluye a sí mismo y ordena de más a menos", () => {
  const perfiles = perfilesDeEstilo(grupo());
  const lista = equiposParecidos(perfiles[6], perfiles, 5);
  assert.equal(lista.length, 5);
  assert.ok(lista.every((fila) => fila.perfil.clave !== perfiles[6].clave));
  for (let i = 1; i < lista.length; i += 1) assert.ok(lista[i - 1].parecido >= lista[i].parecido);
});

test("el cara a cara cubre todas las métricas con dato y nombra al que va por delante", () => {
  const perfiles = perfilesDeEstilo(grupo());
  const duelo = cabezaACabeza(perfiles[0], perfiles[19]);
  // Las métricas sin variación en el grupo no tienen z y no entran: aquí son
  // las que el grupo sintético deja iguales para todos.
  const conDato = METRICAS_ESTILO.filter((m) => perfiles[0].valores[m.id] && perfiles[19].valores[m.id]);
  assert.ok(conDato.length >= 8);
  assert.equal(duelo.length, conDato.length);
  const ppda = duelo.find((fila) => fila.metrica.id === "ppda");
  assert.equal(ppda.lider, ppda.za >= ppda.zb ? "a" : "b");
});

test("un equipo con dos temporadas en curso sale una sola vez", () => {
  // Otoño a primavera: 2025/2026 acabándose y 2026/2027 empezando.
  const vieja = { ...equipo("Ajax II"), team_id: 900, season_id: 1, season_name: "2025/2026", team_season_matches: 34 };
  const nuevaCorta = { ...vieja, season_id: 2, season_name: "2026/2027", team_season_matches: 6 };
  const nuevaLarga = { ...nuevaCorta, team_season_matches: 12 };
  assert.equal(unaTemporadaPorEquipo([vieja, nuevaCorta]).length, 1);
  assert.equal(unaTemporadaPorEquipo([vieja, nuevaCorta])[0].season_name, "2025/2026", "la nueva aún no tiene muestra");
  assert.equal(unaTemporadaPorEquipo([vieja, nuevaLarga])[0].season_name, "2026/2027", "con diez partidos manda la más reciente");
  const perfiles = perfilesDeEstilo([...grupo(), vieja, nuevaCorta]);
  assert.equal(perfiles.filter((perfil) => perfil.equipo === "Ajax II").length, 1);
});

test("con menos de diez partidos se puntúa pero no forma las medias", () => {
  const corto = { ...equipo("Recién llegado", { team_season_possession: 0.9 }), team_season_matches: 6 };
  assert.equal(entraEnReferencia(corto), false);
  const sin = perfilesDeEstilo(grupo());
  const con = perfilesDeEstilo([...grupo(), corto]);
  assert.equal(sin[4].valores.posesion.z, con[4].valores.posesion.z);
});
