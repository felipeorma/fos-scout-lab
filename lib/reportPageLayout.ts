export type ReportBlockKind = "image" | "text";
export type ReportBlockResizeMode = "both" | "height";

export const MIN_REPORT_TEXT_HEIGHT = 80;
export const MIN_REPORT_IMAGE_HEIGHT = 140;
export const MAX_REPORT_BLOCK_HEIGHT = 900;
export const MIN_SIMILARITY_NOTES_HEIGHT = 90;
export const MAX_SIMILARITY_NOTES_HEIGHT = 360;
export const COMPACT_SIMILARITY_METRIC_THRESHOLD = 13;

// Rejilla editorial base: 12 columnas admiten mitades, tercios y cuartos, así
// que los bloques se pueden estirar casi libremente sin salirse nunca de la
// alineación. Los diseños antiguos (1, 2 o 3 columnas) se convierten a esta
// base multiplicando el ancho de cada bloque.
export const REPORT_GRID_COLUMNS = 12;

/** Anchos ofrecidos en el panel, en doceavos. */
export const REPORT_SPAN_PRESETS = [
  { span: 3, label: "1/4" },
  { span: 4, label: "1/3" },
  { span: 6, label: "1/2" },
  { span: 8, label: "2/3" },
  { span: 9, label: "3/4" },
  { span: 12, label: "Completo" },
];

/** Convierte un diseño guardado con 1-3 columnas a la rejilla de 12. */
export function migrateReportGrid<T extends { columns: number; blocks: Array<{ span: number }> }>(page: T): T {
  const columns = Math.max(1, Math.round(Number.isFinite(page.columns) ? page.columns : 1));
  if (columns === REPORT_GRID_COLUMNS) return page;
  const factor = REPORT_GRID_COLUMNS / columns;
  return {
    ...page,
    columns: REPORT_GRID_COLUMNS,
    blocks: page.blocks.map((block) => ({
      ...block,
      span: clampReportBlockSpan(Math.round((Number.isFinite(block.span) ? block.span : 1) * factor), REPORT_GRID_COLUMNS),
    })),
  };
}

export function similarityMetricDensity(metricCount: number) {
  const safeCount = Number.isFinite(metricCount) ? Math.max(0, Math.floor(metricCount)) : 0;
  return safeCount >= COMPACT_SIMILARITY_METRIC_THRESHOLD ? "compact" : "comfortable";
}

export function reportBlockHeightBounds(kind: ReportBlockKind, similarityNotes = false) {
  if (similarityNotes) {
    return {
      min: MIN_SIMILARITY_NOTES_HEIGHT,
      max: MAX_SIMILARITY_NOTES_HEIGHT,
    };
  }
  return {
    min: kind === "text" ? MIN_REPORT_TEXT_HEIGHT : MIN_REPORT_IMAGE_HEIGHT,
    max: MAX_REPORT_BLOCK_HEIGHT,
  };
}

export function clampReportBlockHeight(value: number, kind: ReportBlockKind, similarityNotes = false) {
  const { min, max } = reportBlockHeightBounds(kind, similarityNotes);
  const safeValue = Number.isFinite(value) ? value : min;
  const snappedValue = Math.round(safeValue / 10) * 10;
  return Math.max(min, Math.min(max, snappedValue));
}

export function clampReportBlockSpan(value: number, columns: number) {
  const safeColumns = Math.max(1, Math.round(Number.isFinite(columns) ? columns : 1));
  const safeValue = Math.round(Number.isFinite(value) ? value : 1);
  return Math.max(1, Math.min(safeColumns, safeValue));
}

export function similarityGridRows(notesHeight: number) {
  const safeNotesHeight = clampReportBlockHeight(notesHeight, "text", true);
  return `minmax(0, 1fr) ${safeNotesHeight}px`;
}

export function resizeReportBlock({
  mode,
  kind,
  similarityNotes = false,
  startHeight,
  startSpan,
  deltaX,
  deltaY,
  columnStep,
  columns,
}: {
  mode: ReportBlockResizeMode;
  kind: ReportBlockKind;
  similarityNotes?: boolean;
  startHeight: number;
  startSpan: number;
  deltaX: number;
  deltaY: number;
  columnStep: number;
  columns: number;
}) {
  const spanDelta = mode === "both" && columnStep > 0 ? Math.round(deltaX / columnStep) : 0;
  return {
    height: clampReportBlockHeight(startHeight + deltaY, kind, similarityNotes),
    span: clampReportBlockSpan(startSpan + spanDelta, columns),
  };
}
