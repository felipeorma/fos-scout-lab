#!/usr/bin/env node
/**
 * El puente local (scripts/bg-server.py, puerto 7001) en macOS y en Windows.
 *
 *   npm run bg:server     lo arranca, o avisa si ya está en marcha
 *   npm run bg:instalar   crea el entorno de Python con lo que necesita (una vez)
 *   npm run bg:inicio     Windows: que arranque solo al iniciar sesión
 *   npm run bg:reiniciar  lo para y lo vuelve a arrancar
 *
 * En el Mac lo mantiene vivo el servicio com.felipeormazabal.fos-puente
 * (LaunchAgent); `bg:reiniciar` sigue usándolo. En Windows no hay Llavero: las
 * credenciales van en ~/.fos-scouting/credentials.json, que `bg:instalar`
 * deja preparado para rellenar. Nunca dentro del repositorio, que es público.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUERTO = 7001;
export const DEPENDENCIAS = ["rembg[cpu,cli]", "fastapi", "uvicorn", "python-multipart", "requests"];
const CARPETA_SCRIPTS = dirname(fileURLToPath(import.meta.url));

/** Dónde está el Python del entorno virtual: Windows lo pone en Scripts\, el resto en bin/. */
export function rutaDelPython(plataforma = process.platform, casa = homedir()) {
  return plataforma === "win32"
    ? join(casa, ".rembg-venv", "Scripts", "python.exe")
    : join(casa, ".rembg-venv", "bin", "python");
}

/** Los Python con los que se puede crear el entorno, del preferido al último recurso. */
export function pythonsCandidatos(plataforma = process.platform) {
  return plataforma === "win32"
    ? [["py", ["-3.11"]], ["py", ["-3.12"]], ["py", ["-3"]], ["python", []]]
    : [["python3.11", []], ["python3.12", []], ["python3", []]];
}

/** La orden para arrancar el puente con un Python dado. */
export function ordenDelPuente(python, carpetaScripts = CARPETA_SCRIPTS) {
  return [python, ["-m", "uvicorn", "bg-server:app", "--app-dir", carpetaScripts, "--port", String(PUERTO), "--log-level", "warning"]];
}

/**
 * El .vbs de la carpeta Inicio de Windows que arranca el puente oculto.
 * pythonw.exe no sirve: sin consola, uvicorn falla al montar su registro. Es
 * python.exe en una consola oculta (el 0 de Run), con la salida a un archivo.
 */
export function lanzadorDeWindows(python, registro, carpetaScripts = CARPETA_SCRIPTS) {
  const [, argumentos] = ordenDelPuente(python, carpetaScripts);
  const comillas = (parte) => (/\s/.test(parte) ? `"${parte}"` : parte);
  const orden = `cmd /c ""${python}" -X utf8 ${argumentos.map(comillas).join(" ")} > "${registro}" 2>&1"`;
  return `CreateObject("WScript.Shell").Run "${orden.replaceAll('"', '""')}", 0, False\r\n`;
}

async function enMarcha() {
  try {
    const respuesta = await fetch(`http://127.0.0.1:${PUERTO}/api/sources/status`, { signal: AbortSignal.timeout(2000) });
    return respuesta.status < 500;
  } catch {
    return false;
  }
}

function avisoDeInstalacion() {
  console.error("No encuentro el entorno de Python del puente (~/.rembg-venv).");
  console.error("Créalo una vez con:  npm run bg:instalar");
}

async function arrancar() {
  if (await enMarcha()) {
    console.log(`El puente ya está en marcha en el puerto ${PUERTO}.`);
    console.log("Para reiniciarlo tras cambiar el código: npm run bg:reiniciar");
    return 0;
  }
  const python = rutaDelPython();
  if (!existsSync(python)) {
    avisoDeInstalacion();
    return 1;
  }
  const [orden, argumentos] = ordenDelPuente(python);
  console.log(`Arrancando el puente en http://127.0.0.1:${PUERTO} (Ctrl+C para pararlo)…`);
  const hijo = spawn(orden, argumentos, { stdio: "inherit" });
  for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => hijo.kill(senal));
  return await new Promise((resolver) => hijo.on("exit", (codigo) => resolver(codigo ?? 0)));
}

function instalar() {
  const destino = rutaDelPython();
  if (!existsSync(destino)) {
    const candidato = pythonsCandidatos().find(([orden, args]) => spawnSync(orden, [...args, "--version"], { stdio: "ignore" }).status === 0);
    if (!candidato) {
      console.error(process.platform === "win32"
        ? "No encuentro Python. Instala Python 3.11 desde python.org (marca «Add python.exe to PATH») y vuelve a probar."
        : "No encuentro Python 3. Instálalo (por ejemplo, brew install python@3.11) y vuelve a probar.");
      return 1;
    }
    const [orden, args] = candidato;
    console.log(`Creando el entorno con ${[orden, ...args].join(" ")}…`);
    if (spawnSync(orden, [...args, "-m", "venv", join(homedir(), ".rembg-venv")], { stdio: "inherit" }).status !== 0) return 1;
  }
  console.log("Instalando rembg, FastAPI y uvicorn (la primera vez tarda unos minutos)…");
  const pip = spawnSync(destino, ["-m", "pip", "install", "--upgrade", ...DEPENDENCIAS], { stdio: "inherit" });
  if (pip.status !== 0) return 1;
  // En el Mac las credenciales viven en el Llavero; en el resto, en un archivo fuera del repositorio.
  if (process.platform !== "darwin") {
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
  return 0;
}

/** Windows: un acceso en la carpeta Inicio que lo arranca oculto al entrar, como el LaunchAgent del Mac. */
function arranqueAlIniciar() {
  if (process.platform === "darwin") {
    console.log("En el Mac ya lo arranca el servicio com.felipeormazabal.fos-puente al iniciar sesión.");
    return 0;
  }
  if (process.platform !== "win32") {
    console.log("El arranque al iniciar sesión solo está preparado para Windows y Mac.");
    return 1;
  }
  const python = rutaDelPython();
  if (!existsSync(python)) {
    avisoDeInstalacion();
    return 1;
  }
  const inicio = join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const archivo = join(inicio, "fos-puente.vbs");
  const datos = join(homedir(), ".fos-scouting");
  mkdirSync(datos, { recursive: true });
  // En UTF-16 con BOM, para que una ruta con tildes no se rompa al leerla Windows.
  writeFileSync(archivo, `\ufeff${lanzadorDeWindows(python, join(datos, "puente.log"))}`, "utf16le");
  console.log(`Hecho: el puente arrancará solo al iniciar sesión (${archivo}).`);
  console.log("Para quitarlo, borra ese archivo.");
  return 0;
}

/** El proceso que escucha en el puerto del puente, en Windows. */
function pidEnWindows() {
  const salida = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).stdout ?? "";
  const linea = salida.split(/\r?\n/).find((l) => new RegExp(`127\\.0\\.0\\.1:${PUERTO}\\s.*LISTENING`).test(l));
  return linea ? linea.trim().split(/\s+/).pop() : null;
}

async function reiniciar() {
  if (process.platform === "darwin") {
    const uid = spawnSync("id", ["-u"], { encoding: "utf8" }).stdout.trim();
    return spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/com.felipeormazabal.fos-puente`], { stdio: "inherit" }).status ?? 1;
  }
  const pid = process.platform === "win32" ? pidEnWindows() : null;
  if (pid) spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "inherit" });
  return arrancar();
}

const ACCIONES = { arrancar, instalar, inicio: arranqueAlIniciar, reiniciar };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const accion = ACCIONES[process.argv[2] ?? "arrancar"];
  if (!accion) {
    console.error(`Acción desconocida: ${process.argv[2]}. Usa: ${Object.keys(ACCIONES).join(", ")}.`);
    process.exit(1);
  }
  process.exitCode = await accion();
}
