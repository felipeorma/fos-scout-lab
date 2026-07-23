"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownToLine, BarChart3, ImageIcon, RotateCcw, Search, Sparkles } from "./Icons";
import { ComparisonRadar } from "./ComparisonRadar";
import { reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  buildSimilaritySearch,
  similarityOptions,
  type SimilarityFilters,
  type SimilarityMetricComparison,
  type SimilarityPlayer,
} from "@/lib/similarity";
import type { DataRow, PlayerReport } from "@/lib/scouting";
import { formatPlayerPositions, type PlayerPosition } from "@/lib/positions";
import { createEmptyTransfermarktProfile, type TransfermarktProfile } from "@/lib/transfermarkt";

type TargetOption = { index: number; player: string; team: string };
type ProfileSide = "target" | "candidate";

type SimilarityStudioProps = {
  rows: DataRow[];
  selectedIndex: number;
  sourceName: string;
  targets: TargetOption[];
  theme: ReportTheme;
  targetProfile: TransfermarktProfile;
  recipientName: string;
  recipientLogoUrl: string;
  onSelectTarget: (index: number) => void;
  onTargetProfileChange: (profile: TransfermarktProfile) => void;
  onRecipientNameChange: (value: string) => void;
  onRecipientLogoChange: (value: string) => void;
  onOpenReports: () => void;
};

const GROUP_COLORS = ["#e95b3f", "#d7a62c", "#43a8a0"];

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFileName(value: string) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function profileStorageKey(player: string) {
  return `fos-transfermarkt:${player.toLocaleLowerCase("es")}`;
}

function candidateProfileSeed(candidate: SimilarityPlayer | null) {
  return createEmptyTransfermarktProfile({
    name: candidate?.name ?? "",
    club: candidate?.team ?? "",
    position: candidate?.position ?? "",
    age: candidate?.age === null || candidate?.age === undefined ? "" : String(candidate.age),
    citizenship: candidate?.passport === "—" ? "" : candidate?.passport ?? "",
  });
}

function loadStoredProfile(candidate: SimilarityPlayer) {
  const base = candidateProfileSeed(candidate);
  try {
    const saved = window.localStorage.getItem(profileStorageKey(candidate.name));
    return saved ? { ...base, ...JSON.parse(saved) } as TransfermarktProfile : base;
  } catch {
    return base;
  }
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

function canvasImageSource(src: string) {
  return src.startsWith("data:image/") ? src : `/api/image?url=${encodeURIComponent(src)}`;
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = canvasImageSource(src);
  });
}

function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function radarPoint(index: number, total: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle };
}

function drawRadar(ctx: CanvasRenderingContext2D, metrics: SimilarityMetricComparison[], theme: ReportTheme, cx: number, cy: number, radius: number) {
  if (metrics.length < 3) return;
  [0.25, 0.5, 0.75, 1].forEach((level) => {
    ctx.beginPath();
    metrics.forEach((_, index) => {
      const value = radarPoint(index, metrics.length, radius * level, cx, cy);
      if (index === 0) ctx.moveTo(value.x, value.y); else ctx.lineTo(value.x, value.y);
    });
    ctx.closePath();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  metrics.forEach((_, index) => {
    const value = radarPoint(index, metrics.length, radius, cx, cy);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(value.x, value.y);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  const area = (field: "targetPercentile" | "candidatePercentile", stroke: string, fill: string) => {
    ctx.beginPath();
    metrics.forEach((metric, index) => {
      const value = radarPoint(index, metrics.length, radius * metric[field] / 100, cx, cy);
      if (index === 0) ctx.moveTo(value.x, value.y); else ctx.lineTo(value.x, value.y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 5;
    ctx.stroke();
  };
  area("targetPercentile", theme.accent, `${theme.accent}33`);
  area("candidatePercentile", theme.dark, `${theme.dark}24`);
  metrics.forEach((metric, index) => {
    const label = radarPoint(index, metrics.length, radius + 42, cx, cy);
    ctx.fillStyle = theme.ink;
    ctx.font = "700 14px Arial";
    ctx.textAlign = Math.cos(label.angle) > .2 ? "left" : Math.cos(label.angle) < -.2 ? "right" : "center";
    ctx.fillText(fitText(ctx, metric.label.toUpperCase(), 160), label.x, label.y);
    ctx.fillStyle = theme.muted;
    ctx.font = "700 12px Arial";
    ctx.fillText(`P${metric.targetPercentile} / P${metric.candidatePercentile}`, label.x, label.y + 17);
  });
}

async function comparisonImage(target: PlayerReport, candidate: SimilarityPlayer, sourceName: string, theme: ReportTheme, targetProfile: TransfermarktProfile, candidateProfile: TransfermarktProfile, recipientName: string, recipientLogoUrl: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const [targetImage, targetClub, candidateImage, candidateClub, recipientLogo] = await Promise.all([
    loadCanvasImage(targetProfile.playerImage),
    loadCanvasImage(targetProfile.clubLogo),
    loadCanvasImage(candidateProfile.playerImage),
    loadCanvasImage(candidateProfile.clubLogo),
    loadCanvasImage(recipientLogoUrl),
  ]);

  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = theme.dark;
  ctx.fillRect(0, 0, 1600, 154);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 150, 1600, 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 30px Arial";
  ctx.fillText("FOS SCOUT LAB", 78, 65);
  ctx.font = "700 16px Arial";
  ctx.fillStyle = "rgba(255,255,255,.68)";
  ctx.fillText("COMPARACIÓN DE JUGADORES · PERCENTILES POSICIONALES", 78, 99);
  ctx.textAlign = "right";
  ctx.fillText(fitText(ctx, sourceName.toUpperCase(), 520), 1522, 82);
  ctx.textAlign = "left";

  const playerCard = (x: number, report: { name: string; team: string; position: string; age: string; passport: string }, profile: TransfermarktProfile, image: HTMLImageElement | null, club: HTMLImageElement | null, label: string) => {
    drawRoundedRect(ctx, x, 192, 350, 470, 18);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.dark;
    ctx.fillRect(x, 192, 350, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 14px Arial";
    ctx.fillText(label, x + 22, 222);
    if (image) drawContain(ctx, image, x + 55, 252, 240, 230);
    else {
      ctx.fillStyle = theme.line;
      ctx.beginPath();
      ctx.arc(x + 175, 357, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.muted;
      ctx.font = "800 56px Arial";
      ctx.textAlign = "center";
      ctx.fillText(report.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""), x + 175, 375);
      ctx.textAlign = "left";
    }
    if (club) drawContain(ctx, club, x + 22, 493, 52, 52);
    ctx.fillStyle = theme.ink;
    ctx.font = "800 25px Arial";
    ctx.fillText(fitText(ctx, report.name.toUpperCase(), 250), x + 86, 515);
    ctx.fillStyle = theme.muted;
    ctx.font = "700 14px Arial";
    ctx.fillText(fitText(ctx, profile.club || report.team, 240), x + 86, 539);
    ctx.fillStyle = theme.ink;
    ctx.font = "700 14px Arial";
    ctx.fillText(fitText(ctx, formatPlayerPositions(profile.position || report.position), 306), x + 22, 582);
    ctx.fillStyle = theme.muted;
    ctx.font = "600 13px Arial";
    ctx.fillText(`${profile.age || report.age || "—"} AÑOS · ${profile.citizenship || report.passport}`, x + 22, 610);
    ctx.fillStyle = theme.accent;
    ctx.font = "800 22px Arial";
    ctx.fillText(profile.marketValue || "VALOR N/D", x + 22, 642);
  };

  playerCard(70, { name: target.player, team: target.team, position: target.position, age: target.age, passport: target.passport }, targetProfile, targetImage, targetClub, "JUGADOR OBJETIVO");
  playerCard(1180, { name: candidate.name, team: candidate.team, position: candidate.position, age: candidate.age === null ? "—" : String(candidate.age), passport: candidate.passport }, candidateProfile, candidateImage, candidateClub, "JUGADOR COMPARABLE");
  drawRadar(ctx, candidate.metrics, theme, 800, 426, 210);

  ctx.textAlign = "center";
  ctx.fillStyle = theme.accent;
  ctx.font = "800 54px Arial";
  ctx.fillText(`${candidate.similarity}%`, 800, 708);
  ctx.fillStyle = theme.muted;
  ctx.font = "700 13px Arial";
  ctx.fillText("SIMILITUD GLOBAL", 800, 731);
  ctx.textAlign = "left";

  candidate.metrics.slice(0, 7).forEach((metric, index) => {
    const y = 793 + index * 39;
    const color = GROUP_COLORS[metric.group] ?? GROUP_COLORS[0];
    ctx.fillStyle = theme.ink;
    ctx.font = "700 13px Arial";
    ctx.fillText(fitText(ctx, metric.label.toUpperCase(), 240), 360, y + 5);
    ctx.fillStyle = theme.line;
    drawRoundedRect(ctx, 620, y - 8, 300, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    drawRoundedRect(ctx, 620, y - 8, 300 * metric.targetPercentile / 100, 14, 7);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.font = "800 13px Arial";
    ctx.fillText(`P${metric.targetPercentile}`, 930, y + 4);
    ctx.fillStyle = theme.line;
    drawRoundedRect(ctx, 1010, y - 8, 300, 14, 7);
    ctx.fill();
    ctx.fillStyle = color;
    drawRoundedRect(ctx, 1010, y - 8, 300 * metric.candidatePercentile / 100, 14, 7);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.fillText(`P${metric.candidatePercentile}`, 1320, y + 4);
  });

  ctx.strokeStyle = theme.line;
  ctx.beginPath();
  ctx.moveTo(70, 1100);
  ctx.lineTo(1530, 1100);
  ctx.stroke();
  ctx.fillStyle = theme.muted;
  ctx.font = "700 11px Arial";
  ctx.fillText("ELABORADO POR", 70, 1134);
  ctx.fillStyle = theme.ink;
  ctx.font = "800 19px Arial";
  ctx.fillText("FELIPE ORMAZABAL", 70, 1161);
  ctx.fillStyle = theme.accent;
  ctx.font = "700 11px Arial";
  ctx.fillText("SCOUTING REPORT", 70, 1180);
  if (recipientLogo) drawContain(ctx, recipientLogo, 1170, 1118, 62, 62);
  ctx.fillStyle = theme.muted;
  ctx.font = "700 11px Arial";
  ctx.fillText("REPORTE GENERADO PARA", 1250, 1137);
  ctx.fillStyle = theme.ink;
  ctx.font = "800 18px Arial";
  ctx.fillText(fitText(ctx, recipientName.toUpperCase(), 280), 1250, 1166);
  return canvas.toDataURL("image/png");
}

export function SimilarityStudio({ rows, selectedIndex, sourceName, targets, theme, targetProfile, recipientName, recipientLogoUrl, onSelectTarget, onTargetProfileChange, onRecipientNameChange, onRecipientLogoChange, onOpenReports }: SimilarityStudioProps) {
  const [query, setQuery] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [minimumMinutes, setMinimumMinutes] = useState("500");
  const [passport, setPassport] = useState("");
  const [position, setPosition] = useState("");
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [candidateProfileState, setCandidateProfileState] = useState<TransfermarktProfile>(() => createEmptyTransfermarktProfile());
  const [candidateProfileKey, setCandidateProfileKey] = useState("");
  const [profileBusy, setProfileBusy] = useState<ProfileSide | null>(null);
  const [profileStatus, setProfileStatus] = useState<Record<ProfileSide, string>>({ target: "", candidate: "" });
  const [exportBusy, setExportBusy] = useState(false);
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
  const activeCandidateKey = selectedCandidate ? profileStorageKey(selectedCandidate.name) : "";
  const candidateProfile = candidateProfileKey === activeCandidateKey ? candidateProfileState : candidateProfileSeed(selectedCandidate);
  const reportRecipient = recipientName.trim() || "Club destinatario";
  const recipientLogoReady = /^(https?:\/\/|data:image\/)/i.test(recipientLogoUrl.trim());

  function chooseCandidate(candidate: SimilarityPlayer) {
    setSelectedCandidateIndex(candidate.index);
    setCandidateProfileState(loadStoredProfile(candidate));
    setCandidateProfileKey(profileStorageKey(candidate.name));
    setProfileStatus((current) => ({ ...current, candidate: "" }));
  }

  function resetFilters() {
    setQuery("");
    setAgeMin("");
    setAgeMax("");
    setMinimumMinutes("500");
    setPassport("");
    setPosition("");
  }

  async function extractProfile(side: ProfileSide, url: string) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName) return;
    setProfileBusy(side);
    setProfileStatus((status) => ({ ...status, [side]: "Leyendo datos e imágenes…" }));
    try {
      const response = await fetch("/api/transfermarkt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const result = await response.json() as Partial<TransfermarktProfile> & { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo leer el perfil.");
      const populated = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== "" && value !== undefined));
      const next = { ...current, ...populated, sourceUrl: url } as TransfermarktProfile;
      if (side === "target") onTargetProfileChange(next);
      else {
        setCandidateProfileState(next);
        setCandidateProfileKey(profileStorageKey(playerName));
      }
      try { window.localStorage.setItem(profileStorageKey(playerName), JSON.stringify(next)); } catch { /* La comparación continúa aunque no haya persistencia. */ }
      setProfileStatus((status) => ({ ...status, [side]: "✓ Foto, escudo y datos cargados." }));
    } catch (error) {
      setProfileStatus((status) => ({ ...status, [side]: error instanceof Error ? error.message : "No se pudo extraer el perfil." }));
    } finally {
      setProfileBusy(null);
    }
  }

  async function downloadAsset(src: string, name: string) {
    if (!src) return;
    try {
      const response = await fetch(canvasImageSource(src));
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFileName(name)}.${blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportStatus("No se pudo descargar esa imagen. Revisa el enlace de Transfermarkt.");
    }
  }

  async function createImage() {
    if (!search?.target || !selectedCandidate) return "";
    return comparisonImage(search.target, selectedCandidate, sourceName, theme, targetProfile, candidateProfile, reportRecipient, recipientLogoUrl.trim());
  }

  async function downloadComparison() {
    setExportBusy(true);
    try {
      const image = await createImage();
      if (!image || !selectedCandidate || !search?.target) return;
      const link = document.createElement("a");
      link.href = image;
      link.download = `${safeFileName(`similitud-${search.target.player}-${selectedCandidate.name}`)}.png`;
      link.click();
      setExportStatus("✓ Comparación exportada como PNG con radar, imágenes y firma.");
    } finally {
      setExportBusy(false);
    }
  }

  async function addComparisonToReport() {
    setExportBusy(true);
    try {
      const image = await createImage();
      if (!image || !selectedCandidate || !search?.target) return;
      window.localStorage.setItem("fos-scout-similarity-comparison-v1", JSON.stringify({ image, title: `Similitud · ${search.target.player} vs. ${selectedCandidate.name}`, createdAt: Date.now() }));
      setExportStatus("✓ Comparación preparada para la Página 2.");
      onOpenReports();
    } catch {
      setExportStatus("No se pudo guardar la comparación. Descárgala como PNG y súbela manualmente.");
    } finally {
      setExportBusy(false);
    }
  }

  return <div className="page-content similarity-page similarity-report-theme" style={reportThemeStyle(theme)}>
    <section className="page-heading">
      <div><span className="kicker">Player similarity report</span><h1>Compara perfiles con el <span>mismo lenguaje del reporte.</span></h1><p>Ranking, radar superpuesto, imágenes de Transfermarkt y una lámina lista para presentar.</p><div className="heading-chips"><span>Radar P0–P100</span><span>Transfermarkt</span><span>Exportación PNG</span></div></div>
      <div className="heading-actions"><button className="button secondary" onClick={onOpenReports}><BarChart3 size={16} /> Volver al reporte</button></div>
    </section>

    {!rows.length || !search ? <section className="dataset-onboarding similarity-empty"><span className="dataset-step">SECCIÓN DE SIMILITUD</span><span className="dataset-icon"><Search size={30} /></span><h2>Primero carga una base de datos</h2><p>La comparación usa la base activa, ya sea una liga, temporada o combinación.</p><button className="button primary" onClick={onOpenReports}>Ir a cargar datos</button></section> : <>
      <section className="similarity-target-bar">
        <div className="similarity-target-copy"><span>JUGADOR OBJETIVO</span><b>{search.target.player}</b><small>{search.target.team} · {search.target.position} · {search.target.age} años</small></div>
        <label><span>Cambiar jugador</span><select value={selectedIndex} onChange={(event) => { setSelectedCandidateIndex(null); setCandidateProfileKey(""); onSelectTarget(Number(event.target.value)); }}>{targets.map((target) => <option key={`${target.index}-${target.player}`} value={target.index}>{target.player} · {target.team}</option>)}</select></label>
        <div className="similarity-model-badge"><Sparkles size={16} /><span><b>BASELINE ESTADÍSTICO</b><small>Percentiles + contexto de edad y rol</small></span></div>
      </section>

      <div className="similarity-workspace">
        <aside className="similarity-filter-panel">
          <div className="similarity-panel-title"><div><Search size={17} /><span><b>Red de filtros</b><small>{candidates.length} coincidencias</small></span></div><button onClick={resetFilters} aria-label="Restablecer filtros"><RotateCcw size={14} /></button></div>
          <label><span>Buscar jugador o club</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escribe un nombre…" /></label>
          <div className="similarity-age-fields"><label><span>Edad mínima</span><input type="number" min="14" max="50" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} placeholder="Todas" /></label><label><span>Edad máxima</span><input type="number" min="14" max="50" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} placeholder="Todas" /></label></div>
          <label><span>Mínimo de minutos</span><input type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(event.target.value)} /></label>
          <label><span>Pasaporte</span><select value={passport} onChange={(event) => setPassport(event.target.value)}><option value="">Todos</option>{options.passports.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Rol · incluye posiciones secundarias</span><select value={position} onChange={(event) => setPosition(event.target.value)}><option value="">Todos los roles</option>{options.positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="similarity-method-note"><b>Motor actual: baseline</b><p>Esta comparación es explicable y funciona con Excel agregados. RisingBALLER–Wyscout podrá reemplazar el vector cuando existan datos por partido.</p></div>
          <div className="similarity-recipient-editor">
            <span>REPORTE GENERADO PARA</span>
            <input value={recipientName} onChange={(event) => onRecipientNameChange(event.target.value)} placeholder="Nombre del club" aria-label="Nombre del club destinatario" />
            <input type="url" value={recipientLogoUrl} onChange={(event) => onRecipientLogoChange(event.target.value)} placeholder="https://logo-del-club.png" aria-label="Link del logo del club destinatario" />
            <small>{recipientLogoReady ? "✓ Logo aplicado a la comparación." : "El logo es independiente de los clubes comparados."}</small>
          </div>
        </aside>

        <main className="similarity-results">
          <section className="similarity-ranking-card">
            <div className="similarity-results-head"><div><span>LISTADO DE JUGADORES</span><h2>Ranking de similitud</h2></div><small>Selecciona un jugador para construir la comparación</small></div>
            {candidates.length ? <div className="similarity-table-wrap"><table className="similarity-table"><thead><tr><th>#</th><th>Jugador</th><th>Posiciones</th><th>Edad</th><th>Minutos</th><th>Pasaporte</th><th>Similitud</th><th /></tr></thead><tbody>{candidates.slice(0, 150).map((candidate, index) => <tr key={candidate.index} className={selectedCandidate?.index === candidate.index ? "selected" : ""}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{candidate.name}</b><small>{candidate.team}</small></td><td><PositionRoles positions={candidate.positions} /></td><td>{candidate.age ?? "—"}</td><td>{Math.round(candidate.minutes).toLocaleString("es-CL")}</td><td>{candidate.passport}</td><td><span className="similarity-score-pill">{candidate.similarity}%</span></td><td><button onClick={() => chooseCandidate(candidate)}>Comparar</button></td></tr>)}</tbody></table></div> : <div className="similarity-no-results"><Search size={24} /><b>No hay jugadores con estos filtros</b><span>Reduce los requisitos de edad, minutos, pasaporte o posición.</span></div>}
          </section>

          {selectedCandidate && <>
            <section className="similarity-enrichment-grid">
              <ProfileEnrichment side="target" label="Jugador objetivo" player={search.target.player} profile={targetProfile} busy={profileBusy === "target"} status={profileStatus.target} onExtract={(url) => extractProfile("target", url)} onDownload={downloadAsset} />
              <ProfileEnrichment side="candidate" label="Jugador comparable" player={selectedCandidate.name} profile={candidateProfile} busy={profileBusy === "candidate"} status={profileStatus.candidate} onExtract={(url) => extractProfile("candidate", url)} onDownload={downloadAsset} />
            </section>

            <section className="similarity-report-sheet">
              <header className="similarity-report-header"><div><span>FOS SCOUT LAB</span><b>COMPARACIÓN DE JUGADORES</b><small>Percentiles posicionales · {sourceName}</small></div><strong>{selectedCandidate.similarity}<small>%</small><span>similitud</span></strong></header>
              <div className="similarity-report-body">
                <div className="similarity-showdown">
                  <ComparisonPlayer profile={targetProfile} name={search.target.player} team={search.target.team} position={search.target.position} age={search.target.age} passport={search.target.passport} label="JUGADOR OBJETIVO" />
                  <div className="similarity-radar-column"><ComparisonRadar metrics={selectedCandidate.metrics} targetName={search.target.player} candidateName={selectedCandidate.name} /><div className="comparison-summary"><span>Métricas <b>{selectedCandidate.metricSimilarity}%</b></span><span>Contexto <b>{selectedCandidate.contextSimilarity}%</b></span><span>Cobertura <b>{selectedCandidate.coverage}%</b></span></div></div>
                  <ComparisonPlayer profile={candidateProfile} name={selectedCandidate.name} team={selectedCandidate.team} position={selectedCandidate.position} age={selectedCandidate.age === null ? "—" : String(selectedCandidate.age)} passport={selectedCandidate.passport} label="JUGADOR COMPARABLE" />
                </div>
                <div className="similarity-metric-section"><div className="similarity-metric-head"><span>{search.target.player}</span><b>COMPARATIVA MÉTRICA A MÉTRICA</b><span>{selectedCandidate.name}</span></div><div className="metric-comparison-list">{selectedCandidate.metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} targetName={search.target.player} candidateName={selectedCandidate.name} />)}</div></div>
              </div>
              <footer className="dossier-footer similarity-report-footer"><p>Percentiles P0–P100 · métricas comunes {selectedCandidate.coverage}% · comparación sobre la base activa.</p><div className="report-signatures"><div className="report-author"><span>ELABORADO POR</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div><div className="report-recipient">{recipientLogoReady ? <ReportImage src={recipientLogoUrl.trim()} alt={reportRecipient} className="dossier-footer-club-logo" /> : <span className="dossier-footer-club-fallback">{reportRecipient.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<div><span>REPORTE GENERADO PARA</span><b>{reportRecipient}</b></div></div></div></footer>
            </section>

            <div className="comparison-actions"><button className="button secondary" onClick={() => void downloadComparison()} disabled={exportBusy}><ArrowDownToLine size={16} /> {exportBusy ? "Preparando…" : "Descargar PNG"}</button><button className="button primary" onClick={() => void addComparisonToReport()} disabled={exportBusy}><ImageIcon size={16} /> Agregar a Página 2</button></div>
            {exportStatus && <p className="similarity-export-status" aria-live="polite">{exportStatus}</p>}
          </>}
        </main>
      </div>
    </>}
  </div>;
}

function ProfileEnrichment({ side, label, player, profile, busy, status, onExtract, onDownload }: { side: ProfileSide; label: string; player: string; profile: TransfermarktProfile; busy: boolean; status: string; onExtract: (url: string) => void; onDownload: (src: string, name: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("transfermarktUrl") ?? "").trim();
    if (url) onExtract(url);
  }
  return <article className="similarity-enrichment-card">
    <div className="enrichment-profile-preview">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={player} className="enrichment-player-image" /> : <span>{player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}{profile.clubLogo && <ReportImage src={profile.clubLogo} alt={profile.club || "Club"} className="enrichment-club-logo" />}</div>
    <div className="enrichment-profile-copy"><span>{label}</span><b>{player}</b><small>{profile.club || "Agrega Transfermarkt para cargar club, foto y escudo"}</small><form key={`${side}-${player}-${profile.sourceUrl}`} onSubmit={submit}><input name="transfermarktUrl" type="url" required defaultValue={profile.sourceUrl} placeholder="https://www.transfermarkt.com/..." aria-label={`Link de Transfermarkt de ${player}`} /><button type="submit" disabled={busy}><Sparkles size={13} /> {busy ? "Extrayendo…" : "Extraer imágenes"}</button></form>{status && <p aria-live="polite">{status}</p>}<div className="enrichment-downloads"><button type="button" disabled={!profile.playerImage} onClick={() => onDownload(profile.playerImage, `${player}-foto`)}>⇩ Foto</button><button type="button" disabled={!profile.clubLogo} onClick={() => onDownload(profile.clubLogo, `${profile.club || player}-escudo`)}>⇩ Escudo</button></div></div>
  </article>;
}

function ComparisonPlayer({ profile, name, team, position, age, passport, label }: { profile: TransfermarktProfile; name: string; team: string; position: string; age: string; passport: string; label: string }) {
  return <article className="comparison-player-card"><header><span>{label}</span>{profile.clubLogo ? <ReportImage src={profile.clubLogo} alt={profile.club || team} className="comparison-club-logo" /> : <span className="comparison-club-fallback">{team.slice(0, 2).toUpperCase()}</span>}</header><div className="comparison-player-portrait">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={name} className="comparison-player-image" /> : <span>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}</div><div className="comparison-player-copy"><h3>{name}</h3><b>{profile.club || team}</b><p>{formatPlayerPositions(profile.position || position)}</p><small>{profile.age || age} años · {profile.citizenship || passport}</small>{profile.marketValue && <strong>{profile.marketValue}</strong>}</div></article>;
}

function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Las imágenes provienen de Transfermarkt o de un enlace elegido por el usuario.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

function PositionRoles({ positions }: { positions: PlayerPosition[] }) {
  if (!positions.length) return <span>—</span>;
  return <div className="position-role-list">{positions.map((position, index) => <span key={`${position.code}-${index}`}><em>{index === 0 ? "1ª" : `${index + 1}ª`}</em><b>{position.role}</b><small>{position.code}</small></span>)}</div>;
}

function MetricComparison({ metric, targetName, candidateName }: { metric: SimilarityMetricComparison; targetName: string; candidateName: string }) {
  const color = GROUP_COLORS[metric.group] ?? GROUP_COLORS[0];
  return <div className="metric-comparison-row" style={{ "--metric-color": color } as React.CSSProperties}>
    <div className="metric-player-bar left" aria-label={`${targetName}: percentil ${metric.targetPercentile}`}><span>{targetName}</span><b>P{metric.targetPercentile}</b><i><em style={{ width: `${metric.targetPercentile}%` }} /></i></div>
    <div className="metric-comparison-label"><span>{metric.label}</span><small>Δ {metric.difference} pts</small></div>
    <div className="metric-player-bar right" aria-label={`${candidateName}: percentil ${metric.candidatePercentile}`}><span>{candidateName}</span><b>P{metric.candidatePercentile}</b><i><em style={{ width: `${metric.candidatePercentile}%` }} /></i></div>
  </div>;
}
