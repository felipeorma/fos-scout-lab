import assert from "node:assert/strict";
import test from "node:test";
import { DEPENDENCIAS, PUERTO, ordenDelPuente, pythonsCandidatos, rutaDelPython } from "../scripts/puente.mjs";

/**
 * El puente tiene que arrancar igual en el Mac y en Windows. Lo que cambia
 * entre los dos —dónde deja Python el entorno virtual y con qué orden se
 * llama a Python— se decide en funciones puras, y aquí se comprueba sin
 * tener que estar en cada sistema.
 */

test("el Python del entorno: Scripts\\python.exe en Windows, bin/python en el resto", () => {
  assert.match(rutaDelPython("win32", "C:\\Users\\felipe"), /\.rembg-venv[\\/]Scripts[\\/]python\.exe$/);
  assert.match(rutaDelPython("darwin", "/Users/felipe"), /\.rembg-venv\/bin\/python$/);
  assert.match(rutaDelPython("linux", "/home/felipe"), /\.rembg-venv\/bin\/python$/);
});

test("en Windows se busca Python con el lanzador py; en el Mac, python3.11 primero", () => {
  assert.deepEqual(pythonsCandidatos("win32")[0], ["py", ["-3.11"]]);
  assert.deepEqual(pythonsCandidatos("darwin")[0], ["python3.11", []]);
});

test("la orden del puente: uvicorn con la app de scripts/ en el puerto 7001", () => {
  const [python, argumentos] = ordenDelPuente("/x/python", "/repo/scripts");
  assert.equal(python, "/x/python");
  assert.deepEqual(argumentos.slice(0, 3), ["-m", "uvicorn", "bg-server:app"]);
  assert.equal(argumentos[argumentos.indexOf("--app-dir") + 1], "/repo/scripts");
  assert.equal(argumentos[argumentos.indexOf("--port") + 1], String(PUERTO));
  assert.equal(PUERTO, 7001);
  // requests lo usa el puente para StatsBomb y SkillCorner: no puede faltar en la instalación.
  assert.ok(DEPENDENCIAS.includes("requests") && DEPENDENCIAS.includes("fastapi"));
});
