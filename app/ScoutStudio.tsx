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
import { SimilarityStudio } from "./SimilarityStudio";
import { DEFAULT_REPORT_THEME, reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  aggregateDatasets,
  buildPlayerReport,
  detectCoreColumns,
  extractSeason,
  formatCell,
  type DataRow,
  type PlayerReport,
  type SourceDataset,
} from "@/lib/scouting";
import type { TransfermarktProfile } from "@/lib/transfermarkt";
import { formatPlayerPositions } from "@/lib/positions";
import { removePlayerImageBackground } from "@/lib/playerImageBackground";

type View = "home" | "reports" | "similarity";
type ReportPage = 1 | 2 | 3;
type ReportFileMode = "single" | "combine" | "replace";
type ProfileAssetField = "playerImage" | "clubLogo" | "leagueLogo";

const TRANSFERMARKT_LOGO = "/transfermarkt-logo.svg";

const PROFILE_ASSETS: Array<{ field: ProfileAssetField; label: string; linkLabel: string }> = [
  { field: "playerImage", label: "Foto del jugador", linkLabel: "Jugador" },
  { field: "clubLogo", label: "Escudo del club", linkLabel: "Escudo" },
  { field: "leagueLogo", label: "Logo de la liga", linkLabel: "Liga" },
];

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
  const profileReady = Boolean(profile.sourceUrl || profile.playerImage || profile.clubLogo || profile.leagueLogo);
  const recipientName = reportRecipientName.trim() || "Club destinatario";
  const recipientLogoReady = /^https?:\/\/\S+$/i.test(reportRecipientLogoUrl.trim());

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

  async function onReportFiles(files?: FileList | File[], mode: ReportFileMode = "replace") {
    if (!files) return;
    const list = [...files].filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!list.length) return;
    setReportLoading(true);
    setReportError("");
    try {
      if (mode === "single" && list.length !== 1) throw new Error("Para usar una base, selecciona solamente un archivo Excel.");
      if (mode === "combine" && list.length < 2) throw new Error("Para combinar bases, selecciona dos o más archivos Excel.");
      const datasets = await Promise.all(list.map(readWorkbook));
      const result = aggregateDatasets(datasets);
      const sourceTitle = datasets.map((dataset) => dataset.fileName.replace(/\.(xlsx|xls)$/i, "")).join(" + ");
      const displayName = datasets.length > 1 ? combinedBaseName.trim() || "Combinación temporal" : sourceTitle;
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
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
    } finally {
      setReportLoading(false);
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
      if (result.playerImage || result.clubLogo || result.leagueLogo) setAssetSourceStatus("✓ Imágenes actualizadas desde Transfermarkt.");
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
      setAssetSourceStatus(`✓ ${label} cargada desde el ordenador.`);
      if (field === "playerImage") setBackgroundRemovalStatus("Imagen cargada. Puedes quitar el fondo con IA.");
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
      setAssetSourceStatus(`✓ Link aplicado a ${label.toLowerCase()}.`);
      if (field === "playerImage") setBackgroundRemovalStatus("Imagen enlazada. Puedes quitar el fondo con IA.");
    } catch {
      setAssetSourceStatus("Ingresa un link de imagen válido que comience con http:// o https://.");
    }
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
      const result = await removePlayerImageBackground({
        playerImage: source,
        onProgress: (key, current, total) => {
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

  function resetReport() {
    setReportRows([]);
    setReportFileName("Sin datos cargados");
    setReportSourceCount(0);
    setCombinedBaseName("Combinación temporal 01");
    setAnalysisLabel("BASE ANALIZADA");
    setAnalysisSourceTitle("");
    setReportRecipientName("");
    setReportRecipientLogoUrl("");
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

  const navItems = [
    { id: "home" as const, label: "Inicio", hint: "Scouting platform", icon: LayoutDashboard },
    { id: "reports" as const, label: "Reportes", hint: "Radar y percentiles", icon: BarChart3 },
    { id: "similarity" as const, label: "Similitud", hint: "Jugadores comparables", icon: Search },
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
          <div className="breadcrumb"><LayoutDashboard size={15} /><span>Scout Lab</span><span>/</span><strong>{view === "home" ? "Inicio" : view === "reports" ? "Reportes" : "Similitud"}</strong></div>
          <div className="top-actions"><span className="privacy-pill"><LockKeyhole size={14} /> Solo tú</span><button className="icon-button" aria-label="Ayuda" title="Los datos nunca salen del navegador"><CircleHelp size={18} /></button></div>
        </header>

        {view === "home" ? <LandingPage onReports={() => setView("reports")} onMerge={() => setView("reports")} /> : view === "reports" ? (
          <div className="page-content reports-page">
            <section className="page-heading">
              <div><span className="kicker">Scout intelligence workspace</span><h1>Convierte datos en <span>decisiones de scouting.</span></h1><p>Explora rendimiento, compara perfiles y construye reportes visuales listos para presentar.</p><div className="heading-chips"><span>Percentiles posicionales</span><span>1 o más bases</span><span>Editor visual</span></div></div>
              <div className="heading-actions">
                <button className="button secondary" onClick={resetReport}><RotateCcw size={16} /> Restablecer</button>
                <button className="button primary" onClick={() => window.print()} disabled={!report || !dataReady}><Printer size={16} /> {reportPage === 1 ? "Imprimir reporte" : `Imprimir página ${reportPage}`}</button>
              </div>
            </section>

            <input ref={singleReportInputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "single"); event.target.value = ""; }} />
            <input ref={combinedReportInputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "combine"); event.target.value = ""; }} />
            <input ref={reportInputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => { if (event.target.files) void onReportFiles(event.target.files, "replace"); event.target.value = ""; }} />

            <section className="workflow-strip" aria-label="Flujo del reporte">
              <div className={`workflow-step ${dataReady ? "complete" : "active"}`}><span>{dataReady ? <Check size={15} /> : "01"}</span><div><b>01 · Base de datos</b><small>{dataReady ? reportFileName : "Una base o combinar 2+"}</small></div></div>
              <div className="workflow-line" />
              <div className={`workflow-step ${report ? "complete" : dataReady ? "active" : ""}`}><span>{report ? <Check size={15} /> : "02"}</span><div><b>02 · Elegir jugador</b><small>Equipo y jugador en orden alfabético</small></div></div>
              <div className="workflow-line" />
              <div className={`workflow-step ${profileReady ? "complete" : report ? "active" : ""}`}><span>{profileReady ? <Check size={15} /> : "03"}</span><div><b>03 · Perfil e imágenes</b><small>Transfermarkt, logos y foto PNG</small></div></div>
              <div className="workflow-line" />
              <div className={`workflow-step ${profileReady ? "active" : ""}`}><span>04</span><div><b>04 · Diseñar informe</b><small>Ficha, visuales y observaciones</small></div></div>
            </section>

            {!dataReady ? (
              <section className="dataset-onboarding database-gate">
                <span className="dataset-step">PASO 01 · FUENTE DEL INFORME</span>
                <span className="dataset-icon"><FileSpreadsheet size={30} /></span>
                <h2>¿Qué base de datos utilizará el informe?</h2>
                <p>Elige una base individual o combina automáticamente dos o más archivos antes de seleccionar al jugador.</p>
                <label className="temporary-source-name">
                  <span><b>Nombre temporal de la combinación</b><small>Se usará para identificar todos los archivos dentro del reporte.</small></span>
                  <input value={combinedBaseName} maxLength={80} onChange={(event) => setCombinedBaseName(event.target.value)} placeholder="Ej. MLS Next Pro · 2025–2026" aria-label="Nombre temporal de la combinación" />
                </label>
                <div className="database-choice-grid">
                  <button className="database-choice" onClick={() => singleReportInputRef.current?.click()} disabled={reportLoading}>
                    <span className="database-choice-tag">1 ARCHIVO</span><span className="database-choice-icon"><FileSpreadsheet size={25} /></span><b>Usar una base</b><small>Una liga o una temporada en un archivo Excel.</small><em>{reportLoading ? "Leyendo datos…" : "Seleccionar Excel"}<Upload size={14} /></em>
                  </button>
                  <button className="database-choice featured" onClick={() => combinedReportInputRef.current?.click()} disabled={reportLoading}>
                    <span className="database-choice-tag">2+ ARCHIVOS</span><span className="database-choice-icon"><Merge size={25} /></span><b>Combinar bases</b><small>Une todas las ligas o temporadas seleccionadas y usa el resultado directamente.</small><em>{reportLoading ? "Combinando datos…" : "Elegir archivos"}<Files size={14} /></em>
                  </button>
                </div>
                <small>.XLSX o .XLS · primera hoja · clave: nombre + edad + club · procesamiento local</small>
                {reportError && <div className="inline-error">{reportError}</div>}
              </section>
            ) : <>
              <nav className="report-page-tabs" aria-label="Páginas del reporte">
                <button className={reportPage === 1 ? "active" : ""} onClick={() => setReportPage(1)}><span>01</span><div><b>Ficha y radar</b><small>Estilo Jordhy Thompson</small></div></button>
                <button className={reportPage === 2 ? "active" : ""} onClick={() => setReportPage(2)}><span>02</span><div><b>Visuales</b><small>Mapas e imágenes</small></div></button>
                <button className={reportPage === 3 ? "active" : ""} onClick={() => setReportPage(3)}><span>03</span><div><b>Observaciones</b><small>Texto y contexto</small></div></button>
                <em>ETAPA 04 · Las páginas 2 y 3 son totalmente editables</em>
              </nav>

              {reportPage === 1 ? <div className="report-workspace">
                <section className="control-panel enrichment-controls">
                  <div className="panel-title"><div><span className="mini-icon"><FileSpreadsheet size={17} /></span><div><h2>1. Base de datos activa</h2><p>{reportFileName}</p></div></div><span className="tiny-state">LISTO</span></div>
                  <button className="upload-box compact" onClick={() => reportInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReportFiles(event.dataTransfer.files); }}>
                    <span className="upload-icon"><Upload size={18} /></span><span><b>{reportLoading ? "Leyendo bases…" : "Reemplazar archivos"}</b><small>{reportSourceCount} base{reportSourceCount === 1 ? "" : "s"} · {reportRows.length} jugadores</small></span>
                  </button>
                  {reportError && <div className="inline-error">{reportError}</div>}
                  <div className="control-divider" />
                  <div className="panel-title player-section-title"><div><span className="mini-icon"><Search size={17} /></span><div><h2>2. Equipo y jugador</h2><p>Selecciona en orden</p></div></div><span className="tiny-state">PASO 02</span></div>
                  <div className="player-selector-flow">
                    <label className="field-group selection-step"><span className="selection-step-title"><i>A</i><FieldLabel>Equipo</FieldLabel></span><span className="select-wrap"><Files size={16} /><select value={selectedTeam} disabled={backgroundRemoving} onChange={(event) => selectTeam(event.target.value)}>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select><ChevronDown size={16} /></span></label>
                    <span className="selection-flow-line" aria-hidden="true" />
                    <label className="field-group selection-step"><span className="selection-step-title"><i>B</i><FieldLabel>Jugador</FieldLabel></span><span className="select-wrap"><Search size={16} /><select value={selectedPlayer} disabled={backgroundRemoving || !teamPlayers.length} onChange={(event) => selectPlayer(Number(event.target.value))}>{teamPlayers.map((player) => <option key={`${player.player}-${player.index}`} value={player.index}>{player.player}</option>)}</select><ChevronDown size={16} /></span></label>
                  </div>
                  <div className="two-fields">
                    <label className="field-group"><FieldLabel>Cohorte</FieldLabel><span className="select-wrap simple"><select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="AUTO">Automática</option><option value="GK">Porteros</option><option value="CB">Centrales</option><option value="FB">Laterales</option><option value="MID">Mediocampistas</option><option value="WING">Extremos</option><option value="AM">Mediapuntas</option><option value="CF">Delanteros</option></select><ChevronDown size={16} /></span></label>
                    <label className="field-group"><FieldLabel>Mín. minutos</FieldLabel><input className="text-input" type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))} /></label>
                  </div>
                  <div className="data-summary"><div><span>Bases</span><b>{reportSourceCount}</b></div><div><span>Jugadores</span><b>{numberFormat(reportRows.length)}</b></div><div><span>Cohorte</span><b>{report?.cohortSize ?? 0}</b></div></div>
                  <div className="report-copy-editor"><span className="field-label">Texto de la base en el informe</span><label><small>Etiqueta</small><input value={analysisLabel} placeholder="BASE ANALIZADA" onChange={(event) => setAnalysisLabel(event.target.value)} /></label><label><small>{reportSourceCount > 1 ? "Nombre temporal de la combinación" : "Nombre de liga o temporada"}</small><input value={analysisSourceTitle} placeholder={reportSourceCount > 1 ? "Ej. MLS Next Pro · 2025–2026" : "Ej. MLS Next Pro 2026"} onChange={(event) => updateAnalysisSourceName(event.target.value)} /></label></div>
                  <div className="report-recipient-editor">
                    <div className="recipient-editor-head"><span className="field-label">Reporte generado para</span><small>Independiente del club del jugador</small></div>
                    <label><small>Nombre del club destinatario</small><input value={reportRecipientName} maxLength={80} placeholder="Ej. Club Deportivo…" onChange={(event) => setReportRecipientName(event.target.value)} /></label>
                    <label><small>Link del logo destinatario</small><input type="url" inputMode="url" value={reportRecipientLogoUrl} placeholder="https://sitio.com/logo.png" aria-invalid={Boolean(reportRecipientLogoUrl) && !recipientLogoReady} onChange={(event) => setReportRecipientLogoUrl(event.target.value)} /></label>
                    <p className={reportRecipientLogoUrl && !recipientLogoReady ? "recipient-link-status invalid" : "recipient-link-status"}>{recipientLogoReady ? "✓ Logo destinatario aplicado al pie del reporte." : "Pega un link directo http:// o https://. No se utilizará el escudo del jugador."}</p>
                  </div>

                  <div className="control-divider" />
                  <div className="panel-title enrichment-title"><div><span className="mini-icon transfermarkt-panel-logo"><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="transfermarkt-logo-image" /></span><div><h2>3. Transfermarkt e imágenes</h2><p>Datos biográficos, logos y retrato</p></div></div><span className={profileReady ? "tiny-state ready-state" : "tiny-state"}>{profileReady ? "CARGADO" : "PENDIENTE"}</span></div>
                  <label className="field-group transfermarkt-url"><FieldLabel>URL del perfil</FieldLabel><input className="text-input" type="url" placeholder="https://www.transfermarkt.com/.../profil/spieler/..." value={transfermarktUrl} onChange={(event) => setTransfermarktUrl(event.target.value)} /></label>
                  <button className="button primary extract-button" onClick={extractTransfermarktProfile} disabled={transfermarktLoading}><Sparkles size={15} /> {transfermarktLoading ? "Extrayendo perfil…" : "Extraer datos, logos y foto"}</button>
                  {transfermarktError && <div className="inline-error">{transfermarktError}</div>}
                  <div className="asset-grid">
                    {PROFILE_ASSETS.map(({ field, linkLabel }) => {
                      const src = profile[field];
                      return <div className={`asset-upload ${src ? "has-asset" : ""}`} key={field}>
                        {src ? <ReportImage src={src} alt={linkLabel} className="asset-preview" /> : <ImageIcon size={21} />}
                        <span>{linkLabel}</span><small>{src ? "Vista previa" : "Sin imagen"}</small>
                      </div>;
                    })}
                  </div>
                  <div className="asset-source-editor">
                    <div className="asset-source-heading"><b>Reemplazar imágenes</b><small>Pega un link directo o carga un archivo desde tu ordenador.</small></div>
                    {PROFILE_ASSETS.map(({ field, label, linkLabel }) => {
                      const src = profile[field];
                      const remoteSource = /^https?:\/\//i.test(src) ? src : "";
                      return <form className="asset-source-row" key={field} onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); applyProfileAssetUrl(field, String(data.get("assetUrl") ?? "")); }}>
                        <span className="asset-source-name">{linkLabel}</span>
                        <div className="asset-source-actions">
                          <input key={`${report?.player ?? "jugador"}-${field}-${remoteSource || "local"}`} name="assetUrl" type="url" inputMode="url" defaultValue={remoteSource} placeholder="https://imagen..." aria-label={`Link para ${label.toLowerCase()}`} required />
                          <button type="submit">Usar link</button>
                          <label><Upload size={13} /><span>Ordenador</span><input type="file" accept="image/png,image/webp,image/jpeg" hidden onChange={(event) => { loadProfileAsset(field, event.target.files?.[0]); event.target.value = ""; }} /></label>
                        </div>
                      </form>;
                    })}
                  </div>
                  {assetSourceStatus && <div className={`background-status asset-source-status ${assetSourceStatus.startsWith("✓") ? "success" : ""}`} aria-live="polite">{assetSourceStatus}</div>}
                  <button className="remove-bg-button" onClick={removePlayerBackground} disabled={backgroundRemoving || !profile.playerImage}><Sparkles size={15} /> {backgroundRemoving ? "Quitando fondo…" : "Quitar fondo solo a la foto"}</button>
                  {backgroundRemovalStatus && <div className={`background-status ${backgroundRemovalStatus.startsWith("✓") ? "success" : ""}`} aria-live="polite">{backgroundRemovalStatus}</div>}
                  <p className="asset-help"><b>Solo se procesa la foto del jugador.</b> Los escudos de clubes, logos de ligas y logo del destinatario conservan siempre su fondo original.</p>

                  <details className="profile-details">
                    <summary>Revisar y editar ficha</summary>
                    <div className="profile-field-grid">
                      {([['number', 'Dorsal'], ['league', 'Liga'], ['club', 'Club'], ['marketValue', 'Valor mercado'], ['birthDate', 'Nacimiento'], ['birthPlace', 'Lugar'], ['height', 'Altura'], ['position', 'Posiciones'], ['foot', 'Pie'], ['contract', 'Contrato'], ['agent', 'Agente'], ['nationalTeam', 'Selección'], ['capsGoals', 'Caps / goles']] as Array<[keyof TransfermarktProfile, string]>).map(([field, label]) => <label key={field}><span>{label}</span><input value={profile[field]} onChange={(event) => updateProfile(field, event.target.value)} /></label>)}
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
                          <div className="competition-lockup">
                            {profile.leagueLogo && <ReportImage src={profile.leagueLogo} alt={profile.league || "Liga"} className="dossier-league-logo" />}
                            <div className="competition-copy"><span>{profile.league || "Competición"}</span><strong>{profile.club || report.team}</strong></div>
                          </div>
                          <div className="market-lockup"><small>VALOR DE MERCADO</small><strong>{profile.marketValue || "—"}</strong><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="market-transfermarkt-logo" /></div>
                        </div>
                        <h2>{report.player}</h2>
                        <div className="identity-line"><b>{formatPlayerPositions(profile.position || report.position)}</b><span>{profile.citizenship || report.passport}</span></div>
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
                    <footer className="dossier-footer">
                      <p>Percentiles por posición · mínimo {minimumMinutes}′ · {report.cohortSize} jugadores en la cohorte · datos por 90 minutos.</p>
                      <div className="report-signatures">
                        <div className="report-author"><span>ELABORADO POR</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div>
                        <div className="report-recipient">
                          {recipientLogoReady ? <ReportImage src={reportRecipientLogoUrl.trim()} alt={recipientName} className="dossier-footer-club-logo" /> : <span className="dossier-footer-club-fallback">{recipientName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}
                          <div><span>REPORTE GENERADO PARA</span><b>{recipientName}</b></div>
                        </div>
                      </div>
                    </footer>
                  </article> : <div className="empty-preview">Selecciona un jugador para generar el informe.</div>}
                </section>
              </div> : report ? <ReportPageDesigner pageNumber={reportPage} player={report.player} team={profile.club || report.team} position={formatPlayerPositions(profile.position || report.position)} theme={reportTheme} onThemeChange={setReportTheme} /> : <div className="empty-preview">Selecciona un jugador para diseñar las páginas.</div>}
            </>}
          </div>
        ) : (
          <SimilarityStudio
            rows={reportRows}
            selectedIndex={selectedPlayer}
            sourceName={reportFileName}
            targets={players}
            theme={reportTheme}
            targetProfile={profile}
            recipientName={reportRecipientName}
            recipientLogoUrl={reportRecipientLogoUrl}
            onSelectTarget={selectPlayer}
            onTargetProfileChange={(nextProfile) => { setProfile(nextProfile); setTransfermarktUrl(nextProfile.sourceUrl); }}
            onRecipientNameChange={setReportRecipientName}
            onRecipientLogoChange={setReportRecipientLogoUrl}
            onOpenReports={() => { setReportPage(2); setView("reports"); }}
          />
        )}
      </main>
    </div>
  );
}
