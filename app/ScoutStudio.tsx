"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDownToLine,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  FileSpreadsheet,
  Files,
  FolderOpen,
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
} from "lucide-react";
import { PizzaRadar } from "./PizzaRadar";
import {
  aggregateSeasons,
  buildPlayerReport,
  DEMO_ROWS,
  detectCoreColumns,
  extractSeason,
  formatCell,
  type AggregationResult,
  type DataRow,
  type SeasonDataset,
} from "@/lib/scouting";

type View = "reports" | "seasons";

function readWorkbook(file: File): Promise<SeasonDataset> {
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

function ScoreBadge({ score }: { score: number }) {
  const label = score >= 70 ? "Señal fuerte" : score >= 50 ? "En seguimiento" : "Revisar en vídeo";
  return <span className={`score-badge score-${score >= 70 ? "high" : score >= 50 ? "mid" : "low"}`}>{label}</span>;
}

export default function ScoutStudio() {
  const [view, setView] = useState<View>("reports");
  const [mobileNav, setMobileNav] = useState(false);
  const [reportRows, setReportRows] = useState<DataRow[]>(DEMO_ROWS);
  const [reportFileName, setReportFileName] = useState("Vista de ejemplo");
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [minimumMinutes, setMinimumMinutes] = useState(500);
  const [cohort, setCohort] = useState("AUTO");
  const [reportError, setReportError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [seasonFiles, setSeasonFiles] = useState<SeasonDataset[]>([]);
  const [mergeResult, setMergeResult] = useState<AggregationResult | null>(null);
  const [mergeError, setMergeError] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const seasonsInputRef = useRef<HTMLInputElement>(null);

  const reportHeaders = useMemo(() => [...new Set(reportRows.flatMap((row) => Object.keys(row)))], [reportRows]);
  const reportCore = useMemo(() => detectCoreColumns(reportHeaders), [reportHeaders]);
  const players = useMemo(() => reportRows.map((row, index) => ({
    index,
    player: String(row[reportCore.player] ?? `Jugador ${index + 1}`),
    team: String(row[reportHeaders.find((header) => /team within|equipo durante/i.test(header)) ?? reportHeaders.find((header) => /^(team|equipo)$/i.test(header)) ?? ""] ?? ""),
  })), [reportRows, reportCore.player, reportHeaders]);
  const report = useMemo(
    () => buildPlayerReport(reportRows, selectedPlayer, minimumMinutes, cohort),
    [reportRows, selectedPlayer, minimumMinutes, cohort],
  );

  async function onReportFile(file?: File) {
    if (!file) return;
    setReportLoading(true);
    setReportError("");
    try {
      const dataset = await readWorkbook(file);
      const core = detectCoreColumns(dataset.headers);
      if (!core.player) throw new Error("No se encontró una columna Player/Jugador en el Excel.");
      if (!core.minutes) throw new Error("No se encontró la columna de minutos jugados.");
      setReportRows(dataset.rows);
      setReportFileName(dataset.fileName);
      setSelectedPlayer(0);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "No se pudo leer el archivo.");
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
      setSeasonFiles([...byName.values()].sort((a, b) => a.season - b.season));
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "No se pudieron leer los archivos.");
    } finally {
      setMergeLoading(false);
    }
  }

  function runMerge() {
    setMergeError("");
    try {
      setMergeResult(aggregateSeasons(seasonFiles));
    } catch (error) {
      setMergeResult(null);
      setMergeError(error instanceof Error ? error.message : "No se pudieron unir las temporadas.");
    }
  }

  function downloadMerge() {
    if (!mergeResult) return;
    const worksheet = XLSX.utils.json_to_sheet(mergeResult.rows, { header: mergeResult.headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Temporadas consolidadas");
    const years = seasonFiles.map((file) => file.season).filter(Boolean).sort();
    const label = years.length ? `${years[0]}-${years.at(-1)}` : "multi-temporada";
    XLSX.writeFile(workbook, `scouting-consolidado-${label}.xlsx`);
  }

  function resetReport() {
    setReportRows(DEMO_ROWS);
    setReportFileName("Vista de ejemplo");
    setSelectedPlayer(0);
    setMinimumMinutes(500);
    setCohort("AUTO");
    setReportError("");
  }

  const navItems = [
    { id: "reports" as const, label: "Reportes", hint: "Radar y percentiles", icon: BarChart3 },
    { id: "seasons" as const, label: "Unir temporadas", hint: "2 o más archivos", icon: Merge },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>F</span></div>
          <div><strong>FOS Scout Lab</strong><small>Personal workspace</small></div>
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
        <div className="sidebar-footer"><span className="status-dot" /> Prototipo local · v0.1</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileNav(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="breadcrumb"><LayoutDashboard size={15} /><span>Scout Lab</span><span>/</span><strong>{view === "reports" ? "Reportes" : "Unir temporadas"}</strong></div>
          <div className="top-actions"><span className="privacy-pill"><LockKeyhole size={14} /> Solo tú</span><button className="icon-button" aria-label="Ayuda" title="Los datos nunca salen del navegador"><CircleHelp size={18} /></button></div>
        </header>

        {view === "reports" ? (
          <div className="page-content reports-page">
            <section className="page-heading">
              <div><span className="kicker">Centro de análisis</span><h1>Convierte datos en una lectura de scouting.</h1><p>Carga una base Wyscout, elige un jugador y genera un perfil comparable listo para revisión.</p></div>
              <div className="heading-actions">
                <button className="button secondary" onClick={resetReport}><RotateCcw size={16} /> Restablecer</button>
                <button className="button primary" onClick={() => window.print()} disabled={!report}><Printer size={16} /> Imprimir reporte</button>
              </div>
            </section>

            <section className="workflow-strip" aria-label="Flujo del reporte">
              <div className="workflow-step complete"><span><Check size={15} /></span><div><b>01 · Dataset</b><small>{reportFileName}</small></div></div>
              <div className="workflow-line" />
              <div className="workflow-step active"><span>02</span><div><b>Seleccionar perfil</b><small>{players.length} jugadores disponibles</small></div></div>
              <div className="workflow-line" />
              <div className="workflow-step"><span>03</span><div><b>Revisar y exportar</b><small>Informe imprimible</small></div></div>
            </section>

            <div className="report-workspace">
              <section className="control-panel">
                <div className="panel-title"><div><span className="mini-icon"><FileSpreadsheet size={17} /></span><div><h2>Fuente de datos</h2><p>Primera hoja del Excel</p></div></div><span className="tiny-state">LOCAL</span></div>
                <input ref={reportInputRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => onReportFile(event.target.files?.[0])} />
                <button className="upload-box compact" onClick={() => reportInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onReportFile(event.dataTransfer.files[0]); }}>
                  <span className="upload-icon"><Upload size={20} /></span>
                  <span><b>{reportLoading ? "Leyendo archivo…" : "Cambiar archivo Excel"}</b><small>{reportFileName}</small></span>
                </button>
                {reportError && <div className="inline-error">{reportError}</div>}

                <div className="control-divider" />
                <label className="field-group">
                  <FieldLabel>Jugador</FieldLabel>
                  <span className="select-wrap"><Search size={16} /><select value={selectedPlayer} onChange={(event) => setSelectedPlayer(Number(event.target.value))}>{players.map((player) => <option key={`${player.player}-${player.index}`} value={player.index}>{player.player}{player.team ? ` · ${player.team}` : ""}</option>)}</select><ChevronDown size={16} /></span>
                </label>
                <div className="two-fields">
                  <label className="field-group"><FieldLabel>Cohorte</FieldLabel><span className="select-wrap simple"><select value={cohort} onChange={(event) => setCohort(event.target.value)}><option value="AUTO">Automática</option><option value="GK">Porteros</option><option value="CB">Centrales</option><option value="FB">Laterales</option><option value="MID">Mediocampistas</option><option value="WING">Extremos</option><option value="AM">Mediapuntas</option><option value="CF">Delanteros</option></select><ChevronDown size={16} /></span></label>
                  <label className="field-group"><FieldLabel>Mín. minutos</FieldLabel><input className="text-input" type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(Number(event.target.value))} /></label>
                </div>
                <div className="cohort-note"><Sparkles size={15} /><p>Los percentiles comparan al jugador con perfiles de la misma posición que superen el mínimo de minutos.</p></div>
                <div className="data-summary"><div><span>Filas</span><b>{numberFormat(reportRows.length)}</b></div><div><span>Métricas</span><b>{numberFormat(reportHeaders.length)}</b></div><div><span>Cohorte</span><b>{report?.cohortSize ?? 0}</b></div></div>
              </section>

              <section className="report-preview-wrap">
                <div className="preview-toolbar"><div><span className="live-dot" /> Vista del informe</div><span>Se actualiza automáticamente</span></div>
                {report ? (
                  <article className="scout-report">
                    <header className="report-hero">
                      <div className="player-monogram">{report.player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</div>
                      <div className="player-title"><span>{report.team}</span><h2>{report.player}</h2><div><b>{report.position}</b><i />{report.passport}</div></div>
                      <div className="report-score"><small>ÍNDICE GLOBAL</small><strong>{report.score}</strong><span>/ 100</span></div>
                    </header>
                    <div className="report-meta">
                      <div><span>Edad</span><b>{report.age}</b></div><div><span>Pie</span><b>{report.foot}</b></div><div><span>Valor mercado</span><b>{report.marketValue === "—" ? "—" : formatCell(report.marketValue, 0)}</b></div><div><span>Contrato</span><b>{report.contract}</b></div>
                    </div>
                    <div className="season-stats">
                      <div className="season-label"><span>TEMPORADA ANALIZADA</span><b>{reportFileName.replace(/\.(xlsx|xls)$/i, "")}</b><small>Datos por 90 min · cohorte {report.cohort}</small></div>
                      <div className="stat"><strong>{numberFormat(report.matches)}</strong><span>Partidos</span></div>
                      <div className="stat"><strong>{numberFormat(report.minutes)}</strong><span>Minutos</span></div>
                      <div className="stat accent"><strong>{numberFormat(report.goals)}</strong><span>Goles</span></div>
                      <div className="stat teal"><strong>{numberFormat(report.assists)}</strong><span>Asist.</span></div>
                    </div>
                    <div className="report-analysis">
                      <div className="radar-section">
                        <div className="section-heading"><div><span>PERFIL DE RENDIMIENTO</span><h3>Percentiles por métrica</h3></div><ScoreBadge score={report.score} /></div>
                        {report.metrics.length ? <PizzaRadar metrics={report.metrics} score={report.score} /> : <div className="empty-radar"><BarChart3 size={34} /><b>No encontramos las métricas de esta cohorte</b><span>Prueba otra cohorte o revisa los encabezados del Excel.</span></div>}
                        <div className="radar-legend"><span><i className="legend-red" />Finalización / defensa</span><span><i className="legend-gold" />Creación / progresión</span><span><i className="legend-teal" />Desequilibrio / pase</span></div>
                      </div>
                      <aside className="insight-section">
                        <span className="insight-kicker">LECTURA RÁPIDA</span><h3>Qué dicen los datos</h3><p>{report.reading}</p>
                        <div className="traits-list"><span>Señales destacadas</span>{[...report.metrics].sort((a, b) => b.percentile - a.percentile).slice(0, 4).map((metric) => <div key={metric.key}><span>{metric.label}</span><b>P{metric.percentile}</b><i><em style={{ width: `${metric.percentile}%` }} /></i></div>)}</div>
                        <div className="scout-note"><ShieldCheck size={16} /><p>La lectura estadística orienta el vídeo; no sustituye el contexto táctico ni la observación.</p></div>
                      </aside>
                    </div>
                    <footer className="report-footer"><span>FOS SCOUT LAB · REPORTE CONFIDENCIAL</span><span>{new Date().toLocaleDateString("es-CL")}</span></footer>
                  </article>
                ) : <div className="empty-preview">Selecciona un jugador para generar el informe.</div>}
              </section>
            </div>
          </div>
        ) : (
          <div className="page-content seasons-page">
            <section className="page-heading">
              <div><span className="kicker">Consolidador multi-temporada</span><h1>Una sola lectura para varias temporadas.</h1><p>Combina dos o más exportaciones con las ponderaciones correctas y descarga un Excel limpio.</p></div>
              <div className="rule-pills"><span>Σ Minutos y partidos</span><span>Ø Totales</span><span>⚖ /90 y porcentajes</span></div>
            </section>

            <div className="merge-grid">
              <section className="merge-builder card">
                <div className="card-header"><div><span className="mini-icon green"><Files size={18} /></span><div><h2>Archivos por temporada</h2><p>Cada archivo debe representar una temporada.</p></div></div><span className="step-chip">PASO 1</span></div>
                <input ref={seasonsInputRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={(event) => event.target.files && onSeasonFiles(event.target.files)} />
                <button className="upload-box large" onClick={() => seasonsInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onSeasonFiles(event.dataTransfer.files); }}>
                  <span className="upload-icon large-icon"><FolderOpen size={25} /></span><span><b>{mergeLoading ? "Leyendo temporadas…" : "Arrastra aquí tus archivos Excel"}</b><small>o haz clic para seleccionar 2 o más archivos .xlsx</small></span><span className="browse-link">Explorar</span>
                </button>
                {seasonFiles.length > 0 && <div className="file-stack">{seasonFiles.map((file) => <div className="file-row" key={file.fileName}><span className="excel-icon"><FileSpreadsheet size={18} /></span><div><b>{file.fileName}</b><small>{file.rows.length} jugadores · {file.headers.length} columnas</small></div><span className={file.season ? "year-chip" : "year-chip warning"}>{file.season || "Sin año"}</span><button onClick={() => { setSeasonFiles((current) => current.filter((item) => item.fileName !== file.fileName)); setMergeResult(null); }} aria-label={`Quitar ${file.fileName}`}><X size={16} /></button></div>)}</div>}
                {mergeError && <div className="inline-error merge-error">{mergeError}</div>}
                <div className="merge-actions"><button className="button ghost" onClick={() => { setSeasonFiles([]); setMergeResult(null); setMergeError(""); }} disabled={!seasonFiles.length}>Limpiar</button><button className="button primary wide" onClick={runMerge} disabled={seasonFiles.length < 2}><Merge size={17} /> Unir {seasonFiles.length || ""} temporadas</button></div>
              </section>

              <aside className="rules-card card">
                <div className="card-header"><div><span className="mini-icon gold"><Sparkles size={18} /></span><div><h2>Reglas de consolidación</h2><p>Basadas en tu modelo de cálculo.</p></div></div></div>
                <div className="rules-list"><div><span className="rule-symbol sum">Σ</span><p><b>Partidos y minutos</b><small>Se suman entre todas las temporadas.</small></p></div><div><span className="rule-symbol avg">Ø</span><p><b>Métricas totales</b><small>Promedio por temporada, sin inflar el volumen.</small></p></div><div><span className="rule-symbol weight">W</span><p><b>Métricas por 90</b><small>Promedio ponderado por minutos jugados.</small></p></div><div><span className="rule-symbol pct">%</span><p><b>Porcentajes</b><small>Ponderados por intentos cuando existen; si no, por minutos.</small></p></div><div><span className="rule-symbol latest">↗</span><p><b>Equipo y edad</b><small>Se conserva el dato de la temporada más reciente.</small></p></div></div>
              </aside>
            </div>

            <section className={`result-card card ${mergeResult ? "has-result" : ""}`}>
              <div className="card-header"><div><span className="mini-icon blue"><BarChart3 size={18} /></span><div><h2>Resultado consolidado</h2><p>{mergeResult ? `${mergeResult.rows.length} jugadores listos para descargar.` : "Aquí verás una muestra antes de descargar."}</p></div></div>{mergeResult && <button className="button primary" onClick={downloadMerge}><ArrowDownToLine size={17} /> Descargar Excel</button>}</div>
              {mergeResult ? <><div className="result-kpis"><div><span>Jugadores únicos</span><b>{numberFormat(mergeResult.rows.length)}</b></div><div><span>Temporadas</span><b>{seasonFiles.length}</b></div><div><span>Columnas finales</span><b>{mergeResult.headers.length}</b></div><div><span>Estado</span><b className="ready"><Check size={15} /> Listo</b></div></div>{mergeResult.warnings.map((warning) => <div className="inline-error" key={warning}>{warning}</div>)}<div className="table-scroll"><table><thead><tr>{["Player", "Seasons", "Team", "Position", mergeResult.matchesColumn, mergeResult.minutesColumn].filter((header) => mergeResult.headers.includes(header)).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{mergeResult.rows.slice(0, 8).map((row, index) => <tr key={`${row.Player}-${index}`}>{["Player", "Seasons", "Team", "Position", mergeResult.matchesColumn, mergeResult.minutesColumn].filter((header) => mergeResult.headers.includes(header)).map((header) => <td key={header}>{formatCell(row[header], header === mergeResult.minutesColumn || header === mergeResult.matchesColumn ? 0 : 2)}</td>)}</tr>)}</tbody></table></div><div className="table-footer"><span>Mostrando {Math.min(8, mergeResult.rows.length)} de {mergeResult.rows.length} jugadores</span><span>El archivo descargado incluye las {mergeResult.headers.length} columnas.</span></div></> : <div className="result-empty"><span className="empty-merge-icon"><Merge size={30} /></span><b>Aún no hay un resultado</b><p>Carga al menos dos temporadas y ejecuta la consolidación.</p><div><span>1</span><i /><span>2</span><i /><span><Check size={13} /></span></div></div>}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
