import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { leerFilasDeArchivo } from "../lib/lecturaDeArchivos.ts";
import { canonicalizeRow } from "../lib/wyscoutHeaders.ts";
import { aggregateDatasets, buildPlayerReport, cohortOf, extractSeason, headersOf, numeric } from "../lib/scouting.ts";

/**
 * Con exportaciones reales de Wyscout, no con filas hechas a mano.
 *
 * Wyscout exporta en el idioma de la cuenta, con comas decimales y fechas
 * de Excel, y las filas inventadas de los otros tests no traen nada de eso.
 * Estos leen los Excel de verdad con el mismo lector que la app. Los datos
 * tienen licencia y no van al repositorio: se leen de la carpeta de la
 * máquina (o de FOS_WYSCOUT_REALES), y sin ella se saltan.
 */

const CARPETA = process.env.FOS_WYSCOUT_REALES
  ?? "/Users/felipeormazabal/Desktop/CAVALRY FC/Scouting/Radar y reportes de scouting/Maldonado";
const archivos = existsSync(CARPETA)
  ? readdirSync(CARPETA).filter((nombre) => /\.(xlsx|xls|csv)$/i.test(nombre)).map((nombre) => join(CARPETA, nombre))
  : [];
const sinArchivos = archivos.length ? false : `sin exportaciones de Wyscout en ${CARPETA}`;

const leer = (ruta) => {
  const nombre = ruta.split("/").pop();
  const { filas } = leerFilasDeArchivo(readFileSync(ruta).buffer, nombre);
  const rows = filas.map((fila) => canonicalizeRow(fila));
  return { nombre, rows, base: { fileName: nombre, season: extractSeason(nombre) || 2026, headers: headersOf(rows), rows, provider: "wyscout", cargadoEl: 0 } };
};
const leidos = archivos.map(leer);

test("cada exportación se lee entera: jugador, equipo, minutos y cabeceras en inglés", { skip: sinArchivos }, () => {
  for (const { nombre, rows } of leidos) {
    assert.ok(rows.length > 50, `${nombre}: ${rows.length} filas`);
    assert.ok("Player" in rows[0] && "Minutes played" in rows[0], `${nombre}: cabeceras ${Object.keys(rows[0]).slice(0, 6)}`);
    const sinNombre = rows.filter((fila) => !String(fila.Player ?? "").trim());
    assert.equal(sinNombre.length, 0, `${nombre}: ${sinNombre.length} filas sin jugador`);
    const minutos = rows.map((fila) => numeric(fila["Minutes played"]));
    assert.ok(minutos.every((m) => Number.isFinite(m) && m >= 0), `${nombre}: minutos ilegibles`);
  }
});

test("los nombres llegan sin caracteres rotos", { skip: sinArchivos }, () => {
  for (const { nombre, rows } of leidos) {
    const rotos = rows.map((fila) => `${fila.Player} ${fila.Team ?? ""}`).filter((texto) => /Ã.|Â|�/.test(texto));
    assert.deepEqual(rotos.slice(0, 5), [], `${nombre}`);
  }
});

test("las cifras se leen como números: comas decimales y porcentajes incluidos", { skip: sinArchivos }, () => {
  const deTexto = /^(Player|Full name|Team|Team within selected timeframe|Position|Birth country|Passport country|Foot|Contract expires|On loan|Birth date|Market value|Height|Weight|Age)$/;
  for (const { nombre, rows } of leidos) {
    const malas = [];
    for (const fila of rows) {
      for (const [columna, valor] of Object.entries(fila)) {
        if (deTexto.test(columna) || valor === null || valor === undefined || valor === "" || typeof valor === "number") continue;
        if (Number.isNaN(numeric(valor)) && malas.length < 5) malas.push(`${columna}=${JSON.stringify(valor)}`);
      }
    }
    assert.deepEqual(malas, [], nombre);
  }
});

test("las fechas de nacimiento salen como fecha, no como número de serie de Excel", { skip: sinArchivos }, () => {
  for (const { nombre, rows } of leidos) {
    const fechas = rows.map((fila) => fila["Birth date"]).filter((valor) => valor !== undefined && valor !== null && valor !== "");
    if (!fechas.length) continue;
    const raras = fechas.filter((valor) => !/^\d{4}-\d{2}-\d{2}$/.test(String(valor)));
    assert.deepEqual(raras.slice(0, 5), [], nombre);
  }
});

test("los puestos de Wyscout tienen todos su cohorte", { skip: sinArchivos }, () => {
  for (const { nombre, rows } of leidos) {
    const sinCohorte = rows.filter((fila) => String(fila.Position ?? "").trim() && cohortOf(fila.Position) === "OTHER");
    assert.ok(sinCohorte.length <= rows.length * 0.02, `${nombre}: ${sinCohorte.length} sin cohorte, p. ej. ${sinCohorte.slice(0, 3).map((f) => f.Position).join(" · ")}`);
  }
});

test("juntas, cada ficha con minutos da índice y percentiles entre 0 y 100", { skip: sinArchivos }, () => {
  const { rows } = aggregateDatasets(leidos.map((leido) => leido.base));
  let fichas = 0;
  rows.forEach((fila, indice) => {
    if (numeric(fila["Minutes played"]) < 900 || fichas >= 300) return;
    const informe = buildPlayerReport(rows, indice, 900, "AUTO");
    assert.ok(informe, `${fila.Player}: sin ficha`);
    assert.ok(informe.score >= 0 && informe.score <= 100, `${fila.Player}: índice ${informe.score}`);
    for (const metrica of informe.metrics) assert.ok(metrica.percentile >= 0 && metrica.percentile <= 100, `${fila.Player} · ${metrica.label}`);
    fichas += 1;
  });
  assert.ok(fichas > 100, `solo ${fichas} fichas`);
});
