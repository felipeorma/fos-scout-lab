"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, BarChart3, ImageIcon, RotateCcw, Search, Sparkles } from "./Icons";
import {
  buildSimilaritySearch,
  similarityOptions,
  type SimilarityFilters,
  type SimilarityMetricComparison,
  type SimilarityPlayer,
} from "@/lib/similarity";
import type { DataRow, PlayerReport } from "@/lib/scouting";
import type { PlayerPosition } from "@/lib/positions";

type TargetOption = { index: number; player: string; team: string };

type SimilarityStudioProps = {
  rows: DataRow[];
  selectedIndex: number;
  sourceName: string;
  targets: TargetOption[];
  onSelectTarget: (index: number) => void;
  onOpenReports: () => void;
};

const GROUP_COLORS = ["#e95b3f", "#d7a62c", "#43a8a0"];

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length > 2 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

function comparisonImage(target: PlayerReport, candidate: SimilarityPlayer, sourceName: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const background = ctx.createLinearGradient(0, 0, 1600, 1000);
  background.addColorStop(0, "#08101c");
  background.addColorStop(0.55, "#10172a");
  background.addColorStop(1, "#17132a");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1600, 1000);
  const glow = ctx.createRadialGradient(800, 100, 10, 800, 100, 720);
  glow.addColorStop(0, "rgba(79,124,255,.24)");
  glow.addColorStop(1, "rgba(79,124,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1600, 720);

  ctx.fillStyle = "#6f92ff";
  ctx.font = "800 24px Arial";
  ctx.fillText("FOS SCOUT LAB", 92, 74);
  ctx.fillStyle = "#71809a";
  ctx.font = "700 16px Arial";
  ctx.fillText("PLAYER SIMILARITY · VECTOR CONTEXTUAL LOCAL", 92, 104);
  ctx.textAlign = "right";
  ctx.fillText(fitText(ctx, sourceName.toUpperCase(), 430), 1508, 88);
  ctx.textAlign = "left";

  const playerCard = (x: number, player: { name: string; team: string; position: string; age: number | null; passport: string }, label: string) => {
    drawRoundedRect(ctx, x, 150, 570, 150, 22);
    ctx.fillStyle = "rgba(255,255,255,.045)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#7485a3";
    ctx.font = "700 15px Arial";
    ctx.fillText(label, x + 28, 184);
    ctx.fillStyle = "#f0f4fc";
    ctx.font = "800 37px Arial";
    ctx.fillText(fitText(ctx, player.name.toUpperCase(), 500), x + 28, 231);
    ctx.fillStyle = "#9aa9c2";
    ctx.font = "600 18px Arial";
    ctx.fillText(fitText(ctx, `${player.team} · ${player.position}`, 500), x + 28, 265);
    ctx.fillStyle = "#6f7f99";
    ctx.font = "600 14px Arial";
    ctx.fillText(`${player.age ?? "—"} AÑOS · ${player.passport}`, x + 28, 287);
  };

  playerCard(92, { name: target.player, team: target.team, position: target.position, age: Number(target.age) || null, passport: target.passport }, "JUGADOR OBJETIVO");
  playerCard(938, candidate, "JUGADOR MÁS SIMILAR");

  ctx.beginPath();
  ctx.arc(800, 225, 82, 0, Math.PI * 2);
  ctx.fillStyle = "#0a1220";
  ctx.fill();
  ctx.strokeStyle = "#6f92ff";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 52px Arial";
  ctx.fillText(`${candidate.similarity}%`, 800, 224);
  ctx.fillStyle = "#8fa2c1";
  ctx.font = "700 13px Arial";
  ctx.fillText("SIMILITUD", 800, 254);
  ctx.textAlign = "left";

  ctx.fillStyle = "#6f7f99";
  ctx.font = "700 14px Arial";
  ctx.fillText("MÉTRICA", 92, 356);
  ctx.fillText(target.player.toUpperCase(), 418, 356);
  ctx.fillText(candidate.name.toUpperCase(), 1010, 356);

  candidate.metrics.slice(0, 9).forEach((metric, index) => {
    const y = 400 + index * 61;
    const color = GROUP_COLORS[metric.group] ?? GROUP_COLORS[0];
    ctx.strokeStyle = "rgba(255,255,255,.065)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(92, y + 32);
    ctx.lineTo(1508, y + 32);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(103, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dfe6f4";
    ctx.font = "700 18px Arial";
    ctx.fillText(fitText(ctx, metric.label, 260), 122, y + 6);

    ctx.fillStyle = "rgba(255,255,255,.07)";
    drawRoundedRect(ctx, 418, y - 9, 430, 18, 9);
    ctx.fill();
    ctx.fillStyle = color;
    drawRoundedRect(ctx, 418, y - 9, 430 * metric.targetPercentile / 100, 18, 9);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 18px Arial";
    ctx.fillText(`P${metric.targetPercentile}`, 860, y + 6);

    ctx.fillStyle = "rgba(255,255,255,.07)";
    drawRoundedRect(ctx, 1010, y - 9, 430, 18, 9);
    ctx.fill();
    ctx.fillStyle = color;
    drawRoundedRect(ctx, 1010, y - 9, 430 * metric.candidatePercentile / 100, 18, 9);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`P${metric.candidatePercentile}`, 1452, y + 6);
  });

  ctx.fillStyle = "#73829c";
  ctx.font = "600 14px Arial";
  ctx.fillText(`Cobertura de métricas ${candidate.coverage}% · similitud métrica ${candidate.metricSimilarity}% · contexto ${candidate.contextSimilarity}%`, 92, 962);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6f92ff";
  ctx.font = "700 14px Arial";
  ctx.fillText("FOS SCOUT LAB · REPORTE CONFIDENCIAL", 1508, 962);
  return canvas.toDataURL("image/png");
}

export function SimilarityStudio({ rows, selectedIndex, sourceName, targets, onSelectTarget, onOpenReports }: SimilarityStudioProps) {
  const [query, setQuery] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [minimumMinutes, setMinimumMinutes] = useState("500");
  const [passport, setPassport] = useState("");
  const [position, setPosition] = useState("");
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const options = useMemo(() => similarityOptions(rows), [rows]);
  const filters = useMemo<SimilarityFilters>(() => ({
    query,
    ageMin: optionalNumber(ageMin),
    ageMax: optionalNumber(ageMax),
    minimumMinutes: Math.max(0, optionalNumber(minimumMinutes) ?? 0),
    passport,
    position,
  }), [ageMax, ageMin, minimumMinutes, passport, position, query]);
  const search = useMemo(() => buildSimilaritySearch(rows, selectedIndex, filters), [filters, rows, selectedIndex]);
  const candidates = search?.candidates ?? [];
  const selectedCandidate = candidates.find((candidate) => candidate.index === selectedCandidateIndex) ?? candidates[0] ?? null;

  function resetFilters() {
    setQuery("");
    setAgeMin("");
    setAgeMax("");
    setMinimumMinutes("500");
    setPassport("");
    setPosition("");
  }

  function createImage() {
    if (!search?.target || !selectedCandidate) return "";
    return comparisonImage(search.target, selectedCandidate, sourceName);
  }

  function downloadComparison() {
    const image = createImage();
    if (!image || !selectedCandidate || !search?.target) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = `similitud-${search.target.player}-${selectedCandidate.name}`.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
    link.click();
    setExportStatus("✓ Comparación exportada como PNG.");
  }

  function addComparisonToReport() {
    const image = createImage();
    if (!image || !selectedCandidate || !search?.target) return;
    try {
      window.localStorage.setItem("fos-scout-similarity-comparison-v1", JSON.stringify({
        image,
        title: `Similitud · ${search.target.player} vs. ${selectedCandidate.name}`,
        createdAt: Date.now(),
      }));
      setExportStatus("✓ Comparación preparada para la Página 2.");
      onOpenReports();
    } catch {
      setExportStatus("No se pudo guardar la imagen. Descárgala como PNG y súbela manualmente.");
    }
  }

  return <div className="page-content similarity-page">
    <section className="page-heading">
      <div><span className="kicker">Player similarity lab</span><h1>Encuentra el perfil <span>más parecido.</span></h1><p>Explora la base completa con filtros contextuales y compara la forma estadística de cada jugador.</p><div className="heading-chips"><span>Vector contextual</span><span>Similitud coseno</span><span>Exportación PNG</span></div></div>
      <div className="heading-actions"><button className="button secondary" onClick={onOpenReports}><BarChart3 size={16} /> Volver al reporte</button></div>
    </section>

    {!rows.length || !search ? <section className="dataset-onboarding similarity-empty"><span className="dataset-step">SECCIÓN DE SIMILITUD</span><span className="dataset-icon"><Search size={30} /></span><h2>Primero carga una base de datos</h2><p>La búsqueda compara a todos los jugadores de la base activa. Puedes usar una liga, una temporada o una combinación.</p><button className="button primary" onClick={onOpenReports}>Ir a cargar datos</button></section> : <>
      <section className="similarity-target-bar">
        <div className="similarity-target-copy"><span>JUGADOR OBJETIVO</span><b>{search.target.player}</b><small>{search.target.team} · {search.target.position} · {search.target.age} años</small></div>
        <label><span>Cambiar jugador</span><select value={selectedIndex} onChange={(event) => { setSelectedCandidateIndex(null); onSelectTarget(Number(event.target.value)); }}>{targets.map((target) => <option key={`${target.index}-${target.player}`} value={target.index}>{target.player} · {target.team}</option>)}</select></label>
        <div className="similarity-model-badge"><Sparkles size={16} /><span><b>MODELO LOCAL</b><small>Métricas normalizadas + edad + posición</small></span></div>
      </section>

      <div className="similarity-workspace">
        <aside className="similarity-filter-panel">
          <div className="similarity-panel-title"><div><Search size={17} /><span><b>Red de filtros</b><small>{candidates.length} coincidencias</small></span></div><button onClick={resetFilters} aria-label="Restablecer filtros"><RotateCcw size={14} /></button></div>
          <label><span>Buscar jugador o club</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escribe un nombre…" /></label>
          <div className="similarity-age-fields"><label><span>Edad mínima</span><input type="number" min="14" max="50" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} placeholder="Todas" /></label><label><span>Edad máxima</span><input type="number" min="14" max="50" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} placeholder="Todas" /></label></div>
          <label><span>Mínimo de minutos</span><input type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(event.target.value)} /></label>
          <label><span>Pasaporte</span><select value={passport} onChange={(event) => setPassport(event.target.value)}><option value="">Todos</option>{options.passports.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Rol · incluye posiciones secundarias</span><select value={position} onChange={(event) => setPosition(event.target.value)}><option value="">Todos los roles</option>{options.positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="similarity-method-note"><b>Embedding contextual v1</b><p>Compara la forma de los percentiles y agrega contexto de edad y rol. Transformers, vídeo y redes de pases pueden conectarse después como capas multimodales.</p></div>
        </aside>

        <main className="similarity-results">
          <section className="similarity-ranking-card">
            <div className="similarity-results-head"><div><span>LISTADO DE JUGADORES</span><h2>Ranking de similitud</h2></div><small>Ordenado de mayor a menor coincidencia</small></div>
            {candidates.length ? <div className="similarity-table-wrap"><table className="similarity-table"><thead><tr><th>#</th><th>Jugador</th><th>Posiciones</th><th>Edad</th><th>Minutos</th><th>Pasaporte</th><th>Similitud</th><th /></tr></thead><tbody>{candidates.slice(0, 150).map((candidate, index) => <tr key={candidate.index} className={selectedCandidate?.index === candidate.index ? "selected" : ""}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{candidate.name}</b><small>{candidate.team}</small></td><td><PositionRoles positions={candidate.positions} /></td><td>{candidate.age ?? "—"}</td><td>{Math.round(candidate.minutes).toLocaleString("es-CL")}</td><td>{candidate.passport}</td><td><span className="similarity-score-pill">{candidate.similarity}%</span></td><td><button onClick={() => setSelectedCandidateIndex(candidate.index)}>Comparar</button></td></tr>)}</tbody></table></div> : <div className="similarity-no-results"><Search size={24} /><b>No hay jugadores con estos filtros</b><span>Reduce los requisitos de edad, minutos, pasaporte o posición.</span></div>}
          </section>

          {selectedCandidate && <section className="similarity-comparison-card">
            <div className="comparison-heading"><div><span>COMPARACIÓN SELECCIONADA</span><h2>{search.target.player} <i>vs.</i> {selectedCandidate.name}</h2><small>{selectedCandidate.team} · {selectedCandidate.position} · cobertura {selectedCandidate.coverage}%</small></div><strong>{selectedCandidate.similarity}<small>%</small><span>similitud</span></strong></div>
            <div className="comparison-summary"><span>Métricas <b>{selectedCandidate.metricSimilarity}%</b></span><span>Contexto <b>{selectedCandidate.contextSimilarity}%</b></span><span>Minutos <b>{Math.round(selectedCandidate.minutes).toLocaleString("es-CL")}</b></span></div>
            <div className="metric-comparison-list">{selectedCandidate.metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} targetName={search.target.player} candidateName={selectedCandidate.name} />)}</div>
            <div className="comparison-actions"><button className="button secondary" onClick={downloadComparison}><ArrowDownToLine size={16} /> Descargar PNG</button><button className="button primary" onClick={addComparisonToReport}><ImageIcon size={16} /> Agregar a Página 2</button></div>
            {exportStatus && <p className="similarity-export-status" aria-live="polite">{exportStatus}</p>}
          </section>}
        </main>
      </div>
    </>}
  </div>;
}

function PositionRoles({ positions }: { positions: PlayerPosition[] }) {
  if (!positions.length) return <span>—</span>;
  return <div className="position-role-list">{positions.map((position, index) => <span key={`${position.code}-${index}`}><em>{index === 0 ? "1ª" : `${index + 1}ª`}</em><b>{position.role}</b><small>{position.code}</small></span>)}</div>;
}

function MetricComparison({ metric, targetName, candidateName }: { metric: SimilarityMetricComparison; targetName: string; candidateName: string }) {
  const color = GROUP_COLORS[metric.group] ?? GROUP_COLORS[0];
  return <div className="metric-comparison-row" style={{ "--metric-color": color } as React.CSSProperties}>
    <div><span>{metric.label}</span><small>Δ {metric.difference} pts</small></div>
    <div className="metric-player-bar" aria-label={`${targetName}: percentil ${metric.targetPercentile}`}><span>{targetName}</span><b>P{metric.targetPercentile}</b><i><em style={{ width: `${metric.targetPercentile}%` }} /></i></div>
    <div className="metric-player-bar" aria-label={`${candidateName}: percentil ${metric.candidatePercentile}`}><span>{candidateName}</span><b>P{metric.candidatePercentile}</b><i><em style={{ width: `${metric.candidatePercentile}%` }} /></i></div>
  </div>;
}
