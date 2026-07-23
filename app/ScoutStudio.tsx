"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Files,
  FolderOpen,
  ImageIcon,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Merge,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "./Icons";
import { PizzaRadar } from "./PizzaRadar";
import { ReportPageDesigner } from "./ReportPageDesigner";
import { DEFAULT_REPORT_THEME, reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  aggregateDatasets,
  buildPlayerReport,
  detectCoreColumns,
  extractSeason,
  formatCell,
  type AggregationResult,
  type DataRow,
  type PlayerReport,
  type SourceDataset,
} from "@/lib/scouting";
import type { TransfermarktProfile } from "@/lib/transfermarkt";

type View = "home" | "reports" | "seasons";
type ReportPage = 1 | 2 | 3;

function readWorkbook(file: File): Promise<SourceDataset> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error(`El archivo ${file.name} no contiene hojas.`);
    const rows = XLSX.utils.sheet_to_json<DataRow>(workbook.Sheets[sheetName], { defval: "", raw: true });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    if (!rows.length || !headers.length) throw new Error(`El archivo ${file.name} está vacío.`);
    return { fileName: file.name, season: extractSeason(file.name), headers, rows };
  });
}

function numberFormat(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value);
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
    player: String(row[core.player] ?? `Jugador ${index + 1}`).trim(),
    team: String(row[teamColumn] ?? "").trim() || "Equipo no disponible",
  })).sort((a, b) => alphabeticCollator.compare(a.team, b.team) || alphabeticCollator.compare(a.player, b.player));
}

function firstPlayerSelection(rows: DataRow[]) {
  return playerOptionsFor(rows)[0] ?? { index: 0, team: "" };
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
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
    reader.onerror = () => reject(new Error("No se pudo convertir la imagen procesada."));
    reader.readAsDataURL(blob);
  });
}

function LandingPage({ onReports, onMerge }: { onReports: () => void; onMerge: () => void }) {
  return <div className="landing-page">
    <section className="landing-hero">
      <div className="landing-copy">
        <div className="system-badge"><span /> SYSTEM ONLINE <i>SCOUT.OS / 04</i></div>
        <span className="landing-kicker">SCOUTING INTELLIGENCE PLATFORM</span>
        <h1>LEE EL JUEGO.<br /><em>ANTES QUE LOS DEMÁS.</em></h1>
        <p>Fusiona datos, descubre perfiles y transforma cada señal en un reporte de scouting listo para decidir.</p>
        <div className="landing-actions">
          <button className="neon-button primary-neon" onClick={onReports}><BarChart3 size={17} /> Crear reporte <span>↗</span></button>
          <button className="neon-button secondary-neon" onClick={onMerge}><Merge size={17} /> Combinar datos</button>
        </div>
        <div className="landing-stats">
          <div><strong>01—03</strong><span>BASES SIMULTÁNEAS</span></div>
          <div><strong>100%</strong><span>PROCESAMIENTO LOCAL</span></div>
          <div><strong>03</strong><span>PÁGINAS EDITABLES</span></div>
        </div>
      </div>

      <div className="landing-visual" role="img" aria-label="Radar holográfico tridimensional de análisis de jugadores">
        <span className="visual-tag tag-top">LIVE ANALYSIS</span>
        <span className="visual-tag tag-side">POSITION / WING</span>
        <div className="holo-scene" aria-hidden="true">
          <div className="holo-floor"><i /><i /><i /><i /></div>
          <div className="orbit orbit-one"><i /><i /><i /></div>
          <div className="orbit orbit-two"><i /><i /></div>
          <div className="orbit orbit-three"><i /></div>
          <div className="holo-core"><span /><b>87</b><small>FIT INDEX</small></div>
          <div className="scan-line" />
          <div className="data-node node-a"><i /><span>PROGRESSION<br /><b>92</b></span></div>
          <div className="data-node node-b"><i /><span>1V1 IMPACT<br /><b>84</b></span></div>
          <div className="data-node node-c"><i /><span>CREATION<br /><b>78</b></span></div>
        </div>
        <div className="floating-card card-player"><span>PROFILE_021</span><b>ELITE SIGNAL</b><i>+12.8%</i></div>
        <div className="floating-card card-data"><span>DATA POINTS</span><b>24.8K</b><i>SYNCED</i></div>
      </div>
    </section>

    <div className="signal-marquee" aria-hidden="true"><div><span>DATA FUSION</span><i>◆</i><span>POSITIONAL PERCENTILES</span><i>◆</i><span>TRANSFERMARKT ENRICHMENT</span><i>◆</i><span>VISUAL REPORT BUILDER</span><i>◆</i><span>DATA FUSION</span></div></div>

    <section className="landing-capabilities">
      <div className="capability-heading"><span>CORE MODULES / 03</span><h2>DE LA SEÑAL A LA DECISIÓN.</h2><p>Un flujo conectado, diseñado para trabajar rápido sin sacrificar profundidad.</p></div>
      <div className="capability-grid">
        <button onClick={onMerge} className="capability-card"><span className="capability-index">01</span><span className="capability-icon"><Files size={22} /></span><h3>DATA FUSION</h3><p>Combina ligas o temporadas con ponderaciones inteligentes y úsalo directamente en el informe.</p><b>COMBINAR BASES ↗</b></button>
        <button onClick={onReports} className="capability-card featured"><span className="capability-index">02</span><span className="capability-icon"><Sparkles size={22} /></span><h3>PROFILE INTEL</h3><p>Percentiles posicionales, Transfermarkt, logos y retrato transparente en una sola ficha.</p><b>EXPLORAR PERFILES ↗</b></button>
        <button onClick={onReports} className="capability-card"><span className="capability-index">03</span><span className="capability-icon"><LayoutDashboard size={22} /></span><h3>REPORT BUILDER</h3><p>Construye páginas visuales con imágenes, comentarios, grids y estilos completamente editables.</p><b>CREAR REPORTE ↗</b></button>
      </div>
    </section>
  </div>;
}

export default function ScoutStudio() {
  const [view, setView] = useState<View>("home");
  const [reportPage, setReportPage] = useState<ReportPage>(1);
  const [mobileNav, setMobileNav] = useState(false);
  const [reportRows, setReportRows] = useState<DataRow[]>([]);
  const [reportFileName, setReportFileName] = useState("Sin datos cargados");
  const [reportSourceCount, setReportSourceCount] = useState(0);
  const [analysisLabel, setAnalysisLabel] = useState("BASE ANALIZADA");
  const [analysisSourceTitle, setAnalysisSourceTitle] = useState("");
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
  const [seasonFiles, setSeasonFiles] = useState<SourceDataset[]>([]);
  const [mergeResult, setMergeResult] = useState<AggregationResult | null>(null);
  const [mergeError, setMergeError] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const seasonsInputRef = useRef<HTMLInputElement>(null);

  const players = useMemo(() => playerOptionsFor(reportRows), [reportRows]);
  const teams = useMemo(() => [...new Set(players.map((player) => player.team))].sort(alphabeticCollator.compare), [players]);
  const teamPlayers = useMemo(
    () => players.filter((player) => player.team === selectedTeam).sort((a, b) => alphabeticCollator.compare(a.player, b.player)),
    [players, selectedTeam],
  );
  const report = useMemo(
    () => buildPlayerReport(reportRows, selectedPlayer, minimumMinutes, cohort),
    [reportRows, selectedPlayer, minimumMinutes, cohort],
  );
  const dataReady = reportRows.length > 0;
  const profileReady = Boolean(profile.sourceUrl || profile.playerImage || profile.clubLogo);

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
    if (!reportThemeLoaded) return;
    try { window.localStorage.setItem("fos-scout-report-theme-v1", JSON.stringify(reportTheme)); } catch { /* El diseño continúa activo durante la sesión. */ }
  }, [reportTheme, reportThemeLoaded]);

  function restoreProfile(nextReport: PlayerReport | null) {
    const base = profileFromReport(nextReport);
    if (!nextReport?.player) return { profile: base, url: "" };
    try {
      const saved = window.localStorage.getItem(`fos-transfermarkt:${nextReport.player.toLocaleLowerCase("es")}`);
      const stored = saved ? JSON.parse(saved) as Partial<TransfermarktProfile> : {};
      return { profile: { ...base, ...stored }, url: String(stored.sourceUrl ?? "") };
    } catch {
      return { profile: base, url: "" };
    }
  }

  useEffect(() => {
    if (!report?.player || !profileReady) return;
    try {
      window.localStorage.setItem(`fos-transfermarkt:${report.player.toLocaleLowerCase("es")}`, JSON.stringify(profile));
    } catch { /* Los recursos grandes pueden superar la cuota local; la sesión sigue funcionando. */ }
  }, [profile, profileReady, report?.player]);

  async function onReportFiles(files?: FileList | File[]) {
    if (!files) return;
    const list = [...files].filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!list.length) return;
    setReportLoading(true);
    setReportError("");
    try {
      if (list.length > 3) throw new Error("Selecciona entre uno y tres archivos de datos.");
      const datasets = await Promise.all(list.map(readWorkbook));
      const result = aggregateDatasets(datasets);
      const sourceTitle = datasets.map((dataset) => dataset.fileName.replace(/\.(xlsx|xls)$/i, "")).join(" + ");
      setReportRows(result.rows);
      setReportFileName(sourceTitle);
      setReportSourceCount(datasets.length);
      setAnalysisLabel(datasets.length > 1 ? "BASES ANALIZADAS" : "BASE ANALIZADA");
      setAnalysisSourceTitle(sourceTitle);
      const initialSelection = firstPlayerSelection(result.rows);
      setSelectedTeam(initialSelection.team);
      setSelectedPlayer(initialSelection.index);
      const restored = restoreProfile(buildPlayerReport(result.rows, initialSelection.index, minimumMinutes, cohort));
      setProfile(restored.profile);
      setTransfermarktUrl(restored.url);
      setBackgroundRemovalStatus("");
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
    } finally {
      setReportLoading(false);
    }
  }

  async function onSeasonFiles(files: FileList | File[]) {
    const list = [...files].filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!list.length) return;
    setMergeLoading(true);
    setMergeError("");
    setMergeResult(null);
    try {
      const parsed = await Promise.all(list.map(readWorkbook));
      const byName = new Map([...seasonFiles, ...parsed].map((file) => [file.fileName, file]));
      if (byName.size > 3) throw new Error("Puedes trabajar con un máximo de tres archivos a la vez.");
      setSeasonFiles([...byName.values()].sort((a, b) => a.season - b.season));
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
    } finally {
      setMergeLoading(false);
    }
  }

  async function extractTransfermarktProfile() {
    if (!transfermarktUrl.trim()) {
      setTransfermarktError("Pega primero la URL del perfil del jugador.");
      return;
    }
    setTransfermarktLoading(true);
    setTransfermarktError("");
    try {
      const response = await fetch("/api/transfermarkt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: transfermarktUrl.trim() }),
      });
      const result = await response.json() as Partial<TransfermarktProfile> & { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo leer el perfil.");
      setProfile((current) => {
        const populated = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== "" && value !== undefined));
        return { ...current, ...populated, sourceUrl: transfermarktUrl.trim() };
      });
      setBackgroundRemovalStatus("");
    } catch (error) {
      setTransfermarktError(error instanceof Error ? error.message : "No se pudo leer el perfil.");
    } finally {
      setTransfermarktLoading(false);
    }
  }

  function updateProfile(field: keyof TransfermarktProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function selectPlayer(index: number) {
    setSelectedPlayer(index);
    const restored = restoreProfile(buildPlayerReport(reportRows, index, minimumMinutes, cohort));
    setProfile(restored.profile);
    setTransfermarktUrl(restored.url);
    setTransfermarktError("");
    setBackgroundRemovalStatus("");
  }

  function selectTeam(team: string) {
    setSelectedTeam(team);
    const firstPlayer = players.find((player) => player.team === team);
    if (firstPlayer) selectPlayer(firstPlayer.index);
  }

  function loadProfileAsset(field: "playerImage" | "clubLogo" | "leagueLogo", file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile(field, String(reader.result ?? ""));
      if (field === "playerImage") setBackgroundRemovalStatus("Imagen cargada. Puedes quitar el fondo con IA.");
    };
    reader.readAsDataURL(file);
  }

  async function removePlayerBackground() {
    const source = profile.playerImage.trim();
    if (!source) {
      setBackgroundRemovalStatus("Primero carga o extrae una foto del jugador.");
      return;
    }
    setBackgroundRemoving(true);
    setBackgroundRemovalStatus("Preparando el modelo de IA… La primera vez puede tardar.");
    try {
      const imageSource = /^data:|^blob:/i.test(source)
        ? source
        : `https://images.weserv.nl/?url=${encodeURIComponent(source.replace(/^https?:\/\//i, ""))}`;
      const { removeBackground } = await import("@imgly/background-removal");
      const result = await removeBackground(imageSource, {
        model: "small",
        output: { format: "image/png", quality: 1 },
        progress: (key, current, total) => {
          const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
          setBackgroundRemovalStatus(percent ? `Descargando modelo IA · ${percent}%` : `Preparando ${key}…`);
        },
      });
      const dataUrl = await blobToDataUrl(result);
      updateProfile("playerImage", dataUrl);
      setBackgroundRemovalStatus("✓ Fondo eliminado. La imagen PNG quedó guardada en esta sesión.");
    } catch {
      setBackgroundRemovalStatus("No se pudo eliminar el fondo. Reintenta o utiliza otra imagen.");
    } finally {
      setBackgroundRemoving(false);
    }
  }

  function runMerge() {
    setMergeError("");
    try {
      const result = aggregateDatasets(seasonFiles);
      const sourceLabel = seasonFiles.map((file) => file.fileName.replace(/\.(xlsx|xls)$/i, "")).join(" + ");
      setMergeResult(result);
      setReportRows(result.rows);
      setReportFileName(sourceLabel || "Base consolidada");
      setReportSourceCount(seasonFiles.length);
      setAnalysisLabel(seasonFiles.length > 1 ? "BASES ANALIZADAS" : "BASE ANALIZADA");
      setAnalysisSourceTitle(sourceLabel || "Base consolidada");
      const initialSelection = firstPlayerSelection(result.rows);
      setSelectedTeam(initialSelection.team);
      setSelectedPlayer(initialSelection.index);
      setReportPage(1);
      setReportError("");
      const restored = restoreProfile(buildPlayerReport(result.rows, initialSelection.index, minimumMinutes, cohort));
      setProfile(restored.profile);
      setTransfermarktUrl(restored.url);
      setTransfermarktError("");
      setBackgroundRemovalStatus("");
      setView("reports");
    } catch (error) {
      setMergeResult(null);
      setMergeError(error instanceof Error ? error.message : "No se pudieron combinar las bases.");
    }
  }

  function resetReport() {
    setReportRows([]);
    setReportFileName("Sin datos cargados");
    setReportSourceCount(0);
    setAnalysisLabel("BASE ANALIZADA");
    setAnalysisSourceTitle("");
    setSelectedTeam("");
    setSelectedPlayer(0);
    setMinimumMinutes(500);
    setCohort("AUTO");
    setReportError("");
    setProfile(profileFromReport(null));
    setTransfermarktUrl("");
    setTransfermarktError("");
    setBackgroundRemovalStatus("");
  }

  const navItems = [
    { id: "home" as const, label: "Inicio", hint: "Scouting platform", icon: LayoutDashboard },
    { id: "reports" as const, label: "Reportes", hint: "Radar y percentiles", icon: BarChart3 },
    { id: "seasons" as const, label: "Combinar bases", hint: "1 a 3 archivos", icon: Merge },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>F</span></div>
          <div><strong>FOS Scout Lab</strong><small>Scout intelligence</small></div>
          <button className="sidebar-close" onClick={() => setMobileNav(false)} aria-label="Cerrar menú"><X size={19} /></button>
        </div>
        <nav className="side-nav" aria-label="Navegación principal">
          <span className="nav-eyebrow">Espacio de trabajo</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => { setView(item.id); setMobileNav(false); }}>
                <Icon size={19} /><span><b>{item.label}</b><small>{item.hint}</small></span>
              </button>
            );
          })}
        </nav>
        <div className="side-card">
          <ShieldCheck size={20} />
          <div><strong>Datos privados</strong><p>Los archivos se procesan localmente en este navegador.</p></div>
        </div>
        <div className="sidebar-footer"><span className="status-dot" /> Sistema local · v0.4</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="breadcrumb"><LayoutDashboard size={15} /><span>Scout Lab</span><span>/</span><strong>{view === "home" ? "Inicio" : view === "reports" ? "Reportes" : "Combinar bases"}</strong></div>
          <div className="top-actions"><span className="privacy-pill"><LockKeyhole size={14} /> Solo tú</span><button className="icon-button" aria-label="Ayuda" title="Los datos nunca salen del navegador"><CircleHelp size={18} /></button></div>
        </header>

        {view === "home" ? <LandingPage onReports={() => setView("reports")} onMerge={() => setView("seasons")} /> : view === "reports" ? (
          <div className="page-content reports-page">
            <section className="page-heading">
              <div><span className="kicker">Scout intelligence workspace</span><h1>Convierte datos en <span>decisiones de scouting.</span></h1><p>Explora rendimiento, compara perfiles y construye reportes visuales listos para presentar.</p><div className="heading-chips"><span>Percentiles posicionales</span><span>1–3 bases</span><span>Editor visual</span></div></div>
              <div className="heading-actions">
                <button className="button secondary" onClick={resetReport}><RotateCcw size={16} /> Restablecer</button>
                <button className="button primary" onClick={() => window.print()} disabled={!report || !dataReady}><Printer size={16} /> {reportPage === 1 ? "Imprimir reporte" : `Imprimir página ${reportPage}`}</button>
              </div>
            </section>

            <input ref={reportInputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => event.target.files && onReportFiles(event.target.files)} />

            <section className="workflow-strip" aria-label="Flujo del reporte">
              <div className={`workflow-step ${dataReady ? "complete" : "active"}`}><span>{dataReady ? <Check size={15} /> : "01"}</span><div><b>01 · Cargar datos</b><small>{dataReady ? reportFileName : "Excel de liga o temporada"}</small></div></div>
              <div className="workflow-line" />
              <div className={`workflow-step ${profileReady ? "complete" : dataReady ? "active" : ""}`}><span>{profileReady ? <Check size={15} /> : "02"}</span><div><b>02 · Completar perfil</b><small>Transfermarkt, logos y foto PNG</small></div></div>
              <div className="workflow-line" />
              <div className={`workflow-step ${dataReady && profileReady ? "active" : ""}`}><span>03</span><div><b>03 · Diseñar reporte</b><small>Radar, visuales y observaciones</small></div></div>
            </section>

            {!dataReady ? (
              <section className="dataset-onboarding">
                <span className="dataset-step">PASO 01</span>
                <span className="dataset-icon"><FileSpreadsheet size={30} /></span>
                <h2>Comienza cargando los datos</h2>
                <p>Selecciona entre uno y tres Excel. Cada archivo puede representar una liga o una temporada.</p>
                <button className="button primary dataset-button" onClick={() => reportInputRef.current?.click()}><Upload size={17} /> {reportLoading ? "Leyendo archivos…" : "Cargar datos de scouting"}</button>
                <small>.XLSX o .XLS · primera hoja · procesamiento local</small>
                {reportError && <div className="inline-error">{reportError}</div>}
              </section>
            ) : <>
              <nav className="report-page-tabs" aria-label="Páginas del reporte">
                <button className={reportPage === 1 ? "active" : ""} onClick={() => setReportPage(1)}><span>01</span><div><b>Ficha y radar</b><small>Estilo Jordhy Thompson</small></div></button>
                <button className={reportPage === 2 ? "active" : ""} onClick={() => setReportPage(2)}><span>02</span><div><b>Visuales</b><small>Mapas e imágenes</small></div></button>
                <button className={reportPage === 3 ? "active" : ""} onClick={() => setReportPage(3)}><span>03</span><div><b>Observaciones</b><small>Texto y contexto</small></div></button>
                <em>Las páginas 2 y 3 son totalmente editables</em>
              </nav>

              {reportPage === 1 ? <div className="report-workspace">
                <section className="control-panel enrichment-controls">
                  <div className="panel-title"><div><span className="mini-icon"><FileSpreadsheet size={17} /></span><div><h2>1. Datos y jugador</h2><p>{reportFileName}</p></div></div><span className="tiny-state">LISTO</span></div>
                  <button className="upload-box compact" onClick={() => reportInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReportFiles(event.dataTransfer.files); }}>
                    <span className="upload-icon"><Upload size={18} /></span><span><b>{reportLoading ? "Leyendo bases…" : "Reemplazar archivos"}</b><small>{reportSourceCount} base{reportSourceCount === 1 ? "" : "s"} · {reportRows.length} jugadores</small></span>
                  </button>
                  {reportError && <div className="inline-error">{reportError}</div>}
                  <div className="player-selector-flow">
                    <label className="field-group selection-step"><span className="selection-step-title"><i>1</i><FieldLabel>Equipo</FieldLabel></span><span className="select-wrap"><Files size={16} /><select value={selectedTeam} disabled={backgroundRemoving} onChange={(event) => selectTeam(event.target.value)}>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select><ChevronDown size={16} /></span></label>
                    <span className="selection-flow-line" aria-hidden="true" />
                    <label className="field-group selection-step"><span className="selection-step-title"><i>2</i><FieldLabel>Jugador</FieldLabel></span><span className="select-wrap"><Search size={16} /><select value={selectedPlayer} disabled={backgroundRemoving || !teamPlayers.length} onChange={(event) => selectPlayer(Number(event.target.value))}>{teamPlayers.map((player) => <option key={`${player.player}-${player.index}`} value={player.index}>{player.player}</option>)}</select><ChevronDown size={16} /></span></label>
                  </div>
                  <div className="two-fields">
                    <label className="field-group"><FieldLabel>Cohorte</FieldLabel><span className="select-wrap simple"><select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="AUTO">Automática</option><option value="GK">Porteros</option><option value="CB">Centrales</option><option value="FB">Laterales</option><option value="MID">Mediocampistas</option><option value="WING">Extremos</option><option value="AM">Mediapuntas</option><option value="CF">Delanteros</option></select><ChevronDown size={16} /></span></label>
                    <label className="field-group"><FieldLabel>Mín. minutos</FieldLabel><input className="text-input" type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))} /></label>
                  </div>
                  <div className="data-summary"><div><span>Bases</span><b>{reportSourceCount}</b></div><div><span>Jugadores</span><b>{numberFormat(reportRows.length)}</b></div><div><span>Cohorte</span><b>{report?.cohortSize ?? 0}</b></div></div>
                  <div className="report-copy-editor"><span className="field-label">Texto de la base en el informe</span><label><small>Etiqueta</small><input value={analysisLabel} placeholder="BASE ANALIZADA" onChange={(event) => setAnalysisLabel(event.target.value)} /></label><label><small>Nombre de liga o temporada</small><input value={analysisSourceTitle} placeholder="Ej. MLS Next Pro 2026" onChange={(event) => setAnalysisSourceTitle(event.target.value)} /></label></div>

                  <div className="control-divider" />
                  <div className="panel-title enrichment-title"><div><span className="mini-icon gold"><Sparkles size={17} /></span><div><h2>2. Perfil Transfermarkt</h2><p>Datos biográficos y recursos</p></div></div><span className={profileReady ? "tiny-state ready-state" : "tiny-state"}>{profileReady ? "CARGADO" : "PENDIENTE"}</span></div>
                  <label className="field-group transfermarkt-url"><FieldLabel>URL del perfil</FieldLabel><input className="text-input" type="url" placeholder="https://www.transfermarkt.com/.../profil/spieler/..." value={transfermarktUrl} onChange={(event) => setTransfermarktUrl(event.target.value)} /></label>
                  <button className="button primary extract-button" onClick={extractTransfermarktProfile} disabled={transfermarktLoading}><Sparkles size={15} /> {transfermarktLoading ? "Extrayendo perfil…" : "Extraer datos, logos y foto"}</button>
                  {transfermarktError && <div className="inline-error">{transfermarktError}</div>}
                  <div className="asset-grid">
                    {([['playerImage', 'Jugador PNG', profile.playerImage], ['clubLogo', 'Escudo', profile.clubLogo], ['leagueLogo', 'Liga', profile.leagueLogo]] as const).map(([field, label, src]) => <label className={`asset-upload ${src ? "has-asset" : ""}`} key={field}>
                      {src ? <ReportImage src={src} alt={label} className="asset-preview" /> : <ImageIcon size={21} />}
                      <span>{label}</span><small>{src ? "Cambiar" : "Subir"}</small>
                      <input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(event) => loadProfileAsset(field, event.target.files?.[0])} />
                    </label>)}
                  </div>
                  <button className="remove-bg-button" onClick={removePlayerBackground} disabled={backgroundRemoving || !profile.playerImage}><Sparkles size={15} /> {backgroundRemoving ? "Quitando fondo…" : "Quitar fondo con IA"}</button>
                  {backgroundRemovalStatus && <div className={`background-status ${backgroundRemovalStatus.startsWith("✓") ? "success" : ""}`} aria-live="polite">{backgroundRemovalStatus}</div>}
                  <p className="asset-help">Procesamiento local con IMG.LY. La primera vez se descarga el modelo; después queda almacenado en la caché del navegador.</p>

                  <details className="profile-details">
                    <summary>Revisar y editar ficha</summary>
                    <div className="profile-field-grid">
                      {([['number', 'Dorsal'], ['league', 'Liga'], ['club', 'Club'], ['marketValue', 'Valor mercado'], ['birthDate', 'Nacimiento'], ['birthPlace', 'Lugar'], ['height', 'Altura'], ['foot', 'Pie'], ['contract', 'Contrato'], ['agent', 'Agente'], ['nationalTeam', 'Selección'], ['capsGoals', 'Caps / goles']] as Array<[keyof TransfermarktProfile, string]>).map(([field, label]) => <label key={field}><span>{label}</span><input value={profile[field]} onChange={(event) => updateProfile(field, event.target.value)} /></label>)}
                    </div>
                  </details>
                </section>

                <section className="report-preview-wrap">
                  <div className="preview-toolbar"><div><span className="live-dot" /> Página 01 · Ficha de scouting</div><span>Basada en Radar Jordhy Thompson v2</span></div>
                  {report ? <article className="scout-report jordhy-report" style={reportThemeStyle(reportTheme)}>
                    <header className="dossier-header">
                      <div className="dossier-portrait">
                        <span className="portrait-glow" />
                        {profile.clubLogo ? <ReportImage src={profile.clubLogo} alt={profile.club || report.team} className="dossier-club-logo" /> : <span className="dossier-club-fallback">{report.team.slice(0, 2).toUpperCase()}</span>}
                        <b className="shirt-number">#{profile.number || "—"}</b>
                        {profile.playerImage ? <ReportImage src={profile.playerImage} alt={report.player} className="dossier-player-image" /> : <div className="dossier-player-fallback">{report.player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>}
                      </div>
                      <div className="dossier-info">
                        <div className="dossier-topline">
                          <div className="competition-lockup">{profile.leagueLogo && <ReportImage src={profile.leagueLogo} alt={profile.league || "Liga"} className="dossier-league-logo" />}<span>{profile.league || "Competición"} · {profile.club || report.team}</span></div>
                          <div className="market-lockup"><small>VALOR DE MERCADO</small><strong>{profile.marketValue || "—"}</strong><span>TRANSFERMARKT</span></div>
                        </div>
                        <h2>{report.player}</h2>
                        <div className="identity-line"><b>{profile.position || report.position}</b><span>{profile.citizenship || report.passport}</span></div>
                        <div className="dossier-meta-grid">
                          <div><span>Nacimiento</span><b>{profile.birthDate || "—"}{profile.age || report.age !== "—" ? ` · ${profile.age || report.age}a` : ""}</b></div>
                          <div><span>Lugar</span><b>{profile.birthPlace || "—"}</b></div>
                          <div><span>Altura</span><b>{profile.height || "—"}</b></div>
                          <div><span>Pie</span><b>{profile.foot || report.foot}</b></div>
                          <div><span>Contrato</span><b>{profile.contract || report.contract}</b></div>
                          <div><span>Agente</span><b>{profile.agent || "—"}</b></div>
                          <div><span>Selección</span><b>{profile.nationalTeam || "—"}</b></div>
                          <div><span>Caps / goles</span><b>{profile.capsGoals || "—"}</b></div>
                        </div>
                      </div>
                    </header>

                    <section className="dossier-season-strip">
                      <div className="season-source"><span>{analysisLabel || (reportSourceCount > 1 ? "BASES ANALIZADAS" : "BASE ANALIZADA")}</span><b>{analysisSourceTitle || reportFileName}</b><small>Cohorte {report.cohort} · mín. {minimumMinutes}′</small></div>
                      <div className="dossier-stat"><strong>{numberFormat(report.matches)}</strong><span>Partidos</span></div>
                      <div className="dossier-stat"><strong>{numberFormat(report.minutes)}</strong><span>Minutos</span></div>
                      <div className="dossier-stat goals"><strong>{numberFormat(report.goals)}</strong><span>Goles</span></div>
                      <div className="dossier-stat assists"><strong>{numberFormat(report.assists)}</strong><span>Asist.</span></div>
                      <div className="score-ring" style={{ "--score": `${report.score * 3.6}deg` } as React.CSSProperties}><b>{report.score}</b><span>Índice</span></div>
                    </section>

                    <section className="dossier-radar-row">
                      <div className="dossier-radar">{report.metrics.length ? <PizzaRadar metrics={report.metrics} score={report.score} /> : <div className="empty-radar"><BarChart3 size={34} /><b>No encontramos métricas para esta cohorte</b></div>}</div>
                      <aside className="dossier-reading">
                        <span>PERFIL POR PERCENTILES</span><h3>vs. {report.cohortSize} jugadores comparables</h3>
                        <div className="average-percentile"><strong>{report.score}</strong><small>percentil<br />medio</small></div>
                        <div className="dossier-legend"><span><i className="legend-red" />Finalización / defensa</span><span><i className="legend-gold" />Creación / progresión</span><span><i className="legend-teal" />Desequilibrio / pase</span></div>
                        <div className="quick-reading"><b>LECTURA RÁPIDA</b><p>{report.reading}</p></div>
                      </aside>
                    </section>

                    <section className="metric-breakdown">
                      {[0, 1, 2].map((group) => <div className={`metric-group group-${group}`} key={group}>
                        <h3>{group === 0 ? "Finalización · Defensa" : group === 1 ? "Creación · Progresión" : "Desequilibrio · Pase"}</h3>
                        {report.metrics.filter((metric) => metric.group === group).slice(0, 4).map((metric) => <div className="metric-row" key={metric.key}><div><span>{metric.label}</span><b>{formatCell(metric.value)} <small>· P{metric.percentile}</small></b></div><i><em style={{ width: `${metric.percentile}%` }} /></i></div>)}
                      </div>)}
                    </section>
                    <footer className="dossier-footer"><p>Percentiles por posición · mínimo {minimumMinutes}′ · {report.cohortSize} jugadores en la cohorte · datos por 90 minutos.</p><div><span>ELABORADO POR</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div></footer>
                  </article> : <div className="empty-preview">Selecciona un jugador para generar el informe.</div>}
                </section>
              </div> : report ? <ReportPageDesigner pageNumber={reportPage} player={report.player} team={profile.club || report.team} position={profile.position || report.position} theme={reportTheme} onThemeChange={setReportTheme} /> : <div className="empty-preview">Selecciona un jugador para diseñar las páginas.</div>}
            </>}
          </div>
        ) : (
          <div className="page-content seasons-page">
            <section className="page-heading">
              <div><span className="kicker">Data fusion workspace</span><h1>Una sola lectura para <span>ligas y temporadas.</span></h1><p>Procesa hasta tres fuentes, normaliza sus métricas y crea una base maestra lista para análisis.</p><div className="heading-chips"><span>Datos privados</span><span>Ponderación inteligente</span><span>Excel limpio</span></div></div>
              <div className="rule-pills"><span>Σ Minutos y partidos</span><span>Ø Totales</span><span>⚖ /90 y porcentajes</span></div>
            </section>

            <div className="merge-grid">
              <section className="merge-builder card">
                <div className="card-header"><div><span className="mini-icon green"><Files size={18} /></span><div><h2>Bases de datos</h2><p>Cada archivo puede representar una liga o una temporada.</p></div></div><span className="step-chip">1–3 ARCHIVOS</span></div>
                <input ref={seasonsInputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => event.target.files && onSeasonFiles(event.target.files)} />
                <button className="upload-box large" onClick={() => seasonsInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onSeasonFiles(event.dataTransfer.files); }}>
                  <span className="upload-icon large-icon"><FolderOpen size={25} /></span><span><b>{mergeLoading ? "Leyendo bases…" : "Arrastra aquí tus archivos Excel"}</b><small>Selecciona 1, 2 o 3 archivos .xlsx</small></span><span className="browse-link">Explorar</span>
                </button>
                {seasonFiles.length > 0 && <div className="file-stack">{seasonFiles.map((file) => <div className="file-row" key={file.fileName}><span className="excel-icon"><FileSpreadsheet size={18} /></span><div><b>{file.fileName}</b><small>{file.rows.length} jugadores · {file.headers.length} columnas</small></div><span className={file.season ? "year-chip" : "year-chip neutral"}>{file.season || "Liga/base"}</span><button onClick={() => { setSeasonFiles((current) => current.filter((item) => item.fileName !== file.fileName)); setMergeResult(null); }} aria-label={`Quitar ${file.fileName}`}><X size={16} /></button></div>)}</div>}
                {mergeError && <div className="inline-error merge-error">{mergeError}</div>}
                <div className="merge-actions"><button className="button ghost" onClick={() => { setSeasonFiles([]); setMergeResult(null); setMergeError(""); }} disabled={!seasonFiles.length}>Limpiar</button><button className="button primary wide" onClick={runMerge} disabled={seasonFiles.length < 1}><Merge size={17} /> {seasonFiles.length > 1 ? `Combinar ${seasonFiles.length} bases y usar en el informe` : "Usar base automáticamente en el informe"}</button></div>
              </section>

              <aside className="rules-card card">
                <div className="card-header"><div><span className="mini-icon gold"><Sparkles size={18} /></span><div><h2>Reglas de consolidación</h2><p>Basadas en tu modelo de cálculo.</p></div></div></div>
                <div className="rules-list"><div><span className="rule-symbol sum">Σ</span><p><b>Partidos y minutos</b><small>Se suman entre todas las bases cargadas.</small></p></div><div><span className="rule-symbol avg">Ø</span><p><b>Métricas totales</b><small>Promedio por archivo, sin inflar el volumen.</small></p></div><div><span className="rule-symbol weight">W</span><p><b>Métricas por 90</b><small>Promedio ponderado por minutos jugados.</small></p></div><div><span className="rule-symbol pct">%</span><p><b>Porcentajes</b><small>Ponderados por intentos cuando existen; si no, por minutos.</small></p></div><div><span className="rule-symbol latest">↗</span><p><b>Equipo y edad</b><small>Se conserva el dato del año más reciente o del último archivo cargado.</small></p></div></div>
              </aside>
            </div>

            <section className={`result-card card ${mergeResult ? "has-result" : ""}`}>
              <div className="card-header"><div><span className="mini-icon blue"><BarChart3 size={18} /></span><div><h2>Datos para el informe</h2><p>{mergeResult ? `${mergeResult.rows.length} jugadores ya incorporados al creador de reportes.` : "La base procesada se utilizará directamente para crear el informe."}</p></div></div>{mergeResult && <button className="button primary" onClick={() => { setReportPage(1); setView("reports"); }}><BarChart3 size={17} /> Abrir informe</button>}</div>
              {mergeResult ? <><div className="result-kpis"><div><span>Jugadores únicos</span><b>{numberFormat(mergeResult.rows.length)}</b></div><div><span>Bases procesadas</span><b>{seasonFiles.length}</b></div><div><span>Columnas disponibles</span><b>{mergeResult.headers.length}</b></div><div><span>Estado</span><b className="ready"><Check size={15} /> En reportes</b></div></div>{mergeResult.warnings.map((warning) => <div className="inline-error" key={warning}>{warning}</div>)}<div className="table-scroll"><table><thead><tr>{["Player", "Data sources", "Seasons", "Team", "Position", mergeResult.matchesColumn, mergeResult.minutesColumn].filter((header) => mergeResult.headers.includes(header)).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{mergeResult.rows.slice(0, 8).map((row, index) => <tr key={`${row.Player}-${index}`}>{["Player", "Data sources", "Seasons", "Team", "Position", mergeResult.matchesColumn, mergeResult.minutesColumn].filter((header) => mergeResult.headers.includes(header)).map((header) => <td key={header}>{formatCell(row[header], header === mergeResult.minutesColumn || header === mergeResult.matchesColumn ? 0 : 2)}</td>)}</tr>)}</tbody></table></div><div className="table-footer"><span>Mostrando {Math.min(8, mergeResult.rows.length)} de {mergeResult.rows.length} jugadores</span><span>Las {mergeResult.headers.length} columnas están disponibles en el creador del informe.</span></div></> : <div className="result-empty"><span className="empty-merge-icon"><Merge size={30} /></span><b>Aún no hay datos procesados</b><p>Carga entre una y tres bases para comenzar el informe.</p><div><span>1</span><i /><span>2</span><i /><span><Check size={13} /></span></div></div>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
