import assert from "node:assert/strict";
import test from "node:test";
import { aCsv, nombreDeArchivo, separadorCsv } from "../lib/exportar.ts";
import { setActiveLang } from "../lib/i18n.ts";

/**
 * El CSV que se descarga.
 *
 * Un archivo mal escapado no falla: se abre, y las columnas salen corridas
 * media fila más allá, donde ya nadie mira. Por eso se prueba aquí y no en el
 * navegador.
 */

test("el separador y el decimal van juntos según el idioma", () => {
  setActiveLang("es");
  assert.equal(separadorCsv(), ";");
  assert.match(aCsv(["a"], [[1.5]]), /1,5/, "en español el decimal es coma");
  setActiveLang("en");
  assert.equal(separadorCsv(), ",");
  assert.match(aCsv(["a"], [[1.5]]), /1\.5/, "en inglés el decimal es punto");
  setActiveLang("es");
});

test("una coma decimal nunca parte una fila en dos", () => {
  setActiveLang("es");
  const csv = aCsv(["jugador", "indice"], [["Sánchez", 72.5], ["Ntignee", 48.25]]);
  const cuerpo = csv.replace(/^﻿/, "").trim().split("\r\n");
  for (const linea of cuerpo) {
    assert.equal(linea.split(";").length, 2, `${linea} no tiene dos columnas`);
  }
});

test("las comillas, las comas y los saltos de línea dentro de una celda no rompen nada", () => {
  setActiveLang("en");
  const csv = aCsv(["nota"], [['dijo "sí", y se fue'], ["dos\nlíneas"]]);
  assert.ok(csv.includes('"dijo ""sí"", y se fue"'));
  assert.ok(csv.includes('"dos\nlíneas"'));
  setActiveLang("es");
});

test("lleva BOM, para que Excel no destroce los acentos", () => {
  /* Sin él "Sánchez" se abre como "SÃ¡nchez". Es un archivo de nombres
     propios: no es cosmético. */
  const csv = aCsv(["jugador"], [["Alexis Sánchez"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
});

test("los números salen sin comillas, para poder ordenarlos en Excel", () => {
  setActiveLang("en");
  const csv = aCsv(["min"], [[2537]]);
  assert.ok(csv.includes("\r\n2537\r\n"), csv);
  setActiveLang("es");
});

test("una celda que empieza por = no se ejecuta como fórmula", () => {
  /* Los nombres de club los escribe el proveedor, no nosotros. */
  const csv = aCsv(["equipo"], [["=1+1"], ["-Cavalry"], ["@aqui"]]);
  assert.ok(csv.includes(`"'=1+1"`));
  assert.ok(csv.includes(`"'-Cavalry"`));
  assert.ok(csv.includes(`"'@aqui"`));
});

test("un valor que falta queda vacío, no como 'undefined'", () => {
  const csv = aCsv(["a", "b", "c"], [[null, undefined, Number.NaN]]);
  const fila = csv.replace(/^﻿/, "").trim().split("\r\n")[1];
  assert.equal(fila, ";;");
});

test("el nombre del archivo dice qué hay dentro y lleva la fecha", () => {
  const nombre = nombreDeArchivo(["ranking", "Delanteros", "Canadian Premier League"]);
  assert.match(nombre, /^ranking-delanteros-canadian-premier-league-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("el nombre del archivo aguanta acentos, barras y huecos", () => {
  const nombre = nombreDeArchivo(["Búsqueda", "Ligue 3 / 2026", null, "", "Ñ"]);
  assert.match(nombre, /^busqueda-ligue-3-2026-n-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.ok(!/[^a-z0-9.-]/.test(nombre), nombre);
});
