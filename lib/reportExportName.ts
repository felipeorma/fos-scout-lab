export const REPORT_AUTHOR = "Felipe Ormazabal";

export type ReportExportNameOptions = {
  recipient?: unknown;
  player?: unknown;
  position?: unknown;
  date?: Date;
  author?: unknown;
};

const INVALID_FILE_NAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

function cleanExportPart(value: unknown, fallback: string) {
  const cleaned = String(value ?? "")
    .normalize("NFC")
    .replace(INVALID_FILE_NAME_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return cleaned || fallback;
}

export function primaryExportPosition(value: unknown) {
  const primary = String(value ?? "")
    .split(/[,·]/, 1)[0]
    ?.trim();

  return primary || "Posición";
}

export function localExportDate(date = new Date()) {
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const year = String(safeDate.getFullYear()).padStart(4, "0");
  const month = String(safeDate.getMonth() + 1).padStart(2, "0");
  const day = String(safeDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function reportExportBaseName({
  recipient,
  player,
  position,
  date = new Date(),
  author = REPORT_AUTHOR,
}: ReportExportNameOptions = {}) {
  const parts = [
    cleanExportPart(recipient, "Club destinatario"),
    cleanExportPart(player, "Jugador"),
    cleanExportPart(primaryExportPosition(position), "Posición"),
    localExportDate(date),
    cleanExportPart(author, REPORT_AUTHOR),
  ];

  return parts.join(" ");
}
