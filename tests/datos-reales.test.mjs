import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDatasets, buildPlayerReport, extractSeason, numeric, temporadasDeFila } from "../lib/scouting.ts";

/**
 * Con datos de verdad, no con filas inventadas.
 *
 * Los tests de siempre usan filas hechas a mano, que no traen lo raro de
 * las bases reales: celdas vacías, jugadores en dos clubes, SkillCorner con
 * otros nombres. Estos piden la CPL —dos temporadas de StatsBomb y la capa
 * de SkillCorner— al puente local y comprueban lo que tiene que cumplirse
 * siempre. Los datos tienen licencia y no van al repositorio: sin el puente
 * (en GitHub, por ejemplo) se saltan.
 */

const PUENTE = "http://127.0.0.1:7001";
const LIGA = "Canadian Premier League";

async function pedir(ruta, ms = 60_000) {
  const respuesta = await fetch(`${PUENTE}${ruta}`, { signal: AbortSignal.timeout(ms) });
  if (!respuesta.ok) throw new Error(`${ruta}: ${respuesta.status}`);
  return respuesta.json();
}

const comoBase = (fileName, season, rows, provider) => ({
  fileName, season: extractSeason(season), headers: Object.keys(rows[0]), rows, provider, cargadoEl: 0,
});

async function cargar() {
  try {
    const estado = await pedir("/api/sources/status", 2_500);
    if (!estado?.statsbomb) return null;
  } catch {
    return null;
  }
  const catalogo = (await pedir("/api/statsbomb/competitions"))
    .filter((c) => c.name === LIGA && c.hasMatches !== false)
    .sort((a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true }));
  const [actual, anterior] = catalogo;
  if (!actual || !anterior) return null;
  const statsbomb = async (c) => comoBase(`StatsBomb · ${c.name} ${c.season}`, c.season,
    (await pedir(`/api/statsbomb/player-stats?competition_id=${c.competition_id}&season_id=${c.season_id}`)).rows, "statsbomb");
  const bases = [await statsbomb(actual), await statsbomb(anterior)];
  let skillcorner = null;
  try {
    const edicion = (await pedir("/api/skillcorner/competitions")).find((c) => c.name === LIGA && String(c.season) === String(actual.season));
    if (edicion) {
      const filas = (await pedir(`/api/skillcorner/player-stats?competition_edition_id=${edicion.id}`)).rows;
      if (filas?.length) skillcorner = comoBase(`SkillCorner · ${LIGA} ${actual.season}`, actual.season, filas, "skillcorner");
    }
  } catch { /* sin SkillCorner se prueba lo demás */ }
  return { actual, anterior, bases, skillcorner };
}

const datos = await cargar();
const sinPuente = datos ? false : "sin el puente local en 127.0.0.1:7001 (datos con licencia)";

test("cada fila real tiene jugador, equipo y minutos legibles", { skip: sinPuente }, () => {
  for (const base of datos.bases) {
    assert.ok(base.rows.length > 100, `${base.fileName}: ${base.rows.length} filas`);
    for (const fila of base.rows) {
      assert.ok(String(fila.Player ?? "").trim(), `${base.fileName}: fila sin jugador`);
      assert.ok(String(fila.Team ?? "").trim(), `${base.fileName}: ${fila.Player} sin equipo`);
      const minutos = numeric(fila["Minutes played"]);
      assert.ok(Number.isFinite(minutos) && minutos >= 0, `${base.fileName}: ${fila.Player} con minutos ${fila["Minutes played"]}`);
    }
  }
});

test("ninguna celda con texto se queda sin leer como número", { skip: sinPuente }, () => {
  // Las de texto de verdad (nombres, puestos, fechas) quedan fuera.
  const deTexto = /^(Player|Team|Position|Birth date|Passport country|Foot|Contract expires|Market value|On loan|Data sources|Team within selected timeframe|Height|Weight)$/;
  const malas = [];
  for (const base of datos.bases) {
    for (const fila of base.rows) {
      for (const [columna, valor] of Object.entries(fila)) {
        if (deTexto.test(columna) || valor === null || valor === "" || typeof valor === "number") continue;
        if (Number.isNaN(numeric(valor)) && malas.length < 5) malas.push(`${columna}=${JSON.stringify(valor)}`);
      }
    }
  }
  assert.deepEqual(malas, []);
});

test("el cruce de dos temporadas suma los minutos de cada una", { skip: sinPuente }, () => {
  const { rows } = aggregateDatasets(datos.bases);
  const claveDe = (fila) => `${fila.Player}|${fila["Birth date"] ?? ""}`;
  const delAnio = (base) => new Map(base.rows.map((fila) => [claveDe(fila), fila]));
  const [este, previo] = datos.bases.map(delAnio);
  // Los que cambiaron de club dentro de una temporada vienen en dos filas: fuera.
  const repetidos = new Set(datos.bases.flatMap((base) => {
    const vistos = new Set();
    return base.rows.map(claveDe).filter((clave) => vistos.has(clave) || !vistos.add(clave));
  }));
  let comprobados = 0;
  for (const fila of rows) {
    const clave = claveDe(fila);
    const a = este.get(clave);
    const b = previo.get(clave);
    if (!a || !b || repetidos.has(clave) || comprobados >= 40) continue;
    const esperados = numeric(a["Minutes played"]) + numeric(b["Minutes played"]);
    assert.equal(numeric(fila["Minutes played"]), esperados, `${fila.Player}`);
    assert.equal(temporadasDeFila(fila).length, 2, `${fila.Player}: dos temporadas`);
    comprobados += 1;
  }
  assert.ok(comprobados >= 20, `solo ${comprobados} jugadores en las dos temporadas`);
});

test("el cruce es determinista: dos veces, el mismo resultado", { skip: sinPuente }, () => {
  const una = aggregateDatasets(datos.bases).rows;
  const otra = aggregateDatasets(datos.bases).rows;
  assert.equal(JSON.stringify(una), JSON.stringify(otra));
});

test("cada ficha con minutos da un índice y percentiles entre 0 y 100", { skip: sinPuente }, () => {
  const { rows } = aggregateDatasets([datos.bases[0]]);
  let fichas = 0;
  rows.forEach((fila, indice) => {
    if (numeric(fila["Minutes played"]) < 900) return;
    const informe = buildPlayerReport(rows, indice, 900, "AUTO");
    assert.ok(informe, `${fila.Player}: sin ficha`);
    assert.ok(informe.metrics.length >= 4, `${fila.Player}: ${informe.metrics.length} métricas`);
    assert.ok(informe.score >= 0 && informe.score <= 100, `${fila.Player}: índice ${informe.score}`);
    for (const metrica of informe.metrics) {
      assert.ok(metrica.percentile >= 0 && metrica.percentile <= 100, `${fila.Player} · ${metrica.label}: ${metrica.percentile}`);
    }
    fichas += 1;
  });
  assert.ok(fichas > 50, `solo ${fichas} fichas`);
});

test("SkillCorner se enlaza con la mayoría de los de StatsBomb", { skip: sinPuente || (!datos.skillcorner && "sin SkillCorner para esa temporada") }, () => {
  const { rows } = aggregateDatasets([datos.bases[0], datos.skillcorner]);
  const conMinutos = rows.filter((fila) => numeric(fila["Minutes played"]) >= 900 && String(fila["Data sources"] ?? "").includes("StatsBomb"));
  const enlazados = conMinutos.filter((fila) => String(fila["Data sources"] ?? "").includes("SkillCorner"));
  assert.ok(enlazados.length / conMinutos.length >= 0.6, `${enlazados.length} de ${conMinutos.length}`);
});
