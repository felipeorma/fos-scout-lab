"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowDownToLine, BarChart3, ImageIcon, RotateCcw, Search, Sparkles, Upload } from "./Icons";
import { ComparisonRadar } from "./ComparisonRadar";
import { reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  buildSimilaritySearch,
  similarityOptions,
  type SimilarityFilters,
  type SimilarityMetricComparison,
  type SimilarityPlayer,
} from "@/lib/similarity";
import { formatCell, type DataRow, type PlayerReport } from "@/lib/scouting";
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
const METRIC_GROUPS = [
  { label: "Finalización / defensa", color: GROUP_COLORS[0] },
  { label: "Creación / progresión", color: GROUP_COLORS[1] },
  { label: "Desequilibrio / pase", color: GROUP_COLORS[2] },
];
const PLAYER_PALETTE = ["#1f5fd6", "#e95b3f", "#43a8a0", "#9e07ae", "#d7a62c", "#16a34a", "#0f172a", "#f97316"];
const alphabeticCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeFileName(value: string) {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatMetricValue(value: number, key: string) {
  return `${formatCell(value)}${key.includes("%") ? "%" : ""}`;
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo convertir la imagen procesada."));
    reader.readAsDataURL(blob);
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

function drawRadar(ctx: CanvasRenderingContext2D, metrics: SimilarityMetricComparison[], theme: ReportTheme, cx: number, cy: number, radius: number, targetColor: string, candidateColor: string) {
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
  metrics.forEach((metric, index) => {
    const step = Math.PI * 2 / metrics.length;
    const start = -Math.PI / 2 + index * step - step * .42;
    const end = -Math.PI / 2 + index * step + step * .42;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 14, start, end);
    ctx.strokeStyle = GROUP_COLORS[metric.group] ?? GROUP_COLORS[0];
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
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
  area("targetPercentile", targetColor, `${targetColor}33`);
  area("candidatePercentile", candidateColor, `${candidateColor}2b`);
  metrics.forEach((metric, index) => {
    const label = radarPoint(index, metrics.length, radius + 42, cx, cy);
    const alignment = Math.cos(label.angle) > .2 ? "left" : Math.cos(label.angle) < -.2 ? "right" : "center";
    ctx.fillStyle = theme.ink;
    ctx.font = "700 14px Arial";
    ctx.textAlign = alignment;
    ctx.fillText(fitText(ctx, metric.label.toUpperCase(), 160), label.x, label.y);
    const badgeWidth = 44;
    const badgeGap = 6;
    const badgeHeight = 22;
    const badgesWidth = badgeWidth * 2 + badgeGap;
    const badgesX = alignment === "left" ? label.x : alignment === "right" ? label.x - badgesWidth : label.x - badgesWidth / 2;
    const badgesY = label.y + 7;
    const percentileBadge = (x: number, value: number, color: string, corner: number) => {
      drawRoundedRect(ctx, x, badgesY, badgeWidth, badgeHeight, corner);
      ctx.save();
      ctx.globalAlpha = .17;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "800 11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(`P${value}`, x + badgeWidth / 2, badgesY + 15);
    };
    percentileBadge(badgesX, metric.targetPercentile, targetColor, badgeHeight / 2);
    percentileBadge(badgesX + badgeWidth + badgeGap, metric.candidatePercentile, candidateColor, 4);
  });
}

async function comparisonImage(target: PlayerReport, candidate: SimilarityPlayer, sourceName: string, theme: ReportTheme, targetProfile: TransfermarktProfile, candidateProfile: TransfermarktProfile, recipientName: string, recipientLogoUrl: string, targetColor: string, candidateColor: string) {
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

  const playerCard = (x: number, report: { name: string; team: string; position: string; age: string; passport: string }, profile: TransfermarktProfile, image: HTMLImageElement | null, club: HTMLImageElement | null, label: string, color: string) => {
    drawRoundedRect(ctx, x, 192, 350, 470, 18);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x, 192, 350, 6);
    ctx.fillStyle = theme.dark;
    ctx.fillRect(x, 198, 350, 42);
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

  playerCard(70, { name: target.player, team: target.team, position: target.position, age: target.age, passport: target.passport }, targetProfile, targetImage, targetClub, "JUGADOR OBJETIVO", targetColor);
  playerCard(1180, { name: candidate.name, team: candidate.team, position: candidate.position, age: candidate.age === null ? "—" : String(candidate.age), passport: candidate.passport }, candidateProfile, candidateImage, candidateClub, "JUGADOR COMPARABLE", candidateColor);
  drawRadar(ctx, candidate.metrics, theme, 800, 426, 210, targetColor, candidateColor);

  ctx.textAlign = "center";
  ctx.fillStyle = theme.accent;
  ctx.font = "800 54px Arial";
  ctx.fillText(`${candidate.similarity}%`, 800, 708);
  ctx.fillStyle = theme.muted;
  ctx.font = "700 13px Arial";
  ctx.fillText("SIMILITUD GLOBAL", 800, 731);
  const legendItemWidth = 205;
  const legendStartX = 800 - METRIC_GROUPS.length * legendItemWidth / 2;
  METRIC_GROUPS.forEach((group, index) => {
    const x = legendStartX + index * legendItemWidth;
    ctx.fillStyle = group.color;
    drawRoundedRect(ctx, x, 751, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.font = "700 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(group.label.toUpperCase(), x + 20, 761);
  });
  ctx.textAlign = "left";

  candidate.metrics.slice(0, 7).forEach((metric, index) => {
    const y = 793 + index * 39;
    ctx.fillStyle = theme.ink;
    ctx.font = "700 13px Arial";
    ctx.fillText(fitText(ctx, metric.label.toUpperCase(), 240), 360, y + 5);
    ctx.fillStyle = theme.line;
    drawRoundedRect(ctx, 620, y - 8, 300, 14, 7);
    ctx.fill();
    ctx.fillStyle = targetColor;
    drawRoundedRect(ctx, 620, y - 8, 300 * metric.targetPercentile / 100, 14, 7);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.font = "800 13px Arial";
    ctx.fillText(formatMetricValue(metric.targetValue, metric.key), 930, y + 4);
    ctx.fillStyle = theme.line;
    drawRoundedRect(ctx, 1010, y - 8, 300, 14, 7);
    ctx.fill();
    ctx.fillStyle = candidateColor;
    drawRoundedRect(ctx, 1010, y - 8, 300 * metric.candidatePercentile / 100, 14, 7);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.fillText(formatMetricValue(metric.candidateValue, metric.key), 1320, y + 4);
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
  const [backgroundBusy, setBackgroundBusy] = useState<ProfileSide | null>(null);
  const [backgroundOriginals, setBackgroundOriginals] = useState<Record<string, string>>({});
  const [profileStatus, setProfileStatus] = useState<Record<ProfileSide, string>>({ target: "", candidate: "" });
  const [targetColorChoice, setTargetColorChoice] = useState("");
  const [candidateColorChoice, setCandidateColorChoice] = useState("#e95b3f");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const options = useMemo(() => similarityOptions(rows), [rows]);
  const targetTeams = useMemo(() => [...new Set(targets.map((target) => target.team))].sort(alphabeticCollator.compare), [targets]);
  const selectedTarget = targets.find((target) => target.index === selectedIndex);
  const selectedTargetTeam = selectedTarget?.team ?? targetTeams[0] ?? "";
  const targetPlayers = useMemo(() => targets.filter((target) => target.team === selectedTargetTeam).sort((a, b) => alphabeticCollator.compare(a.player, b.player)), [selectedTargetTeam, targets]);
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
  const targetColor = targetColorChoice || theme.accent;
  const candidateColor = candidateColorChoice || "#e95b3f";
  const paletteColors = useMemo(() => [...new Set([theme.accent, theme.dark, ...PLAYER_PALETTE])], [theme.accent, theme.dark]);
  const reportRecipient = recipientName.trim() || "Club destinatario";
  const recipientLogoReady = /^(https?:\/\/|data:image\/)/i.test(recipientLogoUrl.trim());

  function chooseCandidate(candidate: SimilarityPlayer) {
    setSelectedCandidateIndex(candidate.index);
    setCandidateProfileState(loadStoredProfile(candidate));
    setCandidateProfileKey(profileStorageKey(candidate.name));
    setProfileStatus((current) => ({ ...current, candidate: "" }));
  }

  function chooseTarget(index: number) {
    setSelectedCandidateIndex(null);
    setCandidateProfileKey("");
    onSelectTarget(index);
  }

  function chooseTargetTeam(team: string) {
    const firstPlayer = targets.filter((target) => target.team === team).sort((a, b) => alphabeticCollator.compare(a.player, b.player))[0];
    if (firstPlayer) chooseTarget(firstPlayer.index);
  }

  function resetFilters() {
    setQuery("");
    setAgeMin("");
    setAgeMax("");
    setMinimumMinutes("500");
    setPassport("");
    setPosition("");
  }

  function saveProfile(side: ProfileSide, playerName: string, next: TransfermarktProfile) {
    if (side === "target") onTargetProfileChange(next);
    else {
      setCandidateProfileState(next);
      setCandidateProfileKey(profileStorageKey(playerName));
    }
    try { window.localStorage.setItem(profileStorageKey(playerName), JSON.stringify(next)); } catch { /* La comparación continúa aunque no haya persistencia. */ }
  }

  function clearBackgroundOriginal(playerName: string) {
    setBackgroundOriginals((originals) => {
      const key = profileStorageKey(playerName);
      if (!(key in originals)) return originals;
      const nextOriginals = { ...originals };
      delete nextOriginals[key];
      return nextOriginals;
    });
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
      saveProfile(side, playerName, next);
      clearBackgroundOriginal(playerName);
      setProfileStatus((status) => ({ ...status, [side]: "✓ Foto, escudo y datos cargados." }));
    } catch (error) {
      setProfileStatus((status) => ({ ...status, [side]: error instanceof Error ? error.message : "No se pudo extraer el perfil." }));
    } finally {
      setProfileBusy(null);
    }
  }

  function applyPlayerImageUrl(side: ProfileSide, value: string) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName) return;
    try {
      const url = new URL(value.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
      saveProfile(side, playerName, { ...current, playerImage: url.href });
      clearBackgroundOriginal(playerName);
      setProfileStatus((status) => ({ ...status, [side]: "✓ Foto aplicada desde el enlace. Puedes quitarle el fondo con IA." }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: "Ingresa un enlace de imagen válido que comience con http:// o https://." }));
    }
  }

  async function loadPlayerImage(side: ProfileSide, file?: File) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName || !file) return;
    if (!file.type.startsWith("image/")) {
      setProfileStatus((status) => ({ ...status, [side]: "Selecciona un archivo de imagen PNG, WEBP o JPG." }));
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      clearBackgroundOriginal(playerName);
      setProfileStatus((status) => ({ ...status, [side]: "✓ Foto cargada desde el ordenador. Puedes quitarle el fondo con IA." }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: "No se pudo leer la imagen seleccionada." }));
    }
  }

  async function removePlayerBackground(side: ProfileSide) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    const source = current.playerImage.trim();
    if (!playerName || !source) {
      setProfileStatus((status) => ({ ...status, [side]: "Primero extrae o carga una foto del jugador." }));
      return;
    }
    setBackgroundBusy(side);
    setProfileStatus((status) => ({ ...status, [side]: "Preparando el modelo de IA… La primera vez puede tardar." }));
    try {
      const imageSource = /^data:|^blob:/i.test(source)
        ? source
        : `https://images.weserv.nl/?url=${encodeURIComponent(source.replace(/^https?:\/\//i, ""))}`;
      const { removeBackground } = await import("@imgly/background-removal");
      const result = await removeBackground(imageSource, {
        model: "small",
        output: { format: "image/png", quality: 1 },
        progress: (key, currentProgress, total) => {
          const percent = total > 0 ? Math.min(100, Math.round(currentProgress / total * 100)) : 0;
          setProfileStatus((status) => ({ ...status, [side]: percent ? `Descargando modelo IA · ${percent}%` : `Preparando ${key}…` }));
        },
      });
      const dataUrl = await blobToDataUrl(result);
      const storageKey = profileStorageKey(playerName);
      setBackgroundOriginals((originals) => originals[storageKey] ? originals : { ...originals, [storageKey]: source });
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      setProfileStatus((status) => ({ ...status, [side]: "✓ Fondo eliminado. La foto transparente ya está aplicada al reporte." }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: "No se pudo eliminar el fondo. Reintenta o utiliza otra imagen." }));
    } finally {
      setBackgroundBusy(null);
    }
  }

  function restorePlayerBackground(side: ProfileSide) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    const storageKey = profileStorageKey(playerName);
    const original = backgroundOriginals[storageKey];
    if (!playerName || !original) return;
    saveProfile(side, playerName, { ...current, playerImage: original });
    setBackgroundOriginals((originals) => {
      const nextOriginals = { ...originals };
      delete nextOriginals[storageKey];
      return nextOriginals;
    });
    setProfileStatus((status) => ({ ...status, [side]: "✓ Imagen original restaurada." }));
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
    return comparisonImage(search.target, selectedCandidate, sourceName, theme, targetProfile, candidateProfile, reportRecipient, recipientLogoUrl.trim(), targetColor, candidateColor);
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
        <div className="similarity-target-selectors">
          <label><span>1 · Club</span><select value={selectedTargetTeam} onChange={(event) => chooseTargetTeam(event.target.value)}>{targetTeams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
          <label><span>2 · Jugador</span><select value={selectedIndex} onChange={(event) => chooseTarget(Number(event.target.value))}>{targetPlayers.map((target) => <option key={`${target.index}-${target.player}`} value={target.index}>{target.player}</option>)}</select></label>
        </div>
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
              <ProfileEnrichment side="target" label="Jugador objetivo" player={search.target.player} profile={targetProfile} busy={profileBusy === "target"} backgroundBusy={backgroundBusy === "target"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(search.target.player)])} status={profileStatus.target} onExtract={(url) => extractProfile("target", url)} onImageUrl={(url) => applyPlayerImageUrl("target", url)} onImageFile={(file) => loadPlayerImage("target", file)} onRemoveBackground={() => removePlayerBackground("target")} onRestoreBackground={() => restorePlayerBackground("target")} onDownload={downloadAsset} />
              <ProfileEnrichment side="candidate" label="Jugador comparable" player={selectedCandidate.name} profile={candidateProfile} busy={profileBusy === "candidate"} backgroundBusy={backgroundBusy === "candidate"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(selectedCandidate.name)])} status={profileStatus.candidate} onExtract={(url) => extractProfile("candidate", url)} onImageUrl={(url) => applyPlayerImageUrl("candidate", url)} onImageFile={(file) => loadPlayerImage("candidate", file)} onRemoveBackground={() => removePlayerBackground("candidate")} onRestoreBackground={() => restorePlayerBackground("candidate")} onDownload={downloadAsset} />
            </section>

            <section className="similarity-color-panel">
              <div className="similarity-color-heading"><span>PALETA DE COMPARACIÓN</span><b>Asigna un color a cada jugador</b><small>El color también identifica sus etiquetas de percentil; los grupos métricos mantienen la circunferencia exterior.</small></div>
              <PalettePicker label="Jugador objetivo" player={search.target.player} color={targetColor} colors={paletteColors} onChange={setTargetColorChoice} />
              <PalettePicker label="Jugador comparable" player={selectedCandidate.name} color={candidateColor} colors={paletteColors} onChange={setCandidateColorChoice} />
            </section>

            <section className="similarity-report-sheet">
              <header className="similarity-report-header"><div><span>FOS SCOUT LAB</span><b>COMPARACIÓN DE JUGADORES</b><small>Percentiles posicionales · {sourceName}</small></div><strong>{selectedCandidate.similarity}<small>%</small><span>similitud</span></strong></header>
              <div className="similarity-report-body">
                <div className="similarity-showdown">
                  <ComparisonPlayer profile={targetProfile} name={search.target.player} team={search.target.team} position={search.target.position} age={search.target.age} passport={search.target.passport} label="JUGADOR OBJETIVO" color={targetColor} />
                  <div className="similarity-radar-column"><ComparisonRadar metrics={selectedCandidate.metrics} targetName={search.target.player} candidateName={selectedCandidate.name} targetColor={targetColor} candidateColor={candidateColor} /><MetricGroupLegend /></div>
                  <ComparisonPlayer profile={candidateProfile} name={selectedCandidate.name} team={selectedCandidate.team} position={selectedCandidate.position} age={selectedCandidate.age === null ? "—" : String(selectedCandidate.age)} passport={selectedCandidate.passport} label="JUGADOR COMPARABLE" color={candidateColor} />
                </div>
                <div className="similarity-metric-section"><div className="similarity-metric-head"><span style={{ color: targetColor }}>{search.target.player}</span><b>COMPARATIVA MÉTRICA A MÉTRICA</b><span style={{ color: candidateColor }}>{selectedCandidate.name}</span></div><div className="metric-comparison-list">{selectedCandidate.metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} targetName={search.target.player} candidateName={selectedCandidate.name} targetColor={targetColor} candidateColor={candidateColor} />)}</div></div>
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

function ProfileEnrichment({ side, label, player, profile, busy, backgroundBusy, locked, canRestore, status, onExtract, onImageUrl, onImageFile, onRemoveBackground, onRestoreBackground, onDownload }: { side: ProfileSide; label: string; player: string; profile: TransfermarktProfile; busy: boolean; backgroundBusy: boolean; locked: boolean; canRestore: boolean; status: string; onExtract: (url: string) => void; onImageUrl: (url: string) => void; onImageFile: (file?: File) => void; onRemoveBackground: () => void; onRestoreBackground: () => void; onDownload: (src: string, name: string) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("transfermarktUrl") ?? "").trim();
    if (url) onExtract(url);
  }
  function submitImageUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = String(new FormData(event.currentTarget).get("playerImageUrl") ?? "").trim();
    if (url) onImageUrl(url);
  }
  const remotePlayerImage = /^https?:\/\//i.test(profile.playerImage) ? profile.playerImage : "";
  return <article className="similarity-enrichment-card">
    <div className="enrichment-profile-preview">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={player} className="enrichment-player-image" /> : <span>{player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}{profile.clubLogo && <ReportImage src={profile.clubLogo} alt={profile.club || "Club"} className="enrichment-club-logo" />}</div>
    <div className="enrichment-profile-copy">
      <span>{label}</span><b>{player}</b><small>{profile.club || "Agrega Transfermarkt para cargar club, foto y escudo"}</small>
      <form key={`${side}-${player}-${profile.sourceUrl}`} onSubmit={submit}><input name="transfermarktUrl" type="url" required defaultValue={profile.sourceUrl} placeholder="https://www.transfermarkt.com/..." aria-label={`Link de Transfermarkt de ${player}`} /><button type="submit" disabled={locked}><Sparkles size={13} /> {busy ? "Extrayendo…" : "Extraer imágenes"}</button></form>
      <form className="enrichment-image-source" key={`${side}-${player}-${remotePlayerImage || "local"}`} onSubmit={submitImageUrl}>
        <span>FOTO DEL JUGADOR · LINK O ARCHIVO</span>
        <input name="playerImageUrl" type="url" required defaultValue={remotePlayerImage} placeholder="https://imagen-del-jugador.png" aria-label={`Link directo de la foto de ${player}`} />
        <button type="submit" disabled={locked}>Usar link</button>
        <label><Upload size={12} /><span>Ordenador</span><input type="file" accept="image/png,image/webp,image/jpeg" hidden disabled={locked} onChange={(event) => { onImageFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </form>
      {status && <p aria-live="polite">{status}</p>}
      <div className="enrichment-background-tools"><button type="button" onClick={onRemoveBackground} disabled={locked || !profile.playerImage}><Sparkles size={12} /> {backgroundBusy ? "Quitando fondo…" : "Quitar fondo con IA"}</button>{canRestore && <button className="restore" type="button" onClick={onRestoreBackground} disabled={locked}>Restaurar original</button>}</div>
      <div className="enrichment-downloads"><button type="button" disabled={!profile.playerImage || backgroundBusy} onClick={() => onDownload(profile.playerImage, `${player}-foto`)}>⇩ Foto</button><button type="button" disabled={!profile.clubLogo || backgroundBusy} onClick={() => onDownload(profile.clubLogo, `${profile.club || player}-escudo`)}>⇩ Escudo</button></div>
    </div>
  </article>;
}

function ComparisonPlayer({ profile, name, team, position, age, passport, label, color }: { profile: TransfermarktProfile; name: string; team: string; position: string; age: string; passport: string; label: string; color: string }) {
  return <article className="comparison-player-card" style={{ "--player-color": color } as CSSProperties}><header><span>{label}</span>{profile.clubLogo ? <ReportImage src={profile.clubLogo} alt={profile.club || team} className="comparison-club-logo" /> : <span className="comparison-club-fallback">{team.slice(0, 2).toUpperCase()}</span>}</header><div className="comparison-player-portrait">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={name} className="comparison-player-image" /> : <span>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}</div><div className="comparison-player-copy"><h3>{name}</h3><b>{profile.club || team}</b><p>{formatPlayerPositions(profile.position || position)}</p><small>{profile.age || age} años · {profile.citizenship || passport}</small>{profile.marketValue && <strong>{profile.marketValue}</strong>}</div></article>;
}

function PalettePicker({ label, player, color, colors, onChange }: { label: string; player: string; color: string; colors: string[]; onChange: (color: string) => void }) {
  return <div className="similarity-palette-picker"><div><span>{label}</span><b><i style={{ backgroundColor: color }} />{player}</b></div><div className="similarity-palette-swatches">{colors.map((option) => <button key={option} type="button" className={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en") ? "selected" : ""} style={{ "--swatch": option } as CSSProperties} aria-label={`Asignar color ${option} a ${player}`} aria-pressed={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en")} onClick={() => onChange(option)}><span /></button>)}<label><span>Personalizado</span><input type="color" value={color} onChange={(event) => onChange(event.target.value)} aria-label={`Color personalizado para ${player}`} /></label></div></div>;
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

function MetricGroupLegend() {
  return <div className="similarity-metric-group-legend" aria-label="Leyenda de grupos métricos">
    {METRIC_GROUPS.map((group) => <span key={group.label}><i style={{ "--metric-group-color": group.color } as CSSProperties} /><b>{group.label}</b></span>)}
  </div>;
}

function MetricComparison({ metric, targetName, candidateName, targetColor, candidateColor }: { metric: SimilarityMetricComparison; targetName: string; candidateName: string; targetColor: string; candidateColor: string }) {
  const targetValue = formatMetricValue(metric.targetValue, metric.key);
  const candidateValue = formatMetricValue(metric.candidateValue, metric.key);
  return <div className="metric-comparison-row" style={{ "--target-color": targetColor, "--candidate-color": candidateColor } as CSSProperties}>
    <div className="metric-player-bar left" aria-label={`${targetName}: ${metric.label}, ${targetValue}`}><span>{targetName}</span><b>{targetValue}</b><i><em style={{ width: `${metric.targetPercentile}%` }} /></i></div>
    <div className="metric-comparison-label"><span>{metric.label}</span></div>
    <div className="metric-player-bar right" aria-label={`${candidateName}: ${metric.label}, ${candidateValue}`}><span>{candidateName}</span><b>{candidateValue}</b><i><em style={{ width: `${metric.candidatePercentile}%` }} /></i></div>
  </div>;
}
