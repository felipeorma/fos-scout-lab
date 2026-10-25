#!/usr/bin/env node
/**
 * «FOS Scout Lab.cmd»: el puente local de Windows en un solo archivo.
 *
 *   npm run bg:windows   lo deja en dist/FOS Scout Lab.cmd
 *
 * Une un lanzador de cmd, fos-puente.ps1 y bg-server.py (comprimido) en un
 * .cmd que se abre con doble clic. cmd.exe solo lee las primeras líneas, que
 * le dicen a PowerShell que lea el resto del propio archivo: el script hasta
 * la marca del puente, y el puente tras ella. Hay que rehacerlo cuando cambia
 * el puente o el script.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const MARCA_SCRIPT = "##PS##";
export const MARCA_PUENTE = "##PUENTE##";

// Solo ASCII y con finales de Windows: cmd.exe lee estas líneas en la página
// de códigos OEM. Las marcas se escriben partidas ('#'+'#PS##') para que el
// IndexOf no las encuentre en esta misma línea.
const LANZADOR = [
  "@echo off",
  "rem FOS Scout Lab: doble clic y listo. Instala lo que falte, arranca el puente",
  "rem local con las credenciales guardadas y abre la app en http://127.0.0.1:7001/",
  "title FOS Scout Lab",
  "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$f='%~f0'; $t=[IO.File]::ReadAllText($f,[Text.Encoding]::UTF8); "
    + "$a=$t.IndexOf('#'+'#PS##'); $b=$t.IndexOf('#'+'#PUENTE##'); "
    + "& ([ScriptBlock]::Create($t.Substring($a, $b - $a))) -Accion '%~1' -Archivo $f\"",
  "echo.",
  "pause",
  "exit /b",
].join("\r\n");

/** El .cmd entero, a partir del texto de fos-puente.ps1 y los bytes de bg-server.py. */
export function empaquetar(script, puente) {
  // Sin BOM: delante de @echo off rompería la primera orden, y en medio es un carácter suelto.
  const cuerpo = script.replace(/^﻿/, "").replace(/\r?\n/g, "\r\n").trimEnd();
  const comprimido = gzipSync(puente, { level: 9 }).toString("base64").match(/.{1,100}/g).join("\r\n");
  return `${LANZADOR}\r\n${MARCA_SCRIPT}\r\n${cuerpo}\r\n${MARCA_PUENTE}\r\n${comprimido}\r\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const raiz = join(aqui, "..", "..");
  const cmd = empaquetar(readFileSync(join(aqui, "fos-puente.ps1"), "utf8"), readFileSync(join(raiz, "scripts", "bg-server.py")));
  const destino = join(raiz, "dist", "FOS Scout Lab.cmd");
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, cmd);
  console.log(`Hecho: ${destino} (${Math.round(cmd.length / 1024)} KB). Cópialo al escritorio de Windows y ábrelo con doble clic.`);
}
