import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEPENDENCIAS, PUERTO, lanzadorDeWindows, ordenDelPuente, pythonsCandidatos, rutaDelPython } from "../scripts/puente.mjs";

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

test("el lanzador de Windows: python.exe en una consola oculta con registro, nunca pythonw", () => {
  const vbs = lanzadorDeWindows("C:\\Users\\Ana Pérez\\py.exe", "C:\\Users\\Ana Pérez\\puente.log", "C:\\Mis cosas\\scripts");
  // Con pythonw.exe sys.stdout es None y uvicorn no llega a montar su registro.
  assert.doesNotMatch(vbs, /pythonw/i);
  assert.equal(
    vbs,
    'CreateObject("WScript.Shell").Run "cmd /c """"C:\\Users\\Ana Pérez\\py.exe"" -X utf8 -m uvicorn bg-server:app --app-dir ""C:\\Mis cosas\\scripts"" --port 7001 --log-level warning > ""C:\\Users\\Ana Pérez\\puente.log"" 2>&1""", 0, False\r\n',
  );
});

test("la carpeta de Windows: cada .cmd es ASCII y llama a una acción que fos-puente.ps1 conoce", () => {
  const carpeta = fileURLToPath(new URL("../scripts/windows/", import.meta.url));
  const script = readFileSync(join(carpeta, "sistema", "fos-puente.ps1"));
  // Sin BOM, PowerShell 5.1 lo lee en la página de códigos de Windows y rompe las tildes.
  assert.deepEqual([...script.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const acciones = new Set([...script.toString("utf8").matchAll(/^\s*"([a-z]+)" \{/gm)].map((m) => m[1]));
  // PowerShell no distingue mayúsculas: un $python local pisaba al $Python del
  // entorno y la instalación se paraba en el paso de las librerías.
  const codigo = script.toString("utf8").split(/\r?\n/).filter((linea) => !linea.trim().startsWith("#")).join("\n");
  const globales = [...codigo.matchAll(/^\$([A-Za-z]+) = /gm)].map((m) => m[1]);
  for (const [, variable] of codigo.matchAll(/\$([A-Za-z]+)\b/g)) {
    const pisada = globales.find((g) => g !== variable && g.toLowerCase() === variable.toLowerCase());
    assert.equal(pisada, undefined, `$${variable} pisa a $${pisada}`);
  }
  const lanzadores = readdirSync(carpeta).filter((nombre) => nombre.endsWith(".cmd"));
  assert.ok(lanzadores.length >= 5);
  for (const nombre of lanzadores) {
    const texto = readFileSync(join(carpeta, nombre), "latin1");
    // cmd.exe lee el .cmd en la página de códigos OEM: una tilde saldría rota.
    assert.match(texto, /^[\x00-\x7f]*$/, `${nombre}: solo ASCII`);
    const llamadas = [...texto.matchAll(/fos-puente\.ps1" ([a-z]+)/g)].map((m) => m[1]);
    assert.ok(llamadas.length > 0, nombre);
    for (const accion of llamadas) assert.ok(acciones.has(accion), `${nombre} llama a «${accion}»`);
  }
});
