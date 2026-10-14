import * as XLSX from "xlsx";
import type { CellValue } from "./scouting";

/**
 * Leer un archivo de Wyscout (o cualquier hoja) sin que los números, las
 * fechas o los acentos cambien por el camino.
 *
 * Vivía dentro de ScoutStudio y tenía tres fugas que no se veían en pantalla
 * pero cambiaban el dato:
 * - Un CSV europeo (";" entre columnas, "0,45" como decimal) llegaba con
 *   "0,45" convertido en 45: SheetJS toma la coma por separador de miles.
 * - Las fechas de Excel llegaban como objetos Date. Al pasarlos a texto se
 *   leían en la hora local —"Sat Dec 30 2028 17:00:00 GMT-0700" para un
 *   contrato que vence el 31— y la fecha de nacimiento dejaba de servir para
 *   distinguir a dos jugadores con el mismo nombre.
 * - Un CSV guardado en Latin-1 (Excel en Windows) se leía como UTF-8 y
 *   "Atlético" salía "Atl�tico".
 */

/** Texto de un CSV en la codificación que traiga: UTF-8, UTF-16 o, si no es UTF-8 válido, Windows-1252 (Latin-1). */
export function decodificarTexto(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Un byte suelto por encima de 0x7F no es UTF-8: es Latin-1 / Windows-1252,
    // que es lo que guarda Excel en Windows. Windows-1252 es superconjunto de
    // Latin-1 y además trae comillas tipográficas y el euro.
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** El separador de columnas: el que más aparece en la primera línea, fuera de comillas. */
export function separadorDeColumnas(texto: string): "," | ";" | "\t" {
  const linea = texto.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const declarado = linea.match(/^sep=(.)$/i);
  if (declarado && [",", ";", "\t"].includes(declarado[1])) return declarado[1] as "," | ";" | "\t";
  const cuenta = { ",": 0, ";": 0, "\t": 0 };
  let entreComillas = false;
  for (const letra of linea) {
    if (letra === "\"") entreComillas = !entreComillas;
    else if (!entreComillas && letra in cuenta) cuenta[letra as keyof typeof cuenta] += 1;
  }
  if (cuenta[";"] > cuenta[","] && cuenta[";"] >= cuenta["\t"]) return ";";
  if (cuenta["\t"] > cuenta[","]) return "\t";
  return ",";
}

const DECIMAL_CON_COMA = /^[+-]?\d+,\d+%?$/;
const DECIMAL_CON_PUNTO = /^[+-]?\d+\.\d+%?$/;

/**
 * El separador decimal de un CSV. Con "," entre columnas no puede ser la coma
 * (partiría las celdas). Con ";" o tabulador manda lo que se vea en las
 * celdas; si no hay decimales a la vista, ";" es el formato europeo.
 */
export function separadorDecimal(celdas: string[], columnas: "," | ";" | "\t"): "," | "." {
  if (columnas === ",") return ".";
  let conComa = 0;
  let conPunto = 0;
  for (const celda of celdas) {
    const limpia = celda.trim();
    if (DECIMAL_CON_COMA.test(limpia)) conComa += 1;
    else if (DECIMAL_CON_PUNTO.test(limpia)) conPunto += 1;
  }
  if (conComa !== conPunto) return conComa > conPunto ? "," : ".";
  return columnas === ";" ? "," : ".";
}

/**
 * Una celda de texto de un CSV: número si lo es en el formato del archivo, el
 * texto tal cual si no. Los miles solo cuentan en grupos de tres ("1.234,5"
 * en europeo, "1,234.5" en inglés) y nunca con parte entera 0.
 */
export function celdaDeCsv(texto: string, decimal: "," | "."): CellValue {
  const limpia = texto.trim();
  if (!limpia) return "";
  const sinPorcentaje = limpia.replace(/%$/, "");
  const forma = decimal === ","
    ? /^[+-]?(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,\d+)?$/
    : /^[+-]?(?:[1-9]\d{0,2}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  if (!forma.test(sinPorcentaje)) return texto;
  const numero = decimal === ","
    ? Number(sinPorcentaje.replaceAll(".", "").replace(",", "."))
    : Number(sinPorcentaje.replaceAll(",", ""));
  return Number.isFinite(numero) ? numero : texto;
}

/**
 * Una fecha de Excel como "AAAA-MM-DD", el mismo día en cualquier huso.
 *
 * SheetJS no es constante: de un .xlsx saca la medianoche local con unos
 * segundos de más o de menos (el huso de 1899, de antes de las horas
 * redondas), y otros caminos dan la medianoche UTC, que en Calgary se lee
 * como las 17:00 del día anterior. Si es medianoche UTC exacta, el día es el
 * de UTC; si no, el día local de esa hora más doce, que absorbe el desfase
 * de segundos y los cambios de horario.
 */
export function fechaIso(fecha: Date): string {
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  if (fecha.getUTCHours() === 0 && fecha.getUTCMinutes() === 0 && fecha.getUTCSeconds() === 0) {
    return fecha.toISOString().slice(0, 10);
  }
  const mediodia = new Date(fecha.getTime() + 12 * 3_600_000);
  return `${mediodia.getFullYear()}-${dosCifras(mediodia.getMonth() + 1)}-${dosCifras(mediodia.getDate())}`;
}

/**
 * Las filas de la primera hoja de un archivo, con los números como números,
 * las fechas como "AAAA-MM-DD" y el texto bien decodificado. Las cabeceras
 * todavía son las del archivo: el nombre canónico lo pone quien llama.
 */
export function leerFilasDeArchivo(buffer: ArrayBuffer, nombre: string): { hoja: string | undefined; filas: Array<Record<string, CellValue>> } {
  const esTexto = /\.(csv|tsv|txt)$/i.test(nombre);
  if (esTexto) {
    const texto = decodificarTexto(new Uint8Array(buffer));
    const columnas = separadorDeColumnas(texto);
    // `raw`: SheetJS deja cada celda como texto y el número lo decide quien
    // sabe qué separador decimal usa el archivo.
    const libro = XLSX.read(texto.replace(/^sep=.\r?\n/i, ""), { type: "string", raw: true, FS: columnas });
    const hoja = libro.SheetNames[0];
    if (!hoja) return { hoja, filas: [] };
    const brutas = XLSX.utils.sheet_to_json<Record<string, string>>(libro.Sheets[hoja], { defval: "", raw: true });
    const decimal = separadorDecimal(brutas.slice(0, 200).flatMap((fila) => Object.values(fila).map(String)), columnas);
    const filas = brutas.map((fila) => Object.fromEntries(
      Object.entries(fila).map(([clave, valor]) => [clave, celdaDeCsv(String(valor ?? ""), decimal)]),
    ));
    return { hoja, filas };
  }
  const libro = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = libro.SheetNames[0];
  if (!hoja) return { hoja, filas: [] };
  const brutas = XLSX.utils.sheet_to_json<Record<string, CellValue>>(libro.Sheets[hoja], { defval: "", raw: true });
  const filas = brutas.map((fila) => Object.fromEntries(
    Object.entries(fila).map(([clave, valor]) => [clave, valor instanceof Date ? fechaIso(valor) : valor]),
  ));
  return { hoja, filas };
}
