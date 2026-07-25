import assert from "node:assert/strict";
import test from "node:test";

import {
  REPORT_AUTHOR,
  localExportDate,
  primaryExportPosition,
  reportExportBaseName,
} from "../lib/reportExportName.ts";

test("usa la fecha local en formato YYYY-MM-DD", () => {
  const localDate = new Date(2026, 6, 24, 23, 59, 59);

  assert.equal(localExportDate(localDate), "2026-07-24");
  assert.equal(
    reportExportBaseName({
      recipient: "Cavalry FC",
      player: "Lucas O'Sullivan",
      position: "Fullback",
      date: localDate,
    }),
    "Cavalry FC Lucas O'Sullivan Fullback 2026-07-24 Felipe Ormazabal",
  );
  assert.equal(REPORT_AUTHOR, "Felipe Ormazabal");
});

test("toma solo la posición principal separada por coma o punto medio", () => {
  assert.equal(primaryExportPosition("Extremo derecho, Mediapunta"), "Extremo derecho");
  assert.equal(primaryExportPosition("Fullback · Winger · Forward"), "Fullback");
  assert.equal(
    reportExportBaseName({
      recipient: "Club Atlético",
      player: "José Pérez",
      position: "Extremo derecho · Delantero",
      date: new Date(2026, 0, 2),
    }),
    "Club Atlético José Pérez Extremo derecho 2026-01-02 Felipe Ormazabal",
  );
});

test("sanitiza caracteres inválidos sin eliminar acentos ni apóstrofes", () => {
  assert.equal(
    reportExportBaseName({
      recipient: 'Club: Ñuñoa / "Canadá"?',
      player: "José O'Connor* <10>.",
      position: "Extremo | derecho, Delantero",
      date: new Date(2026, 6, 24),
    }),
    "Club Ñuñoa Canadá José O'Connor 10 Extremo derecho 2026-07-24 Felipe Ormazabal",
  );
});

test("aplica fallbacks legibles a valores vacíos", () => {
  assert.equal(primaryExportPosition(" , · "), "Posición");
  assert.equal(
    reportExportBaseName({
      recipient: " \t ",
      player: undefined,
      position: " , · ",
      date: new Date(2026, 10, 5),
      author: "",
    }),
    "Club destinatario Jugador Posición 2026-11-05 Felipe Ormazabal",
  );
});
