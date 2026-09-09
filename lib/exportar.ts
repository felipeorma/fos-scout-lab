import { activeLang, numberLocale } from "./i18n.ts";

/**
 * Sacar una tabla de la plataforma a un CSV que Excel abra bien.
 *
 * Existe porque el ranking y el buscador entre ligas terminaban en la pantalla
 * y ahí se quedaban: para llevar una lista a una reunión había que copiarla a
 * mano, y lo que se ve en pantalla está recortado a cuarenta. Lo que se
 * descarga son TODAS las filas que pasan los filtros, que es la lista que de
 * verdad se pidió.
 *
 * Tres cosas que parecen detalle y no lo son:
 *
 * - El separador y el decimal van juntos y dependen del idioma. Un Excel en
 *   español espera punto y coma entre columnas y coma en los decimales; uno en
 *   inglés, al revés. Mezclarlos parte cada fila por los decimales y el
 *   archivo llega convertido en ruido.
 * - El BOM. Sin él, Excel lee el archivo como Latin-1 y "Sánchez" aparece como
 *   "SÃ¡nchez". Es un archivo de nombres propios: no es cosmético.
 * - Una celda de texto que empieza por = + - @ la ejecuta Excel como fórmula.
 *   No hay nombres así en estos datos, pero el club lo escribe el proveedor y
 *   no nosotros, así que se neutraliza igual.
 */

export type CeldaCsv = string | number | null | undefined;

/** Signos con los que Excel arranca una fórmula. */
const ARRANQUE_DE_FORMULA = /^[=+\-@\t\r]/;

function celda(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    /* Los números van SIN comillas: entrecomillados, Excel los trata como
       texto y luego no se pueden ordenar ni sumar, que es medio motivo de
       bajarse la lista. Los decimales, en el formato del idioma activo, para
       que los lea como números. Sin separador de millares: en español es el
       punto y confunde más de lo que ayuda. */
    return valor.toLocaleString(numberLocale(), { useGrouping: false, maximumFractionDigits: 3 });
  }
  const texto = String(valor);
  const seguro = ARRANQUE_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  /* El texto siempre entrecomillado: cuesta dos bytes por celda y quita de
     encima todas las dudas sobre comas, saltos de línea y comillas dentro. */
  return `"${seguro.replace(/"/g, '""')}"`;
}

/** ¿Con qué se separan las columnas en el idioma activo? */
export function separadorCsv(): string {
  return activeLang() === "es" ? ";" : ",";
}

export function aCsv(columnas: string[], filas: CeldaCsv[][]): string {
  const sep = separadorCsv();
  const lineas = [columnas, ...filas].map((fila) => fila.map(celda).join(sep));
  /* Fin de línea de Windows: es lo que espera Excel, y el resto lo tolera. */
  return `﻿${lineas.join("\r\n")}\r\n`;
}

/**
 * Un nombre de archivo que diga qué hay dentro y quepa en cualquier disco.
 *
 * Lleva la fecha porque estas listas se guardan y se comparan entre sí: sin
 * ella, dos descargas del mismo ranking con distintos filtros se pisan en la
 * carpeta de descargas.
 */
export function nombreDeArchivo(partes: Array<string | number | null | undefined>): string {
  const limpio = partes
    .filter((x) => x !== null && x !== undefined && String(x).trim())
    .map((x) => String(x)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase())
    .filter(Boolean)
    .join("-");
  const fecha = new Date().toISOString().slice(0, 10);
  return `${(limpio || "export").slice(0, 90)}-${fecha}.csv`;
}
