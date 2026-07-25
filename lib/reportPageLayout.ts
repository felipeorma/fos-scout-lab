export type ReportBlockKind = "image" | "text";
export type ReportBlockResizeMode = "both" | "height";

export const MIN_REPORT_TEXT_HEIGHT = 80;
export const MIN_REPORT_IMAGE_HEIGHT = 140;
export const MAX_REPORT_BLOCK_HEIGHT = 900;
export const MIN_SIMILARITY_NOTES_HEIGHT = 90;
export const MAX_SIMILARITY_NOTES_HEIGHT = 360;

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
