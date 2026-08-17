"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Files,
  ImageIcon,
  LockKeyhole,
  Merge,
  Printer,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from "./Icons";
import { PizzaRadar } from "./PizzaRadar";
import { ReportPageDesigner } from "./ReportPageDesigner";
import { SimilarityStudio } from "./SimilarityStudio";
import { DEFAULT_REPORT_THEME, reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  aggregateDatasets,
  buildPlayerReport,
  defaultMetricLabels,
  metricCatalogue,
  detectCoreColumns,
  extractSeason,
  formatCell,
  type DataRow,
  type PlayerReport,
  type SourceDataset,
} from "@/lib/scouting";
import { profileStorageKey, readStoredJson, type TransfermarktProfile } from "@/lib/transfermarkt";
import { formatPlayerPositions, selectedCohortPosition } from "@/lib/positions";
import { removePlayerImageBackground } from "@/lib/playerImageBackground";
import { fetchAiSummary, type AiMetricFact, type AiPlayerFacts, fetchSkillcornerCompetitions, fetchSkillcornerDataset, fetchSourcesStatus, fetchStatsbombCompetitions, fetchStatsbombDataset, fetchTransfermarktProfile, type ApiCompetition, type SourcesStatus } from "@/lib/remoteData";
import { reportExportBaseName } from "@/lib/reportExportName";
import { canonicalizeRow } from "@/lib/wyscoutHeaders";
import { METRIC_SOURCE_COLORS, SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { numberLocale, setActiveLang, t, tDefault, tf, type Lang } from "@/lib/i18n";

// Página 1 = ficha del jugador · Página 2 = comparación de similitud ·
// Página 3 en adelante = páginas libres de visualizaciones que el usuario agrega.
type ReportPage = number;
const CARD_PAGE = 1;
const SIMILARITY_PAGE = 2;
const FIRST_VISUAL_PAGE = 3;
type ReportFileMode = "single" | "combine" | "replace";
type ProfileAssetField = "playerImage" | "clubLogo" | "leagueLogo";

const TRANSFERMARKT_LOGO = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true"
  ? "/fos-scout-lab/tm_logo.svg"
  : "/tm_logo.svg";

const PROFILE_ASSETS: Array<{ field: ProfileAssetField; label: string; linkLabel: string }> = [
  { field: "playerImage", label: "Foto del jugador", linkLabel: "Jugador" },
  { field: "clubLogo", label: "Escudo del club", linkLabel: "Escudo" },
  { field: "leagueLogo", label: "Logo de la liga", linkLabel: "Liga" },
];

function readWorkbook(file: File): Promise<SourceDataset> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(tf("El archivo {name} no contiene hojas.", { name: file.name }));
    // Wyscout exporta la misma plantilla en varios idiomas: las cabeceras se
    // llevan al nombre inglés canónico para que un archivo en español y otro
    // en inglés se lean igual y puedan combinarse entre sí.
    const rawRows = XLSX.utils.sheet_to_json<DataRow>(workbook.Sheets[sheetName], { defval: "", raw: true });
    const rows = rawRows.map((row) => canonicalizeRow(row) as DataRow);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (!rows.length || !headers.length) throw new Error(tf("El archivo {name} está vacío.", { name: file.name }));
    return { fileName: file.name, season: extractSeason(file.name), headers, rows };
  });
}

function numberFormat(value: number) {
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

function cohortLabel(cohort: string) {
  const label = COHORT_LABELS[cohort];
  return label ? t(label) : cohort;
}

const alphabeticCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

type PlayerOption = {
  index: number;
  player: string;
  team: string;
};

function playerOptionsFor(rows: DataRow[]): PlayerOption[] {
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

function firstPlayerSelection(rows: DataRow[]) {
  return playerOptionsFor(rows)[0] ?? { index: 0, team: "" };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

// Texto del informe editable con clic directo sobre la vista previa.
// No controlado a propósito: el estado se confirma al salir del campo (blur)
// para que el cursor no salte mientras se escribe.
function InlineText({ value, fallback, onCommit, multiline = false, editKey }: { value: string; fallback: string; onCommit: (next: string) => void; multiline?: boolean; editKey: string }) {
  return <span
    key={editKey}
    className="inline-editable"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-multiline={multiline}
    spellCheck={false}
    title={t("Haz clic para editar")}
    onKeyDown={(event) => {
      if (!multiline && event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.currentTarget.textContent = value || fallback; event.currentTarget.blur(); }
    }}
    onBlur={(event) => {
      const next = (event.currentTarget.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
      onCommit(next === fallback.trim() ? "" : next);
    }}
  >{value || fallback}</span>;
}

function profileFromReport(report: PlayerReport | null): TransfermarktProfile {
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

function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Los recursos se cargan desde Transfermarkt o desde archivos locales elegidos por el usuario.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(t("No se pudo convertir la imagen procesada.")));
    reader.readAsDataURL(blob);
  });
}

export default function ScoutStudio() {
  const [lang, setLang] = useState<Lang>("es");
  const [langLoaded, setLangLoaded] = useState(false);
  const [reportPage, setReportPage] = useState<ReportPage>(CARD_PAGE);
  const [visualPages, setVisualPages] = useState<ReportPage[]>([FIRST_VISUAL_PAGE]);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printPages, setPrintPages] = useState<ReportPage[]>([CARD_PAGE, SIMILARITY_PAGE, FIRST_VISUAL_PAGE]);
  const [printRun, setPrintRun] = useState<ReportPage[] | null>(null);
  const [sourceDatasets, setSourceDatasets] = useState<SourceDataset[]>([]);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<SourcesStatus | null | "offline">(null);
  const [apiCompetitions, setApiCompetitions] = useState<{ statsbomb: ApiCompetition[]; skillcorner: ApiCompetition[] }>({ statsbomb: [], skillcorner: [] });
  const [apiSelection, setApiSelection] = useState<{ statsbomb: string; skillcorner: string }>({ statsbomb: "", skillcorner: "" });
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  // Oferta automática de enlace con SkillCorner tras cargar una base
  // Wyscout o StatsBomb: elegir competición física, cargando, o resumen.
  const [scLink, setScLink] = useState<null | { stage: "offer" | "loading" | "done"; candidates: ApiCompetition[]; selection: string; linked?: number; total?: number; filled?: number; columns?: number; error?: string }>(null);
  const [radarColorMode, setRadarColorMode] = useState<"groups" | "platform">("groups");
  const [aiLoading, setAiLoading] = useState("");
  const [aiControlsHidden, setAiControlsHidden] = useState(true);
  // Métricas elegidas a mano, por perfil. Sin entrada para un perfil, manda su set por defecto.
  const [metricPicks, setMetricPicks] = useState<Record<string, string[]>>({});
  const [aiError, setAiError] = useState("");
  const [printLayoutError, setPrintLayoutError] = useState("");
  const [readingOverride, setReadingOverride] = useState("");
  const [reportRows, setReportRows] = useState<DataRow[]>([]);
  const [reportFileName, setReportFileName] = useState("Sin datos cargados");
  const [reportSourceCount, setReportSourceCount] = useState(0);
  const [combinedBaseName, setCombinedBaseName] = useState("Combinación temporal 01");
  const [analysisLabel, setAnalysisLabel] = useState("BASE ANALIZADA");
  const [analysisSourceTitle, setAnalysisSourceTitle] = useState("");
  const [reportRecipientName, setReportRecipientName] = useState("");
  const [reportRecipientLogoUrl, setReportRecipientLogoUrl] = useState("");
  const [reportTheme, setReportTheme] = useState<ReportTheme>(DEFAULT_REPORT_THEME);
  const [reportThemeLoaded, setReportThemeLoaded] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [minimumMinutes, setMinimumMinutes] = useState(500);
  const [cohort, setCohort] = useState("AUTO");
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [profile, setProfile] = useState<TransfermarktProfile>(() => profileFromReport(null));
  const [transfermarktUrl, setTransfermarktUrl] = useState("");
  const [transfermarktLoading, setTransfermarktLoading] = useState(false);
  const [transfermarktError, setTransfermarktError] = useState("");
  const [backgroundRemoving, setBackgroundRemoving] = useState(false);
  const [backgroundRemovalStatus, setBackgroundRemovalStatus] = useState("");
  const [assetSourceStatus, setAssetSourceStatus] = useState("");
  const singleReportInputRef = useRef<HTMLInputElement>(null);
  const combinedReportInputRef = useRef<HTMLInputElement>(null);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const printFileNameRef = useRef("");

  // El idioma activo alimenta t()/tf() en todo el árbol; debe fijarse antes
  // de calcular cualquier texto del render.
  setActiveLang(lang);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const players = useMemo(() => playerOptionsFor(reportRows), [reportRows, lang]);
  const teams = useMemo(() => [...new Set(players.map((player) => player.team))].sort(alphabeticCollator.compare), [players]);
  const teamPlayers = useMemo(
    () => players.filter((player) => player.team === selectedTeam).sort((a, b) => alphabeticCollator.compare(a.player, b.player)),
    [players, selectedTeam],
  );
  const report = useMemo(
    () => {
      // El perfil solo se conoce tras construir el informe, y la selección se
      // guarda por perfil: se resuelve primero el perfil y se rehace únicamente
      // si ese perfil tiene métricas elegidas a mano.
      const base = buildPlayerReport(reportRows, selectedPlayer, minimumMinutes, cohort);
      const picks = base ? metricPicks[base.cohort] : undefined;
      if (!base || !picks) return base;
      return buildPlayerReport(reportRows, selectedPlayer, minimumMinutes, cohort, picks) ?? base;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportRows, selectedPlayer, minimumMinutes, cohort, lang, metricPicks],
  );
  // Bloques de métricas del desglose: solo las categorías con datos. El número
  // de columnas se ajusta al total para no dejar una categoría suelta al final
  // (5 bloques → 3 arriba y 2 centradas abajo, 6 → 3 y 3).
  const metricBreakdown = useMemo(() => {
    if (!report) return [];
    return SIMILARITY_METRIC_GROUPS
      .map((group) => ({ group, metrics: report.metrics.filter((metric) => similarityMetricGroup(metric, report.cohort).id === group.id) }))
      .filter((entry) => entry.metrics.length > 0);
  }, [report]);
  const metricBreakdownColumns = metricBreakdown.length <= 4 ? Math.max(1, metricBreakdown.length) : 3;
  const dataReady = reportRows.length > 0;
  const profileReady = Boolean(profile.sourceUrl || profile.playerImage || profile.clubLogo || profile.leagueLogo);
  const recipientName = reportRecipientName.trim() || t("Club destinatario");
  const recipientLogoReady = /^https?:\/\/\S+$/i.test(reportRecipientLogoUrl.trim());
  const reportExportName = reportExportBaseName({
    recipient: recipientName,
    player: report?.player ?? "",
    position: formatPlayerPositions(profile.position || report?.position || ""),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fos-scout-report-theme-v1");
        if (stored) setReportTheme({ ...DEFAULT_REPORT_THEME, ...JSON.parse(stored) });
      } catch { /* El estilo predeterminado sigue disponible si no hay persistencia local. */ }
      setReportThemeLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const storedLang = window.localStorage.getItem("fos-lang");
      if (storedLang === "en" || storedLang === "es") setLang(storedLang);
      const storedRecipient = window.localStorage.getItem("fos-scout-report-recipient-v1");
      if (storedRecipient) {
        const parsed = JSON.parse(storedRecipient) as { name?: unknown; logoUrl?: unknown };
        if (typeof parsed.name === "string") setReportRecipientName(parsed.name);
        if (typeof parsed.logoUrl === "string") setReportRecipientLogoUrl(parsed.logoUrl);
      }
    } catch { /* Sin persistencia el estudio sigue funcionando. */ }
    setLangLoaded(true);
  }, []);

  useEffect(() => {
    if (!langLoaded) return;
    try { window.localStorage.setItem("fos-lang", lang); } catch { /* Preferencia solo para esta sesión. */ }
    document.documentElement.lang = lang;
  }, [lang, langLoaded]);

  useEffect(() => {
    if (!langLoaded) return;
    try {
      window.localStorage.setItem("fos-scout-report-recipient-v1", JSON.stringify({ name: reportRecipientName, logoUrl: reportRecipientLogoUrl }));
    } catch { /* Sin persistencia el estudio sigue funcionando. */ }
  }, [langLoaded, reportRecipientName, reportRecipientLogoUrl]);

  useEffect(() => {
    if (!printRun) return;
    let cancelled = false;
    document.body.classList.add("print-layout-check");
    // En una pestaña en segundo plano requestAnimationFrame no dispara nunca y
    // la exportación se quedaría esperando para siempre: se corre contra un
    // temporizador para que el flujo siempre avance.
    const siguienteCuadro = () => new Promise<void>((resolve) => {
      let hecho = false;
      const listo = () => { if (!hecho) { hecho = true; resolve(); } };
      window.requestAnimationFrame(() => window.requestAnimationFrame(listo));
      window.setTimeout(listo, 400);
    });
    // Espera fuentes, imágenes y dos ciclos de layout antes de abrir la impresión.
    // Así Chrome no captura una página todavía reordenándose.
    const timer = window.setTimeout(() => {
      void (async () => {
        await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((resolve) => window.setTimeout(resolve, 3_000))]);
        const images = Array.from(document.querySelectorAll<HTMLImageElement>(".legal-page-shell img, .scout-report img, .visual-report-page img"));
        await Promise.all(images.map(async (image) => {
          if (!image.complete) {
            await Promise.race([
              new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
              new Promise<void>((resolve) => window.setTimeout(resolve, 3_000)),
            ]);
          }
          try { await image.decode(); } catch { /* El navegador puede imprimir el fallback ya renderizado. */ }
        }));
        await siguienteCuadro();
        if (cancelled) return;
        // Ajuste automático a la hoja Legal. En vez de rechazar la exportación
        // por unos milímetros de más, cada página se reduce con una escala
        // uniforme: las proporciones y la maquetación se conservan intactas y,
        // al ser un escalado único, nada puede quedar solapado. Se itera porque
        // ensanchar la caja antes de escalarla vuelve a repartir el texto.
        const FIT_SELECTOR = ".scout-report, .visual-report-page, .similarity-native-block, .similarity-native-content, .similarity-report-main, .similarity-metric-section, .visual-text-content";
        const MIN_FIT = 0.55;
        const shells = Array.from(document.querySelectorAll<HTMLElement>(".legal-page-shell"));

        const overflowRatio = (shell: HTMLElement) => {
          let worst = 1;
          for (const element of Array.from(shell.querySelectorAll<HTMLElement>(FIT_SELECTOR))) {
            if (element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 2) {
              worst = Math.min(worst, element.clientHeight / element.scrollHeight);
            }
            if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 2) {
              worst = Math.min(worst, element.clientWidth / element.scrollWidth);
            }
          }
          // La comparación de similitud recorta por posición, no por scroll: la
          // última métrica puede caer fuera del marco sin que scrollHeight crezca.
          for (const section of Array.from(shell.querySelectorAll<HTMLElement>(".similarity-metric-section"))) {
            const duels = section.querySelectorAll<HTMLElement>(".metric-duel");
            const last = duels.item(duels.length - 1);
            const boundary = section.closest<HTMLElement>(".similarity-native-content");
            if (!last || !boundary) continue;
            const lastRect = last.getBoundingClientRect();
            const frame = boundary.getBoundingClientRect();
            const usado = lastRect.bottom - frame.top;
            if (usado > frame.height + 2 && usado > 0) worst = Math.min(worst, frame.height / usado);
          }
          return worst;
        };

        const escalas = new Map<HTMLElement, number>();
        for (let pasada = 0; pasada < 4; pasada += 1) {
          let ajustada = false;
          for (const shell of shells) {
            const ratio = overflowRatio(shell);
            if (ratio >= 1) continue;
            // Un poco de holgura evita quedarse a un pelo del borde.
            const escala = Math.max(MIN_FIT, (escalas.get(shell) ?? 1) * ratio * 0.995);
            if (Math.abs(escala - (escalas.get(shell) ?? 1)) < 0.002) continue;
            escalas.set(shell, escala);
            shell.style.setProperty("--print-fit", String(escala));
            shell.dataset.printFit = "1";
            ajustada = true;
          }
          if (!ajustada) break;
          await siguienteCuadro();
          if (cancelled) return;
        }

        const irreducible = shells.some((shell) => (escalas.get(shell) ?? 1) <= MIN_FIT && overflowRatio(shell) < 1);
        if (irreducible) {
          for (const shell of shells) { shell.style.removeProperty("--print-fit"); delete shell.dataset.printFit; }
          document.body.classList.remove("print-layout-check");
          setPrintLayoutError(t("Una página tiene demasiado contenido para la hoja Legal, incluso reduciéndola. Quita algún bloque o acorta el texto."));
          setPrintRun(null);
          setPrintDialogOpen(true);
          return;
        }
        const limpiarEscala = () => {
          for (const shell of shells) { shell.style.removeProperty("--print-fit"); delete shell.dataset.printFit; }
        };
        window.addEventListener("afterprint", limpiarEscala, { once: true });
        const previousTitle = document.title;
        const exportTitle = printFileNameRef.current;
        const restoreTitle = () => {
          window.removeEventListener("afterprint", restoreTitle);
          if (document.title === exportTitle) document.title = previousTitle;
        };
        if (exportTitle) {
          document.title = exportTitle;
          window.addEventListener("afterprint", restoreTitle, { once: true });
        }
        try {
          window.print();
        } finally {
          // `afterprint` restaura el título al cerrar el diálogo. El respaldo
          // conserva el nombre el tiempo suficiente en navegadores no bloqueantes.
          window.setTimeout(restoreTitle, 60_000);
        }
        document.body.classList.remove("print-layout-check");
        setPrintRun(null);
      })();
    }, 100);
    return () => {
      cancelled = true;
      document.body.classList.remove("print-layout-check");
      window.clearTimeout(timer);
    };
  }, [printRun]);

  useEffect(() => {
    // Cada jugador recuerda su lectura rápida editada a mano (si existe).
    // La clave incluye el club para no cruzar homónimos ("S. Dewaele").
    if (!report?.player) { setReadingOverride(""); return; }
    try {
      const key = `fos-scout-reading:${report.player.toLocaleLowerCase("es")}|${report.team.toLocaleLowerCase("es")}`;
      const legacy = `fos-scout-reading:${report.player.toLocaleLowerCase("es")}`;
      setReadingOverride(window.localStorage.getItem(key) ?? window.localStorage.getItem(legacy) ?? "");
    } catch { setReadingOverride(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.player, report?.team]);

  function updateReadingOverride(value: string) {
    setReadingOverride(value);
    if (!report?.player) return;
    try {
      const key = `fos-scout-reading:${report.player.toLocaleLowerCase("es")}|${report.team.toLocaleLowerCase("es")}`;
      if (value.trim()) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch { /* Sin persistencia la edición vive durante la sesión. */ }
  }

  function addVisualPage() {
    const next = (visualPages.at(-1) ?? SIMILARITY_PAGE) + 1;
    setVisualPages((pages) => [...pages, next]);
    setPrintPages((pages) => [...pages, next].sort((a, b) => a - b));
    setReportPage(next);
  }

  function removeVisualPage(page: ReportPage) {
    if (page < FIRST_VISUAL_PAGE) return;
    const remaining = visualPages.filter((item) => item !== page);
    if (!remaining.length) return;
    setVisualPages(remaining);
    setPrintPages((pages) => pages.filter((item) => item !== page));
    setReportPage(remaining.at(-1) ?? SIMILARITY_PAGE);
    // Purga el diseño guardado de esa página: si se agrega una página nueva
    // con el mismo número, arranca con la plantilla y no con contenido viejo.
    try {
      const stored = window.localStorage.getItem("fos-scout-page-designer-v1");
      if (stored) {
        const saved = JSON.parse(stored) as Record<string, unknown>;
        delete saved[String(page)];
        window.localStorage.setItem("fos-scout-page-designer-v1", JSON.stringify(saved));
      }
    } catch { /* Sin persistencia no hay nada que purgar. */ }
  }

  function startPrint() {
    if (!printPages.length) return;
    printFileNameRef.current = reportExportBaseName({
      recipient: recipientName,
      player: report?.player ?? "",
      position: formatPlayerPositions(profile.position || report?.position || ""),
    });
    setPrintLayoutError("");
    setPrintDialogOpen(false);
    setPrintRun([...printPages].sort((a, b) => a - b));
  }

  function togglePrintPage(page: ReportPage) {
    setPrintPages((current) => current.includes(page) ? current.filter((item) => item !== page) : [...current, page]);
  }

  useEffect(() => {
    try { setAiControlsHidden(window.localStorage.getItem("fos-scout-ai-controls-v2") !== "shown"); } catch { /* preferencia opcional */ }
    try {
      const stored = window.localStorage.getItem("fos-scout-metric-picks-v1");
      if (stored) setMetricPicks(JSON.parse(stored) as Record<string, string[]>);
    } catch { /* preferencia opcional */ }
  }, []);

  useEffect(() => {
    if (!reportThemeLoaded) return;
    try { window.localStorage.setItem("fos-scout-report-theme-v1", JSON.stringify(reportTheme)); } catch { /* El diseño continúa activo durante la sesión. */ }
  }, [reportTheme, reportThemeLoaded]);

  function restoreProfile(nextReport: PlayerReport | null) {
    const base = profileFromReport(nextReport);
    if (!nextReport?.player) return { profile: base, url: "" };
    const stored = readStoredJson<Partial<TransfermarktProfile>>(
      profileStorageKey(nextReport.player, nextReport.team),
      profileStorageKey(nextReport.player),
    ) ?? {};
    return { profile: { ...base, ...stored }, url: String(stored.sourceUrl ?? "") };
  }

  useEffect(() => {
    if (!report?.player || !profileReady) return;
    try {
      window.localStorage.setItem(profileStorageKey(report.player, report.team), JSON.stringify(profile));
    } catch { /* Los recursos grandes pueden superar la cuota local; la sesión sigue funcionando. */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileReady, report?.player, report?.team]);

  function applyDatasets(datasets: SourceDataset[]) {
    const result = aggregateDatasets(datasets);
    // Toda base sin datos físicos dispara la oferta de enlace con SkillCorner;
    // corre en segundo plano y no bloquea la carga del reporte.
    if (datasets.every((dataset) => dataset.provider !== "skillcorner")) void offerSkillcornerLink(datasets);
    else setScLink(null);
    const sourceTitle = datasets.map((dataset) => dataset.fileName.replace(/\.(xlsx|xls|csv)$/i, "")).join(" + ");
    const displayName = datasets.length > 1 ? combinedBaseName.trim() || "Combinación temporal" : sourceTitle;
    setSourceDatasets(datasets);
    setReportRows(result.rows);
    setReportFileName(displayName);
    setReportSourceCount(datasets.length);
    setAnalysisLabel(datasets.length > 1 ? "BASES ANALIZADAS" : "BASE ANALIZADA");
    setAnalysisSourceTitle(displayName);
    if (datasets.length > 1) setCombinedBaseName(displayName);
    const initialSelection = firstPlayerSelection(result.rows);
    setSelectedTeam(initialSelection.team);
    setSelectedPlayer(initialSelection.index);
    const restored = restoreProfile(buildPlayerReport(result.rows, initialSelection.index, minimumMinutes, cohort));
    setProfile(restored.profile);
    setTransfermarktUrl(restored.url);
    setBackgroundRemovalStatus("");
    setAssetSourceStatus("");
  }

  async function openApiDialog() {
    setApiDialogOpen(true);
    setApiError("");
    setApiStatus(null);
    const status = await fetchSourcesStatus();
    if (!status) { setApiStatus("offline"); return; }
    setApiStatus(status);
    try {
      const [statsbomb, skillcorner] = await Promise.all([
        status.statsbomb ? fetchStatsbombCompetitions() : Promise.resolve([]),
        status.skillcorner ? fetchSkillcornerCompetitions() : Promise.resolve([]),
      ]);
      setApiCompetitions({ statsbomb, skillcorner });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadApiDataset(platform: "statsbomb" | "skillcorner", mode: "replace" | "append") {
    // Regla de la base: el informe siempre se funda en Wyscout o StatsBomb;
    // SkillCorner solo se enlaza encima como capa física/game intelligence.
    if (platform === "skillcorner" && mode === "replace") return;
    const selection = apiSelection[platform];
    if (!selection) return;
    setApiLoading(true);
    setApiError("");
    try {
      const competition = apiCompetitions[platform][Number(selection)];
      const dataset = platform === "statsbomb"
        ? await fetchStatsbombDataset(competition)
        : await fetchSkillcornerDataset(competition);
      applyDatasets(mode === "append" ? [...sourceDatasets, dataset] : [dataset]);
      setApiDialogOpen(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setApiLoading(false);
    }
  }

  // Hechos que se le entregan a Claude: los mismos números que se dibujan en
  // el radar, para que el texto no pueda inventar nada.
  const availableMetrics = useMemo(() => (reportRows.length ? metricCatalogue(reportRows, report?.cohort ?? "OTHER") : []), [reportRows, report?.cohort]);

  function saveMetricPicks(next: Record<string, string[]>) {
    setMetricPicks(next);
    try { window.localStorage.setItem("fos-scout-metric-picks-v1", JSON.stringify(next)); } catch { /* preferencia opcional */ }
  }

  function toggleMetric(label: string) {
    if (!report) return;
    const perfil = report.cohort;
    const porDefecto = report.metrics.map((metric) => metric.label);
    // Actualización funcional: varios clics seguidos se componen sobre el
    // estado real. Con el valor del render se pisaban entre sí y la misma
    // métrica podía acabar repetida en la lista.
    setMetricPicks((current) => {
      const base = [...new Set(current[perfil] ?? porDefecto)];
      const next = base.includes(label) ? base.filter((item) => item !== label) : [...base, label];
      // Sin métricas no hay radar: la última no se puede quitar.
      if (!next.length) return current;
      const updated = { ...current, [perfil]: next };
      try { window.localStorage.setItem("fos-scout-metric-picks-v1", JSON.stringify(updated)); } catch { /* preferencia opcional */ }
      return updated;
    });
  }

  function restoreCohortMetrics() {
    if (!report) return;
    const next = { ...metricPicks };
    delete next[report.cohort];
    saveMetricPicks(next);
  }

  function aiPlayerFacts(source: PlayerReport): AiPlayerFacts {
    const row = reportRows[selectedPlayer] ?? {};
    return {
      name: source.player,
      team: source.team,
      position: source.position,
      cohortLabel: t(cohortLabel(source.cohort)),
      age: String(row.Age ?? ""),
      minutes: String(row["Minutes played"] ?? ""),
      matches: String(row["Matches played"] ?? ""),
      cohortSize: source.cohortSize,
      sources: String(row["Data sources"] ?? reportFileName),
    };
  }

  function aiMetricFacts(source: PlayerReport): AiMetricFact[] {
    return source.metrics.map((metric) => ({ label: t(metric.label), value: metric.value, percentile: metric.percentile, inverse: metric.inverse }));
  }

  async function writeQuickRead() {
    if (!report) return;
    setAiLoading("quick");
    setAiError("");
    try {
      const text = await fetchAiSummary({ kind: "quick", lang, player: aiPlayerFacts(report), metrics: aiMetricFacts(report) });
      updateReadingOverride(text);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
    } finally {
      setAiLoading("");
    }
  }

  async function offerSkillcornerLink(datasets: SourceDataset[]) {
    try {
      const status = await fetchSourcesStatus();
      if (!status?.skillcorner) return;
      const candidates = await fetchSkillcornerCompetitions();
      if (!candidates.length) return;
      // La mejor candidata comparte temporada y nombre con la base. El nombre
      // se compara completo, por palabras y por acrónimo ("CPL 2026.xlsx"
      // debe apuntar a Canadian Premier League); el año exacto pesa más que
      // una temporada que solo lo contiene (2026 vs 2025/2026).
      const baseYears = new Set(datasets.flatMap((dataset) => String(dataset.season ?? "").match(/\d{4}/g) ?? []));
      const baseNames = datasets.map((dataset) => dataset.fileName.toLowerCase());
      let best = 0;
      let bestScore = 0;
      candidates.forEach((competition, index) => {
        let score = 0;
        const seasonText = String(competition.season ?? "").trim();
        const years = seasonText.match(/\d{4}/g) ?? [];
        if (years.some((year) => baseYears.has(year))) score += /^\d{4}$/.test(seasonText) ? 3 : 1;
        const competitionName = (competition.name ?? "").toLowerCase();
        if (competitionName) {
          const words = competitionName.split(/\s+/).filter((word) => word.length >= 4);
          const acronym = competitionName.split(/\s+/).map((word) => word[0] ?? "").join("");
          if (baseNames.some((name) => name.includes(competitionName))) score += 3;
          if (acronym.length >= 3 && baseNames.some((name) => name.includes(acronym))) score += 3;
          score += words.filter((word) => baseNames.some((name) => name.includes(word))).length * 2;
        }
        if (score > bestScore) { bestScore = score; best = index; }
      });
      // Sin señal (el archivo no dice liga ni año) no se adivina: preseleccionar
      // la primera de la lista enlazaba una competición ajena y devolvía cero
      // cruces sin ninguna pista de dónde venía el fallo.
      setScLink({ stage: "offer", candidates, selection: bestScore > 0 ? String(best) : "" });
    } catch { /* Sin puente local no se ofrece el enlace. */ }
  }

  async function confirmSkillcornerLink() {
    if (!scLink || scLink.stage === "loading") return;
    const competition = scLink.candidates[Number(scLink.selection)];
    if (!competition) return;
    const baseCount = reportRows.length;
    setScLink({ ...scLink, stage: "loading", error: "" });
    try {
      const dataset = await fetchSkillcornerDataset(competition);
      const combined = [...sourceDatasets, dataset];
      const scName = dataset.fileName.replace(/\.(xlsx|xls|csv)$/i, "");
      // Un jugador queda "enlazado" cuando sus fuentes incluyen SkillCorner y
      // al menos otra plataforma o archivo.
      const linked = aggregateDatasets(combined).rows.filter((row) => {
        const sources = String(row["Data sources"] ?? "");
        return sources.includes(scName) && sources.replace(scName, "").replace(/[,\s]/g, "").length > 0;
      }).length;
      // Una competición puede venir solo con el paquete físico: las columnas de
      // game intelligence llegan vacías. Sin avisar, el jugador queda enlazado
      // pero su radar no muestra ni una métrica de SkillCorner.
      const scColumns = dataset.headers.filter((header) => header.includes("(SC)"));
      const filled = scColumns.filter((header) => dataset.rows.some((row) => row[header] !== "" && row[header] !== null && row[header] !== undefined)).length;
      applyDatasets(combined);
      setScLink({ stage: "done", candidates: scLink.candidates, selection: scLink.selection, linked, total: baseCount, filled, columns: scColumns.length });
    } catch (error) {
      setScLink({ ...scLink, stage: "offer", error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function onReportFiles(files?: FileList | File[], mode: ReportFileMode = "replace") {
    if (!files) return;
    const list = [...files].filter((file) => /\.(xlsx|xls|csv)$/i.test(file.name));
    if (!list.length) return;
    setReportLoading(true);
    setReportError("");
    try {
      if (mode === "single" && list.length !== 1) throw new Error(t("Para usar una base, selecciona solamente un archivo Excel."));
      if (mode === "combine" && list.length < 2) throw new Error(t("Para combinar bases, selecciona dos o más archivos Excel."));
      const datasets = await Promise.all(list.map(readWorkbook));
      applyDatasets(datasets);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : t("No se pudieron leer los archivos."));
    } finally {
      setReportLoading(false);
    }
  }

  async function extractTransfermarktProfile() {
    if (!transfermarktUrl.trim()) {
      setTransfermarktError(t("Pega primero la URL del perfil del jugador."));
      return;
    }
    setTransfermarktLoading(true);
    setTransfermarktError("");
    try {
      const result = await fetchTransfermarktProfile(transfermarktUrl.trim());
      setProfile((current) => {
        const populated = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== "" && value !== undefined));
        return { ...current, ...populated, sourceUrl: transfermarktUrl.trim() };
      });
      setBackgroundRemovalStatus("");
      if (result.playerImage || result.clubLogo || result.leagueLogo) setAssetSourceStatus(t("✓ Imágenes actualizadas desde Transfermarkt."));
    } catch (error) {
      setTransfermarktError(error instanceof Error ? error.message : t("No se pudo leer el perfil."));
    } finally {
      setTransfermarktLoading(false);
    }
  }

  function updateProfile(field: keyof TransfermarktProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function selectPlayer(index: number) {
    const option = players.find((player) => player.index === index);
    if (option) setSelectedTeam(option.team);
    setSelectedPlayer(index);
    const restored = restoreProfile(buildPlayerReport(reportRows, index, minimumMinutes, cohort));
    setProfile(restored.profile);
    setTransfermarktUrl(restored.url);
    setTransfermarktError("");
    setBackgroundRemovalStatus("");
    setAssetSourceStatus("");
  }

  function selectTeam(team: string) {
    setSelectedTeam(team);
    const firstPlayer = players.find((player) => player.team === team);
    if (firstPlayer) selectPlayer(firstPlayer.index);
  }

  function updateAnalysisSourceName(value: string) {
    setAnalysisSourceTitle(value);
    if (reportSourceCount > 1) {
      setCombinedBaseName(value);
      setReportFileName(value.trim() || "Combinación temporal");
    }
  }

  function loadProfileAsset(field: ProfileAssetField, file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile(field, String(reader.result ?? ""));
      const label = PROFILE_ASSETS.find((asset) => asset.field === field)?.label ?? "Imagen";
      setAssetSourceStatus(tf("✓ {label} cargada desde el ordenador.", { label: t(label) }));
      if (field === "playerImage") setBackgroundRemovalStatus(t("Imagen cargada. Puedes quitar el fondo con IA."));
    };
    reader.readAsDataURL(file);
  }

  function applyProfileAssetUrl(field: ProfileAssetField, value: string) {
    const url = value.trim();
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
      updateProfile(field, parsed.href);
      const label = PROFILE_ASSETS.find((asset) => asset.field === field)?.label ?? "Imagen";
      setAssetSourceStatus(tf("✓ Link aplicado a {label}.", { label: t(label).toLowerCase() }));
      if (field === "playerImage") setBackgroundRemovalStatus(t("Imagen enlazada. Puedes quitar el fondo con IA."));
    } catch {
      setAssetSourceStatus(t("Ingresa un link de imagen válido que comience con http:// o https://."));
    }
  }

  async function removePlayerBackground() {
    const source = profile.playerImage.trim();
    if (!source) {
      setBackgroundRemovalStatus(t("Primero carga o extrae una foto del jugador."));
      return;
    }
    setBackgroundRemoving(true);
    setBackgroundRemovalStatus(t("Preparando el modelo de IA… La primera vez puede tardar."));
    try {
      const result = await removePlayerImageBackground({
        playerImage: source,
        onProgress: (key, current, total) => {
          const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
          setBackgroundRemovalStatus(percent ? tf("Descargando modelo IA · {p}%", { p: percent }) : tf("Preparando {k}…", { k: t(key) }));
        },
      });
      const dataUrl = await blobToDataUrl(result);
      updateProfile("playerImage", dataUrl);
      setBackgroundRemovalStatus(t("✓ Fondo eliminado. La imagen PNG quedó guardada en esta sesión."));
    } catch {
      setBackgroundRemovalStatus(t("No se pudo eliminar el fondo. Reintenta o utiliza otra imagen."));
    } finally {
      setBackgroundRemoving(false);
    }
  }

  function resetReport() {
    setReportRows([]);
    setReportFileName("Sin datos cargados");
    setReportSourceCount(0);
    setCombinedBaseName("Combinación temporal 01");
    setAnalysisLabel("BASE ANALIZADA");
    setAnalysisSourceTitle("");
    // El club destinatario y su logo se recuerdan entre sesiones y reinicios:
    // son independientes de la base y del jugador cargados.
    setSelectedTeam("");
    setSelectedPlayer(0);
    setMinimumMinutes(500);
    setCohort("AUTO");
    setReportError("");
    setProfile(profileFromReport(null));
    setTransfermarktUrl("");
    setTransfermarktError("");
    setBackgroundRemovalStatus("");
    setAssetSourceStatus("");
  }


  return (
    <div className="app-shell no-sidebar">
      <main className="main-area">
        <header className="topbar studio-topbar">
          <div className="studio-brand">
            <span className="studio-brand-mark">F</span>
            <span className="studio-brand-copy"><b>Felipe Ormazabal Scouting</b><small>{t("Reportes de scouting")}</small></span>
          </div>

          <ol className="studio-flow" aria-label={t("Flujo del reporte")}>
            <li className={dataReady ? "done" : "current"}><span>{dataReady ? <Check size={13} /> : "1"}</span><div><b>{t("Cargar datos")}</b><small>{dataReady ? tDefault(reportFileName) : t("Excel o CSV")}</small></div></li>
            <li className={report ? "done" : dataReady ? "current" : ""}><span>{report ? <Check size={13} /> : "2"}</span><div><b>{t("Elegir jugador")}</b><small>{report ? report.player : t("Equipo y jugador")}</small></div></li>
            <li className={reportPage !== CARD_PAGE ? "done" : report ? "current" : ""}><span>3</span><div><b>{t("Construir reporte")}</b><small>{t("Ficha, similitud y visuales")}</small></div></li>
          </ol>

          <div className="top-actions">
            <div className="lang-switch-inline" role="group" aria-label={t("Idioma del estudio y del reporte")}>
              <button className={lang === "es" ? "active" : ""} onClick={() => setLang("es")} aria-pressed={lang === "es"}>ES</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>EN</button>
            </div>
            <span className="privacy-pill" title={t("Los datos nunca salen del navegador")}><LockKeyhole size={14} /> {t("Solo tú")}</span>
            {dataReady && <button className="button secondary compact" onClick={resetReport}><RotateCcw size={15} /> {t("Restablecer")}</button>}
            <button className="button primary compact" onClick={() => { setPrintLayoutError(""); setPrintDialogOpen(true); }} disabled={!report || !dataReady}><Printer size={15} /> {t("Imprimir / PDF")}</button>
          </div>
        </header>

        <div className="page-content reports-page">
            <input ref={singleReportInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "single"); event.target.value = ""; }} />
            <input ref={combinedReportInputRef} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "combine"); event.target.value = ""; }} />
            <input ref={reportInputRef} type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "replace"); event.target.value = ""; }} />

            {apiDialogOpen && <div className="print-dialog-overlay" role="dialog" aria-modal="true" aria-label={t("Conectar plataformas de datos")} onClick={() => setApiDialogOpen(false)}>
                <div className="print-dialog api-dialog" onClick={(event) => event.stopPropagation()}>
                  <h3>{t("Conectar plataformas de datos")}</h3>
                  {apiStatus === null && <p>{t("Comprobando el servidor local…")}</p>}
                  {apiStatus === "offline" && <p className="inline-error">{t("El servidor local no está corriendo. Arranca npm run bg:server y reintenta.")}</p>}
                  {apiStatus && apiStatus !== "offline" && (["statsbomb", "skillcorner"] as const).map((platform) => <div key={platform} className="api-platform-row" style={{ "--platform-color": METRIC_SOURCE_COLORS[platform].color } as React.CSSProperties}>
                    <div className="api-platform-head"><i /><b>{METRIC_SOURCE_COLORS[platform].label}</b><small>{apiStatus[platform] ? `${apiCompetitions[platform].length} ${t("competiciones disponibles")}` : t("Sin credenciales")}</small></div>
                    {apiStatus[platform] ? <>
                      <select value={apiSelection[platform]} onChange={(event) => setApiSelection((current) => ({ ...current, [platform]: event.target.value }))}>
                        <option value="">{t("Elegir competición")}…</option>
                        {apiCompetitions[platform].map((competition, index) => <option key={index} value={index}>{competition.name} · {competition.season}</option>)}
                      </select>
                      <div className="api-platform-actions">
                        {platform === "statsbomb" && <button className="button primary" disabled={apiLoading || !apiSelection[platform]} onClick={() => void loadApiDataset(platform, "replace")}>{apiLoading ? t("Cargando datos de la plataforma…") : t("Usar como base")}</button>}
                        {dataReady && <button className={platform === "statsbomb" ? "button secondary" : "button primary"} disabled={apiLoading || !apiSelection[platform]} onClick={() => void loadApiDataset(platform, "append")}>{apiLoading ? t("Cargando datos de la plataforma…") : t("Añadir a la base actual")}</button>}
                        {platform === "skillcorner" && !dataReady && <p className="api-credentials-hint">{t("SkillCorner no se usa como base: carga primero Wyscout o StatsBomb y la capa física se enlaza encima.")}</p>}
                      </div>
                    </> : <p className="api-credentials-hint">{t("Sin credenciales: agrega las llaves en ~/.fos-scouting/credentials.json (o variables de entorno) y reinicia el servidor local.")}</p>}
                  </div>)}
                  {apiError && <p className="inline-error">{apiError}</p>}
                  <div className="print-dialog-actions"><button className="button secondary" onClick={() => setApiDialogOpen(false)}>{t("Cancelar")}</button></div>
                </div>
              </div>}

            {scLink && <div className="print-dialog-overlay" role="dialog" aria-modal="true" aria-label={t("¿Enlazar datos físicos de SkillCorner?")} onClick={() => { if (scLink.stage !== "loading") setScLink(null); }}>
                <div className="print-dialog api-dialog sc-link-dialog" onClick={(event) => event.stopPropagation()}>
                  {scLink.stage === "done" ? <>
                    <h3>{scLink.linked ? t("Datos físicos enlazados") : t("No coincidió ningún jugador")}</h3>
                    <p>{scLink.linked
                      ? tf("{n} de {m} jugadores de la base quedaron enlazados con SkillCorner.", { n: scLink.linked ?? 0, m: scLink.total ?? 0 })
                      : t("Revisa que la competición elegida sea la misma temporada y liga de la base: se cruzan por nombre, club y edad.")}</p>
                    {Boolean(scLink.linked) && (scLink.filled ?? 0) < (scLink.columns ?? 0) && <p className="api-credentials-hint">{tf("Esta competición trae {n} de {m} métricas de SkillCorner: el resto no está en tu suscripción para esta liga, así que no aparecerán en el radar.", { n: scLink.filled ?? 0, m: scLink.columns ?? 0 })}</p>}
                    <div className="print-dialog-actions"><button className="button primary" onClick={() => setScLink(null)}>{t("Entendido")}</button></div>
                  </> : <>
                    <h3>{t("¿Enlazar datos físicos de SkillCorner?")}</h3>
                    <p>{t("Cruzamos los jugadores por nombre, club y edad; los que coincidan suman sus métricas físicas al radar como porciones verdes.")}</p>
                    <div className="api-platform-row" style={{ "--platform-color": METRIC_SOURCE_COLORS.skillcorner.color } as React.CSSProperties}>
                      <div className="api-platform-head"><i /><b>{METRIC_SOURCE_COLORS.skillcorner.label}</b><small>{`${scLink.candidates.length} ${t("competiciones disponibles")}`}</small></div>
                      <select value={scLink.selection} onChange={(event) => setScLink({ ...scLink, selection: event.target.value })} disabled={scLink.stage === "loading"}>
                        <option value="">{t("Elegir competición")}…</option>
                        {scLink.candidates.map((competition, index) => <option key={index} value={index}>{competition.name} · {competition.season}</option>)}
                      </select>
                      {!scLink.selection && <p className="api-credentials-hint">{t("Elige la competición que corresponde a esta base: el archivo no dice de cuál es.")}</p>}
                    </div>
                    {scLink.error && <p className="inline-error">{scLink.error}</p>}
                    <div className="print-dialog-actions">
                      <button className="button secondary" disabled={scLink.stage === "loading"} onClick={() => setScLink(null)}>{t("Ahora no")}</button>
                      <button className="button primary" disabled={scLink.stage === "loading"} onClick={() => void confirmSkillcornerLink()}>{scLink.stage === "loading" ? t("Enlazando datos físicos…") : t("Enlazar")}</button>
                    </div>
                  </>}
                </div>
              </div>}

            {!dataReady ? (
              <section className="dataset-onboarding database-gate">
                <span className="dataset-step">{t("PASO 01 · FUENTE DEL INFORME")}</span>
                <span className="dataset-icon"><FileSpreadsheet size={30} /></span>
                <h2>{t("¿Qué base de datos utilizará el informe?")}</h2>
                <p>{t("Elige una base individual o combina automáticamente dos o más archivos antes de seleccionar al jugador.")}</p>
                <label className="temporary-source-name">
                  <span><b>{t("Nombre temporal de la combinación")}</b><small>{t("Se usará para identificar todos los archivos dentro del reporte.")}</small></span>
                  <input value={combinedBaseName} maxLength={80} onChange={(event) => setCombinedBaseName(event.target.value)} placeholder={t("Ej. MLS Next Pro · 2025–2026")} aria-label={t("Nombre temporal de la combinación")} />
                </label>
                <div className="database-choice-grid">
                  <button className="database-choice" onClick={() => singleReportInputRef.current?.click()} disabled={reportLoading}>
                    <span className="database-choice-tag">{t("1 ARCHIVO")}</span><span className="database-choice-icon"><FileSpreadsheet size={25} /></span><b>{t("Usar una base")}</b><small>{t("Una liga o una temporada en un archivo Excel.")}</small><em>{reportLoading ? t("Leyendo datos…") : t("Seleccionar Excel")}<Upload size={14} /></em>
                  </button>
                  <button className="database-choice featured" onClick={() => combinedReportInputRef.current?.click()} disabled={reportLoading}>
                    <span className="database-choice-tag">{t("2+ ARCHIVOS")}</span><span className="database-choice-icon"><Merge size={25} /></span><b>{t("Combinar bases")}</b><small>{t("Une todas las ligas o temporadas seleccionadas y usa el resultado directamente.")}</small><em>{reportLoading ? t("Combinando datos…") : t("Elegir archivos")}<Files size={14} /></em>
                  </button>
                  <button className="database-choice" onClick={() => void openApiDialog()} disabled={reportLoading}>
                    <span className="database-choice-tag">API</span><span className="database-choice-icon"><Sparkles size={25} /></span><b>{t("Conectar API")}</b><small>{t("StatsBomb y SkillCorner con tus credenciales, vía el servidor local.")}</small><em>{t("Elegir competición")}<Search size={14} /></em>
                  </button>
                </div>
                <small>{t(".XLSX, .XLS o .CSV · primera hoja · clave: nombre + edad + club · procesamiento local")}</small>
                {reportError && <div className="inline-error">{reportError}</div>}
              </section>
            ) : <>
              <nav className="report-page-tabs" aria-label={t("Páginas del reporte")}>
                <button className={reportPage === CARD_PAGE ? "active" : ""} onClick={() => setReportPage(CARD_PAGE)}><span>01</span><div><b>{t("Ficha y radar")}</b><small>{t("Percentiles del jugador")}</small></div></button>
                <button className={reportPage === SIMILARITY_PAGE ? "active" : ""} onClick={() => setReportPage(SIMILARITY_PAGE)}><span>02</span><div><b>{t("Similitud")}</b><small>{t("Jugadores comparables")}</small></div></button>
                {visualPages.map((page, index) => (
                  <button key={page} className={reportPage === page ? "active" : ""} onClick={() => setReportPage(page)}>
                    <span>{String(page).padStart(2, "0")}</span>
                    <div><b>{tf("Visuales {n}", { n: index + 1 })}</b><small>{t("Mapas, imágenes y texto")}</small></div>
                  </button>
                ))}
                <div className="page-tab-actions">
                  <button type="button" className="page-tab-add" onClick={addVisualPage}>+ {t("Agregar página")}</button>
                  {visualPages.length > 1 && reportPage >= FIRST_VISUAL_PAGE && (
                    <button type="button" className="page-tab-remove" onClick={() => removeVisualPage(reportPage)}>{t("Quitar página")}</button>
                  )}
                </div>
              </nav>

              {(printRun ? printRun.includes(1) : reportPage === 1) ? <div className="report-workspace">
                <section className="control-panel enrichment-controls">
                  <div className="panel-title"><div><span className="mini-icon"><FileSpreadsheet size={17} /></span><div><h2>{t("1. Base de datos activa")}</h2><p>{tDefault(reportFileName)}</p></div></div><span className="tiny-state">{t("LISTO")}</span></div>
                  <button className="upload-box compact" onClick={() => reportInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReportFiles(event.dataTransfer.files); }}>
                    <span className="upload-icon"><Upload size={18} /></span><span><b>{reportLoading ? t("Leyendo bases…") : t("Reemplazar archivos")}</b><small>{tf("{n} base{s} · {m} jugadores", { n: reportSourceCount, s: reportSourceCount === 1 ? "" : "s", m: reportRows.length })}</small></span>
                  </button>
                  <button className="api-connect-button" onClick={() => void openApiDialog()}><Sparkles size={14} /> {t("Conectar API")} · StatsBomb / SkillCorner</button>
                  {reportError && <div className="inline-error">{reportError}</div>}
                  <div className="control-divider" />
                  <div className="panel-title player-section-title"><div><span className="mini-icon"><Search size={17} /></span><div><h2>{t("2. Equipo y jugador")}</h2><p>{t("Selecciona en orden")}</p></div></div><span className="tiny-state">{t("PASO 02")}</span></div>
                  <div className="player-selector-flow">
                    <label className="field-group selection-step"><span className="selection-step-title"><i>A</i><FieldLabel>{t("Equipo")}</FieldLabel></span><span className="select-wrap"><Files size={16} /><select value={selectedTeam} disabled={backgroundRemoving} onChange={(event) => selectTeam(event.target.value)}>{teams.map((team) => <option key={team || "__sin_equipo__"} value={team}>{team || t("Equipo no disponible")}</option>)}</select><ChevronDown size={16} /></span></label>
                    <span className="selection-flow-line" aria-hidden="true" />
                    <label className="field-group selection-step"><span className="selection-step-title"><i>B</i><FieldLabel>{t("Jugador")}</FieldLabel></span><span className="select-wrap"><Search size={16} /><select value={selectedPlayer} disabled={backgroundRemoving || !teamPlayers.length} onChange={(event) => selectPlayer(Number(event.target.value))}>{teamPlayers.map((player) => <option key={`${player.player}-${player.index}`} value={player.index}>{player.player}</option>)}</select><ChevronDown size={16} /></span></label>
                  </div>
                  <div className="two-fields">
                    <label className="field-group"><FieldLabel>{t("Cohorte")}</FieldLabel><span className="select-wrap simple"><select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="AUTO">{t("Automática")}</option><option value="GK">{t("Porteros")}</option><option value="CB">{t("Centrales")}</option><option value="FB">{t("Laterales")}</option><option value="DMF">{t("Pivotes / mediocentros")}</option><option value="B2B">{t("Interiores (box-to-box)")}</option><option value="WING">{t("Extremos")}</option><option value="DWING">{t("Extremos directos")}</option><option value="AM">{t("Mediapuntas")}</option><option value="CF">{t("Delanteros")}</option></select><ChevronDown size={16} /></span></label>
                    <label className="field-group"><FieldLabel>{t("Mín. minutos")}</FieldLabel><input className="text-input" type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))} /></label>
                  </div>
                  <div className="data-summary"><div><span>{t("Bases")}</span><b>{reportSourceCount}</b></div><div><span>{t("Jugadores")}</span><b>{numberFormat(reportRows.length)}</b></div><div><span>{t("Cohorte")}</span><b>{report?.cohortSize ?? 0}</b></div></div>
                  {report && report.cohortSize < 5 && <div className="inline-error">{report.cohortSize === 0 ? t("No hay jugadores de esta posición con el mínimo de minutos: baja el mínimo o carga más datos.") : (report.cohortSize === 1 ? t("Cohorte de 1 jugador: percentiles poco fiables. Baja el mínimo de minutos o carga más datos.") : tf("Cohorte de {n} jugadores: percentiles poco fiables. Baja el mínimo de minutos o carga más datos.", { n: report.cohortSize }))}</div>}
                  {report && report.metrics.some((metric) => metric.source && metric.source !== "wyscout") && <div className="radar-color-toggle"><span className="field-label">{t("Color del radar")}</span><div className="segmented"><button className={radarColorMode === "groups" ? "active" : ""} onClick={() => setRadarColorMode("groups")}>{t("Por grupo")}</button><button className={radarColorMode === "platform" ? "active" : ""} onClick={() => setRadarColorMode("platform")}>{t("Por plataforma")}</button></div></div>}
                  <div className="radar-color-toggle"><span className="field-label">{t("Textos con IA")}</span><div className="segmented"><button className={!aiControlsHidden ? "active" : ""} onClick={() => { setAiControlsHidden(false); try { window.localStorage.setItem("fos-scout-ai-controls-v2", "shown"); } catch { /* opcional */ } }}>{t("Mostrar")}</button><button className={aiControlsHidden ? "active" : ""} onClick={() => { setAiControlsHidden(true); setAiError(""); try { window.localStorage.setItem("fos-scout-ai-controls-v2", "hidden"); } catch { /* opcional */ } }}>{t("Ocultar")}</button></div></div>
                  {report && availableMetrics.length > 0 && <details className="profile-details metric-picker">
                    <summary>{t("Métricas del radar")} <b>{report.metrics.length}</b></summary>
                    <p className="metric-picker-hint">{t("Marca las que quieres ver. El percentil siempre se calcula contra los jugadores de su posición en la base cargada.")}</p>
                    {SIMILARITY_METRIC_GROUPS.map((group) => {
                      const delGrupo = availableMetrics.filter((definition) => similarityMetricGroup(definition, report.cohort).id === group.id);
                      if (!delGrupo.length) return null;
                      const activas = new Set(report.metrics.map((metric) => metric.label));
                      return <div key={group.id} className="metric-picker-group">
                        <span style={{ "--group-color": group.color } as React.CSSProperties}><i />{t(group.label)}</span>
                        {delGrupo.map((definition) => <label key={definition.label}>
                          <input type="checkbox" checked={activas.has(definition.label)} onChange={() => toggleMetric(definition.label)} />
                          <span>{t(definition.label)}</span>
                        </label>)}
                      </div>;
                    })}
                    {metricPicks[report.cohort] && <button type="button" className="button secondary compact" onClick={restoreCohortMetrics}>{t("Volver al set del perfil")}</button>}
                  </details>}
                  <p className="inline-edit-hint">{t("Los textos del informe (etiqueta de la base, lectura rápida, club destinatario) se editan con un clic directamente sobre la vista previa.")}</p>
                  <details className="profile-details report-recipient-editor">
                    <summary>{t("Reporte generado para")}</summary>
                    <label><small>{t("Nombre del club destinatario")}</small><input value={reportRecipientName} maxLength={80} placeholder={t("Ej. Club Deportivo…")} onChange={(event) => setReportRecipientName(event.target.value)} /></label>
                    <label><small>{t("Link del logo destinatario")}</small><input type="url" inputMode="url" value={reportRecipientLogoUrl} placeholder="https://sitio.com/logo.png" aria-invalid={Boolean(reportRecipientLogoUrl) && !recipientLogoReady} onChange={(event) => setReportRecipientLogoUrl(event.target.value)} /></label>
                    <p className={reportRecipientLogoUrl && !recipientLogoReady ? "recipient-link-status invalid" : "recipient-link-status"}>{recipientLogoReady ? t("✓ Logo destinatario aplicado al pie del reporte.") : t("Pega un link directo http:// o https://. No se utilizará el escudo del jugador.")}</p>
                  </details>

                  <div className="control-divider" />
                  <div className="panel-title enrichment-title"><div><span className="mini-icon transfermarkt-panel-logo"><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="transfermarkt-logo-image" /></span><div><h2>{t("3. Transfermarkt e imágenes")}</h2><p>{t("Datos biográficos, logos y retrato")}</p></div></div><span className={profileReady ? "tiny-state ready-state" : "tiny-state"}>{profileReady ? t("CARGADO") : t("PENDIENTE")}</span></div>
                  <label className="field-group transfermarkt-url"><FieldLabel>{t("URL del perfil")}</FieldLabel><input className="text-input" type="url" placeholder="https://www.transfermarkt.com/.../profil/spieler/..." value={transfermarktUrl} onChange={(event) => setTransfermarktUrl(event.target.value)} /></label>
                  <button className="button primary extract-button" onClick={extractTransfermarktProfile} disabled={transfermarktLoading}><Sparkles size={15} /> {transfermarktLoading ? t("Extrayendo perfil…") : t("Extraer datos, logos y foto")}</button>
                  {transfermarktError && <div className="inline-error">{transfermarktError}</div>}
                  <div className="asset-grid">
                    {PROFILE_ASSETS.map(({ field, linkLabel }) => {
                      const src = profile[field];
                      return <div className={`asset-upload ${src ? "has-asset" : ""}`} key={field}>
                        {src ? <ReportImage src={src} alt={t(linkLabel)} className="asset-preview" /> : <ImageIcon size={21} />}
                        <span>{t(linkLabel)}</span><small>{src ? t("Vista previa") : t("Sin imagen")}</small>
                      </div>;
                    })}
                  </div>
                  <div className="asset-source-editor">
                    <div className="asset-source-heading"><b>{t("Reemplazar imágenes")}</b><small>{t("Pega un link directo o carga un archivo desde tu ordenador.")}</small></div>
                    {PROFILE_ASSETS.map(({ field, label, linkLabel }) => {
                      const src = profile[field];
                      const remoteSource = /^https?:\/\//i.test(src) ? src : "";
                      return <form className="asset-source-row" key={field} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); applyProfileAssetUrl(field, String(data.get("assetUrl") ?? "")); }}>
                        <span className="asset-source-name">{t(linkLabel)}</span>
                        <div className="asset-source-actions">
                          <input key={`${report?.player ?? "jugador"}-${field}-${remoteSource || "local"}`} name="assetUrl" type="url" inputMode="url" defaultValue={remoteSource} placeholder="https://imagen..." aria-label={tf("Link para {label}", { label: t(label).toLowerCase() })} required />
                          <button type="submit">{t("Usar link")}</button>
                          <label><Upload size={13} /><span>{t("Ordenador")}</span><input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(event) => { loadProfileAsset(field, event.target.files?.[0]); event.target.value = ""; }} /></label>
                        </div>
                      </form>;
                    })}
                  </div>
                  {assetSourceStatus && <div className={`background-status asset-source-status ${assetSourceStatus.startsWith("✓") ? "success" : ""}`} aria-live="polite">{assetSourceStatus}</div>}
                  <button className="remove-bg-button" onClick={removePlayerBackground} disabled={backgroundRemoving || !profile.playerImage}><Sparkles size={15} /> {backgroundRemoving ? t("Quitando fondo…") : t("Quitar fondo solo a la foto")}</button>
                  {backgroundRemovalStatus && <div className={`background-status ${backgroundRemovalStatus.startsWith("✓") ? "success" : ""}`} aria-live="polite">{backgroundRemovalStatus}</div>}
                  <p className="asset-help"><b>{t("Solo se procesa la foto del jugador.")}</b> {t("Los escudos de clubes, logos de ligas y logo del destinatario conservan siempre su fondo original.")}</p>

                  <details className="profile-details">
                    <summary>{t("Revisar y editar ficha")}</summary>
                    <div className="profile-field-grid">
                      {([['number', 'Dorsal'], ['league', 'Liga'], ['club', 'Club'], ['marketValue', 'Valor mercado'], ['birthDate', 'Nacimiento'], ['birthPlace', 'Lugar'], ['height', 'Altura'], ['position', 'Posiciones'], ['foot', 'Pie'], ['contract', 'Contrato'], ['agent', 'Agente'], ['nationalTeam', 'Selección'], ['capsGoals', 'Caps / goles']] as Array<[keyof TransfermarktProfile, string]>).map(([field, label]) => <label key={field}><span>{t(label)}</span><input value={profile[field]} onChange={(event) => updateProfile(field, event.target.value)} /></label>)}
                    </div>
                  </details>

                </section>

                <section className="report-preview-wrap">
                  <div className="preview-toolbar"><div><span className="live-dot" /> {t("Página 01 · Ficha de scouting")}</div><span>{t("Haz clic en los textos del informe para editarlos")}</span></div>
                  {report ? <div className="legal-page-shell"><article className="scout-report jordhy-report" style={reportThemeStyle(reportTheme)}>
                    <header className="dossier-header">
                      <div className="dossier-portrait">
                        <span className="portrait-glow" />
                        {profile.clubLogo ? <ReportImage src={profile.clubLogo} alt={profile.club || report.team} className="dossier-club-logo" /> : <span className="dossier-club-fallback">{report.team.slice(0, 2).toUpperCase()}</span>}
                        <b className="shirt-number">#{profile.number || "—"}</b>
                        {profile.playerImage ? <ReportImage src={profile.playerImage} alt={report.player} className="dossier-player-image" /> : <div className="dossier-player-fallback">{report.player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>}
                      </div>
                      <div className="dossier-info">
                        <div className="dossier-topline">
                          <div className="competition-lockup">
                            {profile.leagueLogo && <ReportImage src={profile.leagueLogo} alt={profile.league || t("Liga")} className="dossier-league-logo" />}
                            <div className="competition-copy"><span>{profile.league || t("Competición")}</span><strong>{profile.club || report.team}</strong></div>
                          </div>
                          <div className="market-lockup"><small>{t("VALOR DE MERCADO")}</small><strong>{profile.marketValue || "—"}</strong><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="market-transfermarkt-logo" /></div>
                        </div>
                        <h2>{report.player}</h2>
                        <div className="identity-line"><b>{selectedCohortPosition(cohort, formatPlayerPositions(profile.position || report.position))}</b><span>{profile.citizenship || report.passport}</span></div>
                        <div className="dossier-meta-grid">
                          <div><span>{t("Nacimiento")}</span><b>{profile.birthDate || "—"}{profile.age || report.age !== "—" ? ` · ${tf("{age}a", { age: profile.age || report.age })}` : ""}</b></div>
                          <div><span>{t("Lugar")}</span><b>{profile.birthPlace || "—"}</b></div>
                          <div><span>{t("Altura")}</span><b>{profile.height || "—"}</b></div>
                          <div><span>{t("Pie")}</span><b>{profile.foot || report.foot}</b></div>
                          <div><span>{t("Contrato")}</span><b>{profile.contract || report.contract}</b></div>
                          <div><span>{t("Agente")}</span><b>{profile.agent || "—"}</b></div>
                          <div><span>{t("Selección")}</span><b>{profile.nationalTeam || "—"}</b></div>
                          <div><span>{t("Caps / goles")}</span><b>{profile.capsGoals || "—"}</b></div>
                        </div>
                      </div>
                    </header>

                    <section className="dossier-season-strip">
                      <div className="season-source"><span><InlineText editKey={`label-${report.player}`} value={tDefault(analysisLabel)} fallback={reportSourceCount > 1 ? t("BASES ANALIZADAS") : t("BASE ANALIZADA")} onCommit={setAnalysisLabel} /></span><b><InlineText editKey={`source-${report.player}`} value={tDefault(analysisSourceTitle)} fallback={tDefault(reportFileName)} onCommit={updateAnalysisSourceName} /></b><small>{tf("Cohorte {c} · mín. {m}′", { c: cohortLabel(report.cohort), m: minimumMinutes })}</small></div>
                      <div className="dossier-stat"><strong>{numberFormat(report.matches)}</strong><span>{t("Partidos")}</span></div>
                      <div className="dossier-stat"><strong>{numberFormat(report.minutes)}</strong><span>{t("Minutos")}</span></div>
                      <div className="dossier-stat goals"><strong>{numberFormat(report.goals)}</strong><span>{t("Goles")}</span></div>
                      <div className="dossier-stat assists"><strong>{numberFormat(report.assists)}</strong><span>{t("Asist.")}</span></div>
                      <div className="score-ring" style={{ "--score": `${report.score * 3.6}deg` } as React.CSSProperties}><b>{report.score}</b><span>{t("Índice")}</span></div>
                    </section>

                    <section className="dossier-radar-row">
                      <div className="dossier-radar">{report.metrics.length ? <PizzaRadar metrics={report.metrics} score={report.score} cohort={report.cohort} lang={lang} colorMode={radarColorMode} /> : <div className="empty-radar"><BarChart3 size={34} /><b>{t("No encontramos métricas para esta cohorte")}</b></div>}</div>
                      <aside className="dossier-reading">
                        <div className="average-percentile"><strong>{report.score}</strong><small>{t("percentil")}<br />{t("medio")}</small></div>
                        <div className="dossier-legend">{radarColorMode === "platform"
                          ? [...new Set(report.metrics.map((metric) => metric.source ?? "wyscout"))].map((source) => <span key={source}><i style={{ background: METRIC_SOURCE_COLORS[source]?.color }} />{METRIC_SOURCE_COLORS[source]?.label ?? source}</span>)
                          : SIMILARITY_METRIC_GROUPS.filter((group) => report.metrics.some((metric) => similarityMetricGroup(metric, report.cohort).id === group.id)).map((group) => <span key={group.id}><i style={{ background: group.color }} />{t(group.label)}</span>)}</div>
                        <div className="quick-reading"><b>{t("LECTURA RÁPIDA")}{!aiControlsHidden && <button type="button" className="reading-ai" disabled={aiLoading === "quick"} onClick={() => void writeQuickRead()}><Sparkles size={11} /> {aiLoading === "quick" ? t("Escribiendo…") : t("Escribir con IA")}</button>}{readingOverride.trim() !== "" && <button type="button" className="reading-restore" onClick={() => updateReadingOverride("")}>{t("Usar texto automático")}</button>}</b>{aiError && !aiControlsHidden && <small className="inline-error ai-error"><span>{aiError}</span><button type="button" onClick={() => setAiError("")} aria-label={t("Ocultar aviso")}>×</button></small>}<p><InlineText editKey={`reading-${report.player}`} value={readingOverride} fallback={report.reading} onCommit={updateReadingOverride} multiline /></p></div>
                      </aside>
                    </section>

                    <section className="metric-breakdown" style={{ "--metric-columns": metricBreakdownColumns } as React.CSSProperties}>
                      {metricBreakdown.map(({ group, metrics }) => (
                        <div className="metric-group" style={{ "--metric-group-color": group.color } as React.CSSProperties} key={group.id}>
                          <h3>{t(group.label)}</h3>
                          {metrics.slice(0, 4).map((metric) => <div className="metric-row" key={metric.key}><div><span>{t(metric.label)}</span><b>{formatCell(metric.value)} <small>· P{metric.percentile}</small></b></div><i><em style={{ width: `${metric.percentile}%` }} /></i></div>)}
                        </div>
                      ))}
                    </section>
                    <footer className="dossier-footer">
                      <p>{tf("Percentiles por posición · mínimo {m}′ · {n} jugadores en la cohorte · datos por 90 minutos.", { m: minimumMinutes, n: report.cohortSize })}
                        {report.metrics.some((metric) => metric.source === "skillcorner") && ` ${t("Los volúmenes de SkillCorner (SC) van por 30 minutos con balón del equipo.")}`}</p>
                      <div className="report-signatures">
                        <div className="report-author"><span>{t("ELABORADO POR")}</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div>
                        <div className="report-recipient">
                          {recipientLogoReady ? <ReportImage src={reportRecipientLogoUrl.trim()} alt={recipientName} className="dossier-footer-club-logo" /> : <span className="dossier-footer-club-fallback">{recipientName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                          <div><span>{t("REPORTE GENERADO PARA")}</span><b><InlineText editKey="recipient" value={reportRecipientName} fallback={t("Club destinatario")} onCommit={setReportRecipientName} /></b></div>
                        </div>
                      </div>
                    </footer>
                  </article></div> : <div className="empty-preview">{t("Selecciona un jugador para generar el informe.")}</div>}
                </section>
              </div> : null}
              {/* La similitud vive montada siempre: filtros, pesos y candidato
                  sobreviven al cambiar de página del reporte. */}
              <div className={`similarity-page-host ${(printRun ? printRun.includes(SIMILARITY_PAGE) : reportPage === SIMILARITY_PAGE) ? "" : "is-hidden"}`}>
                <SimilarityStudio
                  aiControlsHidden={aiControlsHidden}
                  rows={reportRows}
                  selectedIndex={selectedPlayer}
                  sourceName={reportFileName}
                  lang={lang}
                  reportCohort={cohort}
                  targets={players}
                  theme={reportTheme}
                  targetProfile={profile}
                  recipientName={reportRecipientName}
                  recipientLogoUrl={reportRecipientLogoUrl}
                  onSelectTarget={selectPlayer}
                  onTargetProfileChange={(nextProfile) => { setProfile(nextProfile); setTransfermarktUrl(nextProfile.sourceUrl); }}
                  onRecipientNameChange={setReportRecipientName}
                  onRecipientLogoChange={setReportRecipientLogoUrl}
                  onOpenReports={() => setReportPage(CARD_PAGE)}
                />
              </div>

              {report ? visualPages.filter((page) => printRun ? printRun.includes(page) : reportPage === page).map((page) => (
                <ReportPageDesigner key={page} pageNumber={page} persist={!printRun || reportPage === page} player={report.player} team={profile.club || report.team} position={formatPlayerPositions(profile.position || report.position)} theme={reportTheme} onThemeChange={setReportTheme} recipientName={recipientName} recipientLogoUrl={reportRecipientLogoUrl} aiFacts={aiControlsHidden ? undefined : () => ({ lang, player: aiPlayerFacts(report), metrics: aiMetricFacts(report) })} />
              )) : !printRun && reportPage >= FIRST_VISUAL_PAGE ? <div className="empty-preview">{t("Selecciona un jugador para diseñar las páginas.")}</div> : null}

              {printDialogOpen && <div className="print-dialog-overlay" role="dialog" aria-modal="true" aria-label={t("¿Qué páginas quieres incluir en el PDF?")} onClick={() => setPrintDialogOpen(false)}>
                <div className="print-dialog" onClick={(event) => event.stopPropagation()}>
                  <h3>{t("¿Qué páginas quieres incluir en el PDF?")}</h3>
                  <p>{t("Cada página seleccionada sale en su propia hoja tamaño legal.")}</p>
                  <div className="print-dialog-file-name">
                    <span>{t("Nombre sugerido")}</span>
                    <b>{reportExportName}.pdf</b>
                  </div>
                  {[
                    { page: CARD_PAGE, title: t("Ficha y radar"), hint: t("Percentiles del jugador") },
                    { page: SIMILARITY_PAGE, title: t("Similitud"), hint: t("Jugadores comparables") },
                    ...visualPages.map((page, index) => ({ page, title: tf("Visuales {n}", { n: index + 1 }), hint: t("Mapas, imágenes y texto") })),
                  ].map(({ page, title, hint }) => (
                    <label key={page} className={printPages.includes(page) ? "selected" : ""}>
                      <input type="checkbox" checked={printPages.includes(page)} onChange={() => togglePrintPage(page)} />
                      <span><b>{String(page).padStart(2, "0")} · {title}</b><small>{hint}</small></span>
                    </label>
                  ))}
                  <div className="print-dialog-actions">
                    <button className="button secondary" onClick={() => setPrintDialogOpen(false)}>{t("Cancelar")}</button>
                    <button className="button primary" onClick={startPrint} disabled={!printPages.length}><Printer size={15} /> {t("Generar PDF / Imprimir")}</button>
                  </div>
                  {!printPages.length && <small className="print-dialog-note">{t("Selecciona al menos una página.")}</small>}
                  {printLayoutError && <small className="print-dialog-note">{t(printLayoutError)}</small>}
                </div>
              </div>}
            </>}
          </div>
      </main>
    </div>
  );
}
