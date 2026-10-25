#!/usr/bin/env node
/**
 * El puente local (scripts/bg-server.py, puerto 7001) en cualquier equipo.
 *
 *   node scripts/puente.mjs server       arranca el puente en esta ventana
 *   node scripts/puente.mjs reiniciar    para el que esté en el 7001 y lo arranca aparte
 *   node scripts/puente.mjs actualizar   se pone en main, baja lo último y reinicia
 *   node scripts/puente.mjs instalar     crea ~/.rembg-venv con lo que necesita (una vez)
 *   node scripts/puente.mjs inicio       Windows: que arranque solo al iniciar sesión
 *
 * Los comandos de antes eran de macOS: un script de bash y `launchctl`. En el
 * PC de Windows no existía ninguno de los dos y actualizar el puente no tenía
 * un comando. En el Mac, si está el servicio de launchd, se sigue usando:
 * es el que lo levanta al iniciar sesión.
 *
 * Python: el de FOS_PYTHON; si no, el del entorno ~/.rembg-venv; si no, el
 * del sistema. Las credenciales no pasan por aquí: el puente las lee del
 * Llavero (Mac), de ~/.fos-scouting/credentials.json o de variables de entorno.
 * Para un Windows sin repositorio ni Node está `npm run bg:windows`, que lo
 * mete todo en un solo .cmd (scripts/windows/).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUERTO = 7001;
export const DEPENDENCIAS = ["rembg[cpu,cli]", "fastapi", "uvicorn", "python-multipart", "requests"];
const ESTADO = `http://127.0.0.1:${PUERTO}/api/sources/status`;
const SERVICIO_MAC = "com.felipeormazabal.fos-puente";
const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(SCRIPTS);
const WINDOWS = platform() === "win32";
const MAC = platform() === "darwin";

/** Dónde está el Python del entorno virtual: Windows lo pone en Scripts\, el resto en bin/. */
export function rutaDelPython(plataforma = platform(), casa = homedir()) {
  return plataforma === "win32"
    ? join(casa, ".rembg-venv", "Scripts", "python.exe")
    : join(casa, ".rembg-venv", "bin", "python");
}

/** Los Python con los que se puede crear el entorno, del preferido al último recurso. */
export function pythonsCandidatos(plataforma = platform()) {
  return plataforma === "win32"
    ? [["py", ["-3.11"]], ["py", ["-3.12"]], ["py", ["-3"]], ["python", []]]
    : [["python3.11", []], ["python3.12", []], ["python3", []]];
}

/** La orden para arrancar el puente con un Python dado. */
export function ordenDelPuente(python, carpetaScripts = SCRIPTS) {
  return [python, ["-m", "uvicorn", "bg-server:app", "--app-dir", carpetaScripts, "--host", "127.0.0.1", "--port", String(PUERTO), "--log-level", "warning"]];
}

/**
 * El .vbs de la carpeta Inicio de Windows que arranca el puente oculto.
 * pythonw.exe no sirve: sin consola, uvicorn falla al montar su registro. Es
 * python.exe en una consola oculta (el 0 de Run), con la salida a un archivo.
 */
export function lanzadorDeWindows(python, registro, carpetaScripts = SCRIPTS) {
  const [, argumentos] = ordenDelPuente(python, carpetaScripts);
  const comillas = (parte) => (/\s/.test(parte) ? `"${parte}"` : parte);
  const orden = `cmd /c ""${python}" -X utf8 ${argumentos.map(comillas).join(" ")} > "${registro}" 2>&1"`;
  return `CreateObject("WScript.Shell").Run "${orden.replaceAll('"', '""')}", 0, False\r\n`;
}

async function responde() {
  try {
    const respuesta = await fetch(ESTADO, { signal: AbortSignal.timeout(2_000) });
    return respuesta.ok;
  } catch {
    return false;
  }
}

async function esperar(segundos) {
  for (let i = 0; i < segundos; i += 1) {
    if (await responde()) return true;
    await new Promise((resolver) => setTimeout(resolver, 1_000));
  }
  return false;
}

function python() {
  if (process.env.FOS_PYTHON) return process.env.FOS_PYTHON;
  const entorno = rutaDelPython();
  if (existsSync(entorno)) return entorno;
  for (const candidato of WINDOWS ? ["python", "py"] : ["python3", "python"]) {
    if (spawnSync(candidato, ["--version"], { stdio: "ignore", windowsHide: true }).status === 0) return candidato;
  }
  return null;
}

function sinPython() {
  console.error("No encuentro Python para el puente. Créalo una vez con:  npm run bg:instalar");
  console.error("o indica cuál usar con la variable FOS_PYTHON.");
  process.exit(1);
}

/** Los procesos que escuchan en el puerto del puente. */
function quienEscucha() {
  if (WINDOWS) {
    const salida = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true }).stdout ?? "";
    return [...new Set(salida.split(/\r?\n/)
      .map((linea) => linea.trim().split(/\s+/))
      // Escuchando: sin dirección remota. El nombre del estado cambia con el
      // idioma de Windows (LISTENING, ESCUCHANDO), la dirección vacía no.
      .filter((c) => c.length >= 5 && c[1]?.endsWith(`:${PUERTO}`) && /^(0\.0\.0\.0|\[::\]):0$/.test(c[2]))
      .map((c) => c[4]))];
  }
  const salida = spawnSync("lsof", ["-ti", `tcp:${PUERTO}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout ?? "";
  return salida.split(/\s+/).filter(Boolean);
}

function parar() {
  for (const pid of quienEscucha()) {
    if (WINDOWS) spawnSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else {
      try { process.kill(Number(pid), "SIGTERM"); } catch { /* ya no estaba */ }
    }
  }
}

function conServicioMac() {
  return MAC && existsSync(join(homedir(), "Library", "LaunchAgents", `${SERVICIO_MAC}.plist`));
}

async function server() {
  if (await responde()) {
    console.log(`El puente ya está en marcha en el puerto ${PUERTO}. Para reiniciarlo: npm run bg:reiniciar`);
    return;
  }
  const [ejecutable, argumentos] = ordenDelPuente(python() ?? sinPython());
  const hijo = spawn(ejecutable, argumentos, { stdio: "inherit", windowsHide: true });
  hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
}

async function reiniciar() {
  if (conServicioMac()) {
    const uid = spawnSync("id", ["-u"], { encoding: "utf8" }).stdout.trim();
    spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICIO_MAC}`], { stdio: "inherit" });
  } else {
    const [ejecutable, argumentos] = ordenDelPuente(python() ?? sinPython());
    parar();
    // Esperar a que suelte el puerto antes de arrancar el nuevo.
    for (let i = 0; i < 10 && quienEscucha().length; i += 1) await new Promise((resolver) => setTimeout(resolver, 500));
    const carpeta = join(homedir(), ".fos-scouting");
    mkdirSync(carpeta, { recursive: true });
    const registro = join(carpeta, "puente.log");
    const salida = openSync(registro, "a");
    const hijo = spawn(ejecutable, argumentos, { detached: true, stdio: ["ignore", salida, salida], windowsHide: true });
    hijo.unref();
    console.log(`Puente arrancado aparte (registro: ${registro}).`);
  }
  if (await esperar(60)) console.log(`El puente responde en el puerto ${PUERTO}.`);
  else {
    console.error(`El puente no responde en el puerto ${PUERTO}. Mira el registro en ~/.fos-scouting/puente.log o arráncalo a la vista con npm run bg:server.`);
    process.exit(1);
  }
}

function git(...args) {
  const resultado = spawnSync("git", args, { cwd: RAIZ, stdio: "inherit", windowsHide: true });
  if (resultado.status !== 0) {
    console.error(`git ${args.join(" ")} falló: revisa que no haya cambios sin guardar en la carpeta del proyecto.`);
    process.exit(resultado.status ?? 1);
  }
}

async function actualizar() {
  git("checkout", "main");
  git("pull", "--ff-only", "origin", "main");
  await reiniciar();
}

/** Crea ~/.rembg-venv con las librerías del puente y deja preparado credentials.json fuera del Mac. */
function instalar() {
  const destino = rutaDelPython();
  if (!existsSync(destino)) {
    const candidato = pythonsCandidatos().find(([orden, args]) => spawnSync(orden, [...args, "--version"], { stdio: "ignore", windowsHide: true }).status === 0);
    if (!candidato) {
      console.error(WINDOWS
        ? "No encuentro Python. Instala Python 3.11 desde python.org (marca «Add python.exe to PATH») y vuelve a probar."
        : "No encuentro Python 3. Instálalo (por ejemplo, brew install python@3.11) y vuelve a probar.");
      process.exit(1);
    }
    const [orden, args] = candidato;
    console.log(`Creando el entorno con ${[orden, ...args].join(" ")}…`);
    if (spawnSync(orden, [...args, "-m", "venv", join(homedir(), ".rembg-venv")], { stdio: "inherit" }).status !== 0) process.exit(1);
  }
  console.log("Instalando rembg, FastAPI y uvicorn (la primera vez tarda unos minutos)…");
  if (spawnSync(destino, ["-m", "pip", "install", "--upgrade", ...DEPENDENCIAS], { stdio: "inherit" }).status !== 0) process.exit(1);
  // En el Mac las credenciales viven en el Llavero; en el resto, en un archivo fuera del repositorio.
  if (!MAC) {
    const carpeta = join(homedir(), ".fos-scouting");
    const archivo = join(carpeta, "credentials.json");
    if (!existsSync(archivo)) {
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(archivo, `${JSON.stringify({
        statsbomb: { username: "", password: "" },
        skillcorner: { username: "", password: "" },
        anthropic: "",
        "api-football": "",
      }, null, 2)}\n`);
      console.log(`Rellena tus credenciales en ${archivo} (no va al repositorio).`);
    }
  }
  console.log("Listo. Arráncalo con:  npm run bg:server");
}

/** Windows: un acceso en la carpeta Inicio que lo arranca oculto al entrar, como el servicio del Mac. */
function inicio() {
  if (MAC) {
    console.log(`En el Mac ya lo arranca el servicio ${SERVICIO_MAC} al iniciar sesión.`);
    return;
  }
  if (!WINDOWS) {
    console.error("El arranque al iniciar sesión solo está preparado para Windows y Mac.");
    process.exit(1);
  }
  const ejecutable = rutaDelPython();
  if (!existsSync(ejecutable)) sinPython();
  const carpeta = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const archivo = join(carpeta, "fos-puente.vbs");
  const datos = join(homedir(), ".fos-scouting");
  mkdirSync(datos, { recursive: true });
  // En UTF-16 con BOM, para que una ruta con tildes no se rompa al leerla Windows.
  writeFileSync(archivo, `﻿${lanzadorDeWindows(ejecutable, join(datos, "puente.log"))}`, "utf16le");
  console.log(`Hecho: el puente arrancará solo al iniciar sesión (${archivo}).`);
  console.log("Para quitarlo, borra ese archivo.");
}

const ordenes = { server, reiniciar, actualizar, instalar, inicio };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const orden = ordenes[process.argv[2]];
  if (!orden) {
    console.error(`Uso: node scripts/puente.mjs ${Object.keys(ordenes).join(" | ")}`);
    process.exit(1);
  }
  await orden();
}
