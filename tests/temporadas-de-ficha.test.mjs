import assert from "node:assert/strict";
import test from "node:test";
import { temporadasDeFicha } from "../lib/temporadasDeFicha.ts";
import { nuevaTemporadaAMano } from "../lib/temporadasAMano.ts";

const base = (anio, cambios = {}) => ({
  etiqueta: String(anio), anio, ligas: ["CPL"], equipo: "Cavalry FC", equipoPorLiga: { CPL: "Cavalry FC" },
  partidos: 10, minutos: 800, goles: 1, asistencias: 2, ...cambios,
});
const manual = (etiqueta, liga = "USL Championship", equipo = "Pittsburgh", cambios = {}) => nuevaTemporadaAMano({
  etiqueta, liga, equipo, partidos: 5, minutos: 350, goles: 1, asistencias: 2, origen: "mano", ...cambios,
});
const clave = (temporada) => `mano:${temporada.id}`;

test("varias temporadas de la base se muestran sin límite y aportan todos sus años al radar", () => {
  const actual = base(2026);
  const anteriores = [base(2023), base(2025), base(2024)];
  const resultado = temporadasDeFicha(actual, [actual, ...anteriores], [], ["base:2023", "base:2025", "base:2024", "base:2025"]);
  assert.deepEqual(resultado.anteriores.map((temporada) => temporada.anio), [2025, 2024, 2023]);
  assert.deepEqual(resultado.anios, [2026, 2025, 2024, 2023]);
  assert.equal(resultado.adicionales.length, 3);
  assert.deepEqual(resultado.seleccion, ["base:2023", "base:2025", "base:2024"]);
});

test("cada año anterior admite varias ligas manuales, agrupadas junto a su temporada", () => {
  const actual = base(2026);
  const otraActual = manual("2026", "MLS", "Toronto FC");
  const otra2025 = manual("2025");
  const principal2024 = manual("2024", "Liga MX", "Pumas");
  const otra2024 = manual("2024", "MLS", "Toronto FC");
  const resultado = temporadasDeFicha(actual, [base(2025)], [otra2024, otraActual, otra2025, principal2024],
    [clave(principal2024), "base:2025", clave(otra2025), clave(otra2024)]);
  assert.deepEqual(resultado.adicionales.map((temporada) => [temporada.etiqueta, temporada.ligas[0]]), [
    ["2026", "MLS"], ["2025", "CPL"], ["2025", "USL Championship"], ["2024", "MLS"], ["2024", "Liga MX"],
  ]);
  assert.deepEqual(resultado.anios, [2026, 2025], "las ligas manuales aportan filas, no años de métricas inexistentes");
});

test("sin selección guardada se propone la base anterior; una selección vacía excluye todas las anteriores", () => {
  const actual = base(2026);
  const manual2025 = manual("2025");
  const manualActual = manual("2026");
  assert.deepEqual(temporadasDeFicha(actual, [base(2024)], [manual2025]).seleccion, ["base:2024"]);
  assert.deepEqual(temporadasDeFicha(actual, [], [manual("2023"), manual2025]).seleccion, [clave(manual2025)]);
  const vacia = temporadasDeFicha(actual, [base(2025)], [manual2025, manualActual], []);
  assert.deepEqual(vacia.anteriores, []);
  assert.deepEqual(vacia.anios, [2026]);
  assert.deepEqual(vacia.otrasLigasActuales.map((temporada) => temporada.aMano.id), [manualActual.id]);
  assert.equal(vacia.adicionales.length, 1, "la otra liga del año actual sigue visible");
});

test("al cambiar la referencia se excluyen años posteriores y una temporada cruzada usa el año inicial", () => {
  const cruzada = base(2025, { etiqueta: "2024/2025" });
  const vieja = manual("2023/2024");
  const misma = manual("2024", "MLS");
  const futura = manual("2025", "USL Championship");
  const resultado = temporadasDeFicha(cruzada, [base(2026), base(2024), base(2023)], [vieja, misma, futura],
    ["base:2026", "base:2024", "base:2023", clave(vieja), clave(futura)]);
  assert.deepEqual(resultado.opciones.map((opcion) => opcion.clave), ["base:2023", clave(vieja)]);
  assert.deepEqual(resultado.anios, [2025, 2024, 2023], "el cruce incluye la liga de calendario 2024 y la de curso 2024/2025");
  assert.deepEqual(resultado.otrasLigasActuales.map((temporada) => [temporada.etiqueta, temporada.aMano?.id]), [["2024", undefined], ["2024", misma.id]]);
  assert.ok(!resultado.adicionales.some((temporada) => temporada.aMano?.id === futura.id));
});

test("las bases de distinto calendario del mismo año inicial se incluyen también con solo la temporada actual", () => {
  const actual = base(2025, { etiqueta: "2024/2025", ligas: ["LaLiga"] });
  const calendario = base(2024, { ligas: ["CPL"] });
  const resultado = temporadasDeFicha(actual, [actual, calendario, calendario, base(2023)], [], []);
  assert.deepEqual(resultado.anteriores, []);
  assert.deepEqual(resultado.otrasLigasActuales, [calendario]);
  assert.deepEqual(resultado.adicionales, [calendario]);
  assert.deepEqual(resultado.anios, [2025, 2024]);
  assert.deepEqual(resultado.opciones.map((opcion) => opcion.clave), ["base:2023"], "el otro calendario del año actual no es una temporada anterior");
});

test("una clave pendiente se conserva hasta que se carga su base, sin añadir minutos o años antes", () => {
  const actual = base(2026);
  const pendiente = temporadasDeFicha(actual, [], [], ["base:2024"]);
  assert.deepEqual(pendiente.seleccion, ["base:2024"]);
  assert.deepEqual(pendiente.anios, [2026]);
  assert.deepEqual(pendiente.anteriores, []);
  const cargada = temporadasDeFicha(actual, [base(2024)], [], pendiente.seleccion);
  assert.deepEqual(cargada.anios, [2026, 2024]);
  assert.equal(cargada.anteriores[0].minutos, 800);
});

test("las claves repetidas no duplican una temporada y los datos de entrada no se modifican", () => {
  const actual = Object.freeze(base(2026));
  const antigua = Object.freeze(base(2025));
  const manualAnterior = Object.freeze(manual("2025"));
  const manualActual = Object.freeze(manual("2026"));
  const bases = Object.freeze([antigua, antigua]);
  const manuales = Object.freeze([manualAnterior, manualActual, manualAnterior, manualActual]);
  const seleccion = Object.freeze(["base:2025", clave(manualAnterior)]);
  const antes = JSON.stringify({ bases, manuales, seleccion });
  const resultado = temporadasDeFicha(actual, bases, manuales, seleccion);
  assert.equal(resultado.opciones.length, 2);
  assert.equal(resultado.otrasLigasActuales.length, 1);
  assert.equal(resultado.adicionales.length, 3);
  assert.equal(JSON.stringify({ bases, manuales, seleccion }), antes);
  assert.notEqual(resultado.seleccion, seleccion);
});

test("sin temporada de referencia no se inventan filas ni selección", () => {
  assert.deepEqual(temporadasDeFicha(null, [base(2025)], [manual("2024")], ["base:2025"]), {
    opciones: [], seleccion: [], anteriores: [], otrasLigasActuales: [], adicionales: [], anios: [],
  });
});
