import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { estaTraducido, setActiveLang, t, tf } from "../lib/i18n.ts";

/**
 * Que no quede nada sin traducir.
 *
 * El español es el idioma fuente y `t()` devuelve la clave tal cual cuando no
 * la encuentra, así que un texto sin entrada en el diccionario no rompe nada:
 * simplemente sale en español en medio de la versión inglesa, y eso solo se
 * descubre cambiando de idioma y leyendo pantalla por pantalla. Ya ha pasado
 * varias veces. Esto recorre el código, saca cada literal que se pasa por
 * `t()` o `tf()` y comprueba que tenga traducción.
 */

const FUENTES = ["app", "lib"]
  .flatMap((dir) => readdirSync(dir).map((archivo) => `${dir}/${archivo}`))
  .filter((ruta) => /\.tsx?$/.test(ruta) && !ruta.endsWith("lib/i18n.ts"));

/* Solo literales: `t(variable)` y `tDefault(...)` traducen en tiempo de
   ejecución y no se pueden mirar desde aquí. Se aceptan comillas dobles y
   simples, y se escapan las que van dentro del texto. */
const LLAMADA = /\bt(?:f)?\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

function literalesDe(ruta) {
  const codigo = readFileSync(ruta, "utf8");
  const salida = [];
  for (const [, comillas] of codigo.matchAll(LLAMADA)) {
    salida.push(JSON.parse(comillas[0] === "'"
      ? `"${comillas.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`
      : comillas));
  }
  return salida;
}

test("cada texto que pasa por t() o tf() tiene traducción al inglés", () => {
  const faltan = [];
  for (const ruta of FUENTES) {
    for (const texto of literalesDe(ruta)) {
      if (!texto.trim()) continue;
      if (!estaTraducido(texto)) faltan.push(`${ruta}: ${JSON.stringify(texto)}`);
    }
  }
  assert.deepEqual(faltan, [], `Sin traducir:\n${faltan.join("\n")}`);
});

test("los huecos de tf() sobreviven a la traducción", () => {
  /* Una traducción que se coma un `{n}` deja el número fuera de la frase sin
     avisar: el texto sale entero y solo falta el dato. */
  const rotos = [];
  for (const ruta of FUENTES) {
    const codigo = readFileSync(ruta, "utf8");
    for (const [, comillas] of codigo.matchAll(/\btf\(\s*("(?:[^"\\]|\\.)*")/g)) {
      const plantilla = JSON.parse(comillas);
      if (!estaTraducido(plantilla)) continue;
      setActiveLang("en");
      const traducida = t(plantilla);
      setActiveLang("es");
      const huecos = (texto) => [...texto.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
      const esperados = huecos(plantilla);
      if (String(esperados) !== String(huecos(traducida))) {
        rotos.push(`${ruta}: ${JSON.stringify(plantilla)} → ${JSON.stringify(traducida)}`);
      }
    }
  }
  assert.deepEqual(rotos, [], `Huecos perdidos:\n${rotos.join("\n")}`);
});

test("el numerado de los pasos de similitud es correcto en inglés y español", () => {
  /* Los rótulos "1 · Liga… 5 · Medir contra" se numeran ahora en tiempo de
     ejecución, así que las piezas sueltas tienen que estar traducidas. */
  for (const pieza of ["Liga", "Año", "Club", "Jugador", "Medir contra"]) {
    assert.ok(estaTraducido(pieza), `falta "${pieza}"`);
  }
});

test("el plural de las bases y las ligas existe en las dos formas", () => {
  setActiveLang("en");
  assert.equal(tf("{n} jugadores · {b} base", { n: 208, b: 1 }), "208 players · 1 database");
  assert.equal(tf("{n} jugadores · {b} bases", { n: 900, b: 4 }), "900 players · 4 databases");
  assert.equal(tf("{n} liga", { n: 1 }), "1 league");
  assert.equal(tf("{n} ligas", { n: 6 }), "6 leagues");
  setActiveLang("es");
});
