import assert from "node:assert/strict";
import test from "node:test";

import {
  clampReportBlockHeight,
  clampReportBlockSpan,
  reportBlockHeightBounds,
  resizeReportBlock,
  similarityGridRows,
} from "../lib/reportPageLayout.ts";

test("usa límites distintos para texto, imagen y comentarios de similitud", () => {
  assert.deepEqual(reportBlockHeightBounds("text"), { min: 80, max: 900 });
  assert.deepEqual(reportBlockHeightBounds("image"), { min: 140, max: 900 });
  assert.deepEqual(reportBlockHeightBounds("text", true), { min: 90, max: 360 });
});

test("ajusta el alto a una retícula de 10 px y respeta sus límites", () => {
  assert.equal(clampReportBlockHeight(134, "text"), 130);
  assert.equal(clampReportBlockHeight(41, "text"), 80);
  assert.equal(clampReportBlockHeight(980, "image"), 900);
  assert.equal(clampReportBlockHeight(260, "text", true), 260);
  assert.equal(clampReportBlockHeight(421, "text", true), 360);
});

test("limita el ancho del bloque a las columnas disponibles", () => {
  assert.equal(clampReportBlockSpan(-2, 3), 1);
  assert.equal(clampReportBlockSpan(2, 3), 2);
  assert.equal(clampReportBlockSpan(8, 3), 3);
});

test("el tirador vertical cambia solo el alto aunque el puntero se mueva en X", () => {
  assert.deepEqual(resizeReportBlock({
    mode: "height",
    kind: "text",
    startHeight: 180,
    startSpan: 2,
    deltaX: -900,
    deltaY: -63,
    columnStep: 320,
    columns: 3,
  }), {
    height: 120,
    span: 2,
  });
});

test("el tirador de esquina conserva el cambio combinado de ancho y alto", () => {
  assert.deepEqual(resizeReportBlock({
    mode: "both",
    kind: "image",
    startHeight: 280,
    startSpan: 1,
    deltaX: 330,
    deltaY: 76,
    columnStep: 320,
    columns: 3,
  }), {
    height: 360,
    span: 2,
  });
});

test("la nota de similitud nunca crece hasta invadir toda la comparación", () => {
  assert.deepEqual(resizeReportBlock({
    mode: "height",
    kind: "text",
    similarityNotes: true,
    startHeight: 180,
    startSpan: 2,
    deltaX: 0,
    deltaY: 500,
    columnStep: 400,
    columns: 2,
  }), {
    height: 360,
    span: 2,
  });
});

test("la comparación y los comentarios ocupan filas separadas del mismo grid", () => {
  assert.equal(similarityGridRows(180), "minmax(0, 1fr) 180px");
  assert.equal(similarityGridRows(999), "minmax(0, 1fr) 360px");
  assert.equal(similarityGridRows(20), "minmax(0, 1fr) 90px");
});
