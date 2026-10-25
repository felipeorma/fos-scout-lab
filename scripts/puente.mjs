#!/usr/bin/env node
/**
 * El puente local (scripts/bg-server.py, puerto 7001) en cualquier equipo.
 *
 *   node scripts/puente.mjs server       arranca el puente en esta ventana
 *   node scripts/puente.mjs reiniciar    para el que esté en el 7001 y lo arranca aparte
 *   node scripts/puente.mjs actualizar   se pone en main, baja lo último y reinicia
 *
 * Los comandos de antes eran de macOS: un script de bash y `launchctl`. En el
 * PC de Windows no existía ninguno de los dos y actualizar el puente no tenía
 * un comando. En el Mac, si está el servicio de launchd, se sigue usando:
 * es el que lo levanta al iniciar sesión.
 *
 * Python: el de FOS_PYTHON; si no, el del entorno ~/.rembg-venv; si no, el
 * del sistema. Las credenciales no pasan por aquí: el puente las lee del
 * Llavero (Mac), de ~/.fos-scouting/credentials.json o de variables de entorno.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUERTO = 7001;
const ESTADO = `http://127.0.0.1:${PUERTO}/api/sources/status`;
const SERVICIO_MAC = "com.felipeormazabal.fos-puente";
const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const RAIZ = dirname(SCRIPTS);
const WINDOWS = platform() === "win32";
const MAC = platform() === "darwin";

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
  const entorno = join(homedir(), ".rembg-venv", WINDOWS ? "Scripts" : "bin", WINDOWS ? "python.exe" : "python");
  if (existsSync(entorno)) return entorno;
  for (const candidato of WINDOWS ? ["python", "py"] : ["python3", "python"]) {
    if (spawnSync(candidato, ["--version"], { stdio: "ignore", windowsHide: true }).status === 0) return candidato;
  }
  return null;
}

function sinPython() {
  console.error("No encuentro Python para el puente. Instálalo una vez:");
  if (WINDOWS) {
    console.error("  py -3.11 -m venv %USERPROFILE%\\.rembg-venv");
    console.error("  %USERPROFILE%\\.rembg-venv\\Scripts\\pip install \"rembg[cpu,cli]\" fastapi uvicorn python-multipart requests");
  } else {
    console.error("  python3.11 -m venv ~/.rembg-venv");
    console.error("  ~/.rembg-venv/bin/pip install \"rembg[cpu,cli]\" fastapi uvicorn python-multipart requests");
  }
  console.error("o indica cuál usar con la variable FOS_PYTHON.");
  process.exit(1);
}

const argumentos = ["-m", "uvicorn", "bg-server:app", "--app-dir", SCRIPTS, "--host", "127.0.0.1", "--port", String(PUERTO), "--log-level", "warning"];

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
  const ejecutable = python() ?? sinPython();
  const hijo = spawn(ejecutable, argumentos, { stdio: "inherit", windowsHide: true });
  hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
}

async function reiniciar() {
  if (conServicioMac()) {
    const uid = spawnSync("id", ["-u"], { encoding: "utf8" }).stdout.trim();
    spawnSync("launchctl", ["kickstart", "-k", `gui/${uid}/${SERVICIO_MAC}`], { stdio: "inherit" });
  } else {
    const ejecutable = python() ?? sinPython();
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

const ordenes = { server, reiniciar, actualizar };
const orden = ordenes[process.argv[2]];
if (!orden) {
  console.error("Uso: node scripts/puente.mjs server | reiniciar | actualizar");
  process.exit(1);
}
await orden();
