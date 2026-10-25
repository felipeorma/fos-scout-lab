import { detectCoreColumns, extractSeason, type DataRow, type PlayerReport, type SourceDataset, type TemporadaDeJugador } from "@/lib/scouting";
import { anioDeInicio } from "@/lib/temporadas";
import { leerFilasDeArchivo } from "@/lib/lecturaDeArchivos";
import { canonicalizeRow } from "@/lib/wyscoutHeaders";
import type { TransfermarktProfile } from "@/lib/transfermarkt";
import { numberLocale, t, tf } from "@/lib/i18n";

/*
 * Lectura de archivos y utilidades de la pantalla principal (ScoutStudio),
 * sacadas aparte para que el componente no pase de tres mil líneas.
 */

export function readWorkbook(file: File): Promise<SourceDataset> {
  return file.arrayBuffer().then((buffer) => {
    // Codificación, separador decimal y fechas se resuelven en
    // lib/lecturaDeArchivos, que tiene sus pruebas.
    const { hoja, filas } = leerFilasDeArchivo(buffer, file.name);
    if (!hoja) throw new Error(tf("El archivo {name} no contiene hojas.", { name: file.name }));
    // Wyscout exporta la misma plantilla en varios idiomas: las cabeceras se
    // llevan al nombre inglés canónico para que un archivo en español y otro
    // en inglés se lean igual y puedan combinarse entre sí.
    const rows = filas.map((row) => canonicalizeRow(row) as DataRow);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (!rows.length || !headers.length) throw new Error(tf("El archivo {name} está vacío.", { name: file.name }));
    return { fileName: file.name, season: extractSeason(file.name), headers, rows, cargadoEl: Date.now() };
  });
}

/**
 * El año de una temporada del jugador tal como lo cuentan los filtros: el de
 * inicio. Cada base guarda el último ("2025/2026" → 2026) y el filtro de año
 * el primero (2025); comparar uno con otro dejaba fuera a las ligas de año
 * cruzado.
 */
export function inicioDe(temporada: TemporadaDeJugador) {
  return anioDeInicio(temporada.etiqueta) || temporada.anio;
}

/**
 * La hora, fuera del componente. Solo la llama `startPrint`, desde el clic de
 * Imprimir; el compilador de React no puede demostrarlo en un componente de
 * este tamaño y marcaría el `Date.now()` como si corriera en el render.
 */
export function horaActual() {
  return Date.now();
}

export function numberFormat(value: number) {
  return new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 }).format(value);
}

const COHORT_LABELS: Record<string, string> = {
  GK: "Porteros",
  CB: "Centrales",
  FB: "Laterales",
  MID: "Pivotes / mediocentros",
  DMF: "Pivotes / mediocentros",
  B2B: "Interiores (box-to-box)",
  WING: "Extremos",
  DWING: "Extremos directos",
  AM: "Mediapuntas",
  CF: "Delanteros",
  OTHER: "Otros perfiles",
};

export function cohortLabel(cohort: string) {
  const label = COHORT_LABELS[cohort];
  return label ? t(label) : cohort;
}

export const alphabeticCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

export type PlayerOption = {
  index: number;
  player: string;
  team: string;
};

export function playerOptionsFor(rows: DataRow[]): PlayerOption[] {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const core = detectCoreColumns(headers);
  const teamColumn = headers.find((header) => /team within|equipo durante/i.test(header))
    ?? headers.find((header) => /^(team|equipo)$/i.test(header))
    ?? "";

  return rows.map((row, index) => ({
    index,
    player: String(row[core.player] ?? tf("Jugador {n}", { n: index + 1 })).trim(),
    // Sin fallback traducido aquí: el valor "" es estable entre idiomas y la
    // etiqueta visible se traduce recién en el <option>.
    team: String(row[teamColumn] ?? "").trim(),
  })).sort((a, b) => alphabeticCollator.compare(a.team, b.team) || alphabeticCollator.compare(a.player, b.player));
}

export function firstPlayerSelection(rows: DataRow[]) {
  return playerOptionsFor(rows)[0] ?? { index: 0, team: "" };
}

export function profileFromReport(report: PlayerReport | null): TransfermarktProfile {
  return {
    sourceUrl: "",
    name: report?.player ?? "",
    number: "",
    playerImage: "",
    clubLogo: "",
    leagueLogo: "",
    club: report?.team ?? "",
    league: "",
    marketValue: report?.marketValue === "—" ? "" : report?.marketValue ?? "",
    birthDate: "",
    age: report?.age === "—" ? "" : report?.age ?? "",
    birthPlace: "",
    citizenship: report?.passport === "—" ? "" : report?.passport ?? "",
    height: "",
    position: report?.position === "—" ? "" : report?.position ?? "",
    foot: report?.foot === "—" ? "" : report?.foot ?? "",
    agent: "",
    nationalTeam: "",
    capsGoals: "",
    contract: report?.contract === "—" ? "" : report?.contract ?? "",
    joined: "",
    lastUpdate: "",
  };
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(t("No se pudo convertir la imagen procesada.")));
    reader.readAsDataURL(blob);
  });
}
