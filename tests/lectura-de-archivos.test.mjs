import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { celdaDeCsv, decodificarTexto, fechaIso, leerFilasDeArchivo, separadorDeColumnas, separadorDecimal } from "../lib/lecturaDeArchivos.ts";

/**
 * Lo que entra por un archivo tiene que salir igual: números, fechas y
 * acentos. Cada prueba es un formato real que antes cambiaba el dato.
 */

const utf8 = (texto) => new TextEncoder().encode(texto).buffer;
/** Latin-1 a mano: cada carácter por debajo de 256 es su propio byte. */
const latin1 = (texto) => Uint8Array.from([...texto].map((letra) => letra.charCodeAt(0))).buffer;

test("CSV europeo: ';' entre columnas y coma decimal", () => {
  const csv = "Player;Team;xG per 90;Minutes played;Accurate passes, %\nAna Uno;Atlético Ottawa;0,45;1.159;81,3\nBea Dos;Forge;0,123;2.340;77\n";
  const { filas } = leerFilasDeArchivo(utf8(csv), "export.csv");
  assert.equal(filas[0]["xG per 90"], 0.45, "antes salía 45");
  assert.equal(filas[1]["xG per 90"], 0.123, "antes salía 123");
  assert.equal(filas[0]["Minutes played"], 1159);
  assert.equal(filas[1]["Minutes played"], 2340);
  assert.equal(filas[0]["Accurate passes, %"], 81.3);
  assert.equal(filas[0].Team, "Atlético Ottawa");
});

test("CSV en inglés: coma entre columnas y punto decimal, miles entre comillas", () => {
  const csv = "Player,Team,xG per 90,Minutes played,Market value\nAna Uno,Forge,0.123,\"1,159\",\"2,500,000\"\n";
  const { filas } = leerFilasDeArchivo(utf8(csv), "export.csv");
  assert.equal(filas[0]["xG per 90"], 0.123);
  assert.equal(filas[0]["Minutes played"], 1159);
  assert.equal(filas[0]["Market value"], 2500000);
});

test("CSV guardado en Latin-1 por Excel en Windows", () => {
  const csv = "Player;Team;Goals\nJosé Muñoz;Atlético Ottawa;3\n";
  const { filas } = leerFilasDeArchivo(latin1(csv), "export.csv");
  assert.equal(filas[0].Player, "José Muñoz");
  assert.equal(filas[0].Team, "Atlético Ottawa");
  assert.equal(filas[0].Goals, 3);
});

test("UTF-8 con BOM y UTF-16 de Excel se leen igual", () => {
  const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Player,Goals\nÑandú,2\n")]);
  assert.equal(leerFilasDeArchivo(conBom.buffer, "a.csv").filas[0].Player, "Ñandú");
  const texto = "Player\tGoals\nÑandú\t2\n";
  const utf16 = new Uint8Array(2 + texto.length * 2);
  utf16.set([0xff, 0xfe]);
  [...texto].forEach((letra, i) => { utf16[2 + i * 2] = letra.charCodeAt(0); utf16[3 + i * 2] = 0; });
  const { filas } = leerFilasDeArchivo(utf16.buffer, "a.txt");
  assert.deepEqual(filas[0], { Player: "Ñandú", Goals: 2 });
});

test("el texto que parece número no se toca de más", () => {
  const csv = "Player;Position;Birth date;Foot\nAna Uno;RWF, LW;2001-02-03;left\n";
  const { filas } = leerFilasDeArchivo(utf8(csv), "export.csv");
  assert.equal(filas[0].Position, "RWF, LW");
  assert.equal(filas[0]["Birth date"], "2001-02-03");
  assert.equal(celdaDeCsv("1e5", "."), "1e5");
  assert.equal(celdaDeCsv("007", "."), 7);
  assert.equal(celdaDeCsv("", ","), "");
});

test("detección de separadores", () => {
  assert.equal(separadorDeColumnas("a;b;c\n1;2;3"), ";");
  assert.equal(separadorDeColumnas("\"a;x\",b,c\n"), ",");
  assert.equal(separadorDeColumnas("a\tb\tc\n"), "\t");
  assert.equal(separadorDeColumnas("sep=;\na,b;c"), ";");
  assert.equal(separadorDecimal(["0,45", "12,5", "Ana"], ";"), ",");
  assert.equal(separadorDecimal(["0.45", "12.5"], ";"), ".");
  assert.equal(separadorDecimal(["0.45", "12.5"], "\t"), ".");
  assert.equal(separadorDecimal(["3", "Ana"], ";"), ",", "sin decimales a la vista, ';' es europeo");
  assert.equal(decodificarTexto(new Uint8Array([0x41, 0xe9])), "Aé");
});

test("las fechas de Excel salen como AAAA-MM-DD en cualquier huso horario", () => {
  // Excel guarda una fecha como días desde 1899-12-30, con formato de fecha.
  const serial = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
  const hoja = {
    "!ref": "A1:C2",
    A1: { t: "s", v: "Player" }, B1: { t: "s", v: "Birth date" }, C1: { t: "s", v: "Contract expires" },
    A2: { t: "s", v: "Ana Uno" },
    B2: { t: "n", v: serial(2001, 2, 3), z: "yyyy-mm-dd" },
    C2: { t: "n", v: serial(2028, 12, 31), z: "dd/mm/yyyy" },
  };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Hoja");
  const bytes = XLSX.write(libro, { type: "array", bookType: "xlsx" });
  const original = process.env.TZ;
  try {
    for (const zona of ["America/Edmonton", "America/Santiago", "UTC", "Europe/Madrid", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      process.env.TZ = zona;
      const { filas } = leerFilasDeArchivo(bytes, "export.xlsx");
      assert.equal(filas[0]["Birth date"], "2001-02-03", zona);
      assert.equal(filas[0]["Contract expires"], "2028-12-31", zona);
      // Medianoche UTC, que en Calgary se lee como las 17:00 del día anterior.
      assert.equal(fechaIso(new Date(Date.UTC(2028, 11, 31))), "2028-12-31", zona);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});
