import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DEPENDENCIAS, PUERTO, lanzadorDeWindows, ordenDelPuente, pythonsCandidatos, rutaDelPython } from "../scripts/puente.mjs";
import { MARCA_PUENTE, MARCA_SCRIPT, empaquetar } from "../scripts/windows/empaquetar.mjs";

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
    'CreateObject("WScript.Shell").Run "cmd /c """"C:\\Users\\Ana Pérez\\py.exe"" -X utf8 -m uvicorn bg-server:app --app-dir ""C:\\Mis cosas\\scripts"" --host 127.0.0.1 --port 7001 --log-level warning > ""C:\\Users\\Ana Pérez\\puente.log"" 2>&1""", 0, False\r\n',
  );
});

test("fos-puente.ps1: un solo BOM al principio y ninguna variable que pise a otra", () => {
  const script = readFileSync(fileURLToPath(new URL("../scripts/windows/fos-puente.ps1", import.meta.url)));
  // Sin BOM, PowerShell 5.1 lo lee en la página de códigos de Windows y rompe las tildes.
  assert.deepEqual([...script.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const texto = script.toString("utf8").slice(1);
  // Un segundo BOM en medio rompe el param() del principio.
  assert.ok(!texto.includes("\uFEFF"));
  // PowerShell no distingue mayúsculas: un $python local pisaba al $Python del
  // entorno y la instalación se paraba en el paso de las librerías.
  const codigo = texto.split(/\r?\n/).filter((linea) => !linea.trim().startsWith("#")).join("\n");
  const globales = [...codigo.matchAll(/^\$([A-Za-z]+) = /gm)].map((m) => m[1]);
  for (const [, variable] of codigo.matchAll(/\$([A-Za-z]+)\b/g)) {
    const pisada = globales.find((g) => g !== variable && g.toLowerCase() === variable.toLowerCase());
    assert.equal(pisada, undefined, `$${variable} pisa a $${pisada}`);
  }
});

test("FOS Scout Lab.cmd: un solo archivo con el lanzador, el script y el puente dentro", () => {
  const script = readFileSync(fileURLToPath(new URL("../scripts/windows/fos-puente.ps1", import.meta.url)), "utf8");
  const puente = readFileSync(fileURLToPath(new URL("../scripts/bg-server.py", import.meta.url)));
  const cmd = empaquetar(script, puente);
  // Cada marca una vez: PowerShell parte el archivo por la primera que encuentra.
  for (const marca of [MARCA_SCRIPT, MARCA_PUENTE]) assert.equal(cmd.split(marca).length, 2, marca);
  const [lanzador, resto] = cmd.split(MARCA_SCRIPT);
  const [cuerpo, comprimido] = resto.split(MARCA_PUENTE);
  // cmd.exe lee el lanzador en la página de códigos OEM, y un BOM delante rompería "@echo off".
  assert.match(lanzador, /^@echo off\r\n/);
  assert.match(lanzador, /^[\x00-\x7f]*$/);
  assert.match(lanzador, /\r\nexit \/b\r\n$/);
  assert.ok(!cuerpo.includes("\uFEFF"));
  assert.match(cuerpo, /"todo" \{ Todo \}/);
  // El puente sale de dentro byte a byte.
  assert.ok(gunzipSync(Buffer.from(comprimido, "base64")).equals(puente));
});
