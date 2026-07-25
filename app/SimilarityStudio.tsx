"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, BarChart3, ImageIcon, Printer, RotateCcw, Search, Sparkles, Upload } from "./Icons";
import { ComparisonRadar } from "./ComparisonRadar";
import { reportThemeStyle, type ReportTheme } from "./reportTheme";
import {
  buildSimilaritySearch,
  secondaryRoleOptions,
  similarityOptions,
  type SimilarityFilters,
  type SimilarityMetricComparison,
  type SimilarityMetricWeights,
  type SimilarityPlayer,
} from "@/lib/similarity";
import { formatCell, type DataRow, type PlayerReport } from "@/lib/scouting";
import { formatPlayerPositions, type PlayerPosition } from "@/lib/positions";
import { SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { createEmptyTransfermarktProfile, type TransfermarktProfile } from "@/lib/transfermarkt";
import { removePlayerImageBackground } from "@/lib/playerImageBackground";
import { canvasImageCandidates, fetchTransfermarktProfile, proxiedImageUrl } from "@/lib/remoteData";
import { t, tf, numberLocale, type Lang } from "@/lib/i18n";

type TargetOption = { index: number; player: string; team: string };
type ProfileSide = "target" | "candidate";

type SimilarityStudioProps = {
  rows: DataRow[];
  selectedIndex: number;
  sourceName: string;
  lang?: Lang;
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

const PLAYER_PALETTE = ["#1f5fd6", "#e95b3f", "#43a8a0", "#9e07ae", "#d7a62c", "#16a34a", "#0f172a", "#f97316"];
const alphabeticCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const TRANSFERMARKT_LOGO = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true"
  ? "/fos-scout-lab/tm_logo.svg"
  : "/tm_logo.svg";
const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";

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
  return src.startsWith("data:image/") || src.startsWith("/") ? src : proxiedImageUrl(src);
}

function loadImageAttempt(url: string, timeoutMs = 12_000) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    image.crossOrigin = "anonymous";
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); resolve(null); };
    image.src = url;
  });
}

async function loadCanvasImage(src: string) {
  // Cadena de respaldos: si un proxy falla, la foto no se pierde en silencio.
  for (const candidate of canvasImageCandidates(src)) {
    const image = await loadImageAttempt(candidate);
    if (image) return image;
  }
  return null;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(t("No se pudo convertir la imagen procesada.")));
    reader.readAsDataURL(blob);
  });
}

function drawContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function canvasColorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

function drawStarPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerRadius: number, innerRadius: number) {
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const STAR_DIM = [56, 66, 88];
const STAR_GOLD = [250, 204, 21];
const STAR_INCANDESCENT = [255, 240, 158];

function similarityStarColor(percentage: number) {
  // La estrella pasa de apagada (azul grisáceo) a dorado y, cerca del 100%,
  // a un dorado incandescente: la iluminación ES el indicador, sin anillos.
  const blend = (from: number[], to: number[], amount: number) =>
    `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(", ")})`;
  if (percentage <= 70) return blend(STAR_DIM, STAR_GOLD, percentage / 70);
  return blend(STAR_GOLD, STAR_INCANDESCENT, (percentage - 70) / 30);
}

function similarityStarGlow(percentage: number) {
  // Curva exponencial: el brillo despega en los porcentajes altos.
  return Math.pow(percentage / 100, 1.8);
}

function drawCanvasSimilarityStar(ctx: CanvasRenderingContext2D, similarity: number, cx: number, cy: number, radius: number, theme: ReportTheme) {
  const percentage = Math.min(Math.max(Math.round(similarity), 0), 100);
  const glow = similarityStarGlow(percentage);
  const innerRadius = radius * .46;

  ctx.save();
  ctx.shadowColor = `rgba(250,204,21,${Math.min(1, glow * 1.1)})`;
  ctx.shadowBlur = 3 + glow * 34;
  drawStarPath(ctx, cx, cy, radius, innerRadius);
  ctx.fillStyle = similarityStarColor(percentage);
  ctx.fill();
  if (glow > .3) {
    // Pasadas extra: cerca del 100% la estrella queda incandescente.
    ctx.shadowBlur = 12 + glow * 44;
    ctx.fill();
  }
  if (glow > .7) {
    ctx.shadowColor = `rgba(255,240,158,${glow})`;
    ctx.shadowBlur = 20 + glow * 55;
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 18px Arial";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = canvasColorWithAlpha(theme.dark, "cc");
  ctx.strokeText(`${percentage}%`, cx, cy + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${percentage}%`, cx, cy + 1);
  ctx.restore();
}

function radarPoint(index: number, total: number, radius: number, cx: number, cy: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle };
}

function drawRadar(ctx: CanvasRenderingContext2D, metrics: SimilarityMetricComparison[], cohort: string, theme: ReportTheme, cx: number, cy: number, radius: number, targetColor: string, candidateColor: string, targetLabelColor: string, candidateLabelColor: string, targetLabelTransparency: number, candidateLabelTransparency: number) {
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
    ctx.strokeStyle = similarityMetricGroup(metric, cohort).color;
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
  // Con 10+ métricas las etiquetas se escalonan en dos alturas alternadas y
  // se envuelven en dos líneas: así no chocan entre sí ni con el radar.
  const dense = metrics.length > 10;
  const labelFont = dense ? 12 : 14;
  const badgeWidth = dense ? 38 : 44;
  const badgeHeight = dense ? 19 : 22;
  const badgeGap = dense ? 4 : 6;
  metrics.forEach((metric, index) => {
    // Las etiquetas laterales se empujan más hacia afuera (el texto centrado
    // crece en horizontal); arriba y abajo se mantiene el escalonado corto.
    const angle = -Math.PI / 2 + index * Math.PI * 2 / metrics.length;
    const horizontalPush = Math.abs(Math.cos(angle)) * 30;
    const stagger = (dense ? (index % 2 === 0 ? 46 : 96) : 66) + horizontalPush;
    const label = radarPoint(index, metrics.length, radius + stagger, cx, cy);
    const text = t(metric.label).replace(/\s*\/90/g, "").replace(/,\s*%$/, " %").toUpperCase();
    ctx.font = `700 ${labelFont}px Arial`;
    let lines = [fitText(ctx, text, dense ? 175 : 175)];
    if (dense && text.length > 14) {
      const words = text.split(" ");
      if (words.length > 1) {
        let splitIndex = 1;
        let bestDiff = Infinity;
        for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
          const diff = Math.abs(words.slice(0, wordIndex).join(" ").length - words.slice(wordIndex).join(" ").length);
          if (diff < bestDiff) { bestDiff = diff; splitIndex = wordIndex; }
        }
        lines = [words.slice(0, splitIndex).join(" "), words.slice(splitIndex).join(" ")];
      }
    }
    ctx.fillStyle = theme.ink;
    ctx.textAlign = "center";
    lines.forEach((line, lineIndex) => {
      ctx.fillText(fitText(ctx, line, dense ? 175 : 175), label.x, label.y - (lines.length - 1 - lineIndex) * (labelFont + 1));
    });
    const badgesWidth = badgeWidth * 2 + badgeGap;
    const badgesX = label.x - badgesWidth / 2;
    const badgesY = label.y + 6;
    const percentileBadge = (x: number, value: number, color: string, transparency: number, corner: number) => {
      drawRoundedRect(ctx, x, badgesY, badgeWidth, badgeHeight, corner);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(100, 100 - transparency)) / 100;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `800 ${dense ? 10 : 11}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(`P${value}`, x + badgeWidth / 2, badgesY + (dense ? 13.5 : 15));
    };
    percentileBadge(badgesX, metric.targetPercentile, targetLabelColor, targetLabelTransparency, badgeHeight / 2);
    percentileBadge(badgesX + badgeWidth + badgeGap, metric.candidatePercentile, candidateLabelColor, candidateLabelTransparency, 4);
  });
}

// Lupa de scouting dibujada a mano: identifica las láminas sin firmar con nombre.
function drawMagnifier(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, radius * 0.3);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.74, y + radius * 0.74);
  ctx.lineTo(x + radius * 1.65, y + radius * 1.65);
  ctx.stroke();
  ctx.restore();
}

// `forReport`: la lámina va incrustada en la Página 2 del reporte, que ya trae
// firma propia — se omiten el nombre del título y el bloque de firma inferior.
async function comparisonImage(target: PlayerReport, candidate: SimilarityPlayer, sourceName: string, theme: ReportTheme, targetProfile: TransfermarktProfile, candidateProfile: TransfermarktProfile, recipientName: string, recipientLogoUrl: string, targetColor: string, candidateColor: string, targetLabelColor: string, candidateLabelColor: string, targetLabelTransparency: number, candidateLabelTransparency: number, forReport = false, targetPhotoScale = 100, candidatePhotoScale = 100) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = forReport ? 1452 : 1566;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const [targetImage, targetClub, candidateImage, candidateClub, recipientLogo, transfermarktLogo] = await Promise.all([
    loadCanvasImage(targetProfile.playerImage),
    loadCanvasImage(targetProfile.clubLogo),
    loadCanvasImage(candidateProfile.playerImage),
    loadCanvasImage(candidateProfile.clubLogo),
    loadCanvasImage(recipientLogoUrl),
    loadCanvasImage(TRANSFERMARKT_LOGO),
  ]);

  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, 1600, canvas.height);

  // ---- Cinta superior: jugadores a los costados y estrella al centro ----
  const RIBBON = 250;
  ctx.fillStyle = theme.dark;
  ctx.fillRect(0, 0, 1600, RIBBON);
  ctx.fillStyle = targetColor;
  ctx.fillRect(0, RIBBON - 4, 800, 4);
  ctx.fillStyle = candidateColor;
  ctx.fillRect(800, RIBBON - 4, 800, 4);

  const ribbonPlayer = (side: "left" | "right", info: { name: string; team: string; position: string; age: string; passport: string }, profile: TransfermarktProfile, image: HTMLImageElement | null, club: HTMLImageElement | null, label: string, color: string, photoScale: number) => {
    const frameX = side === "left" ? 60 : 1380;
    const textX = side === "left" ? 254 : 1346;
    ctx.textAlign = side === "left" ? "left" : "right";

    // Marco del retrato con degradado del color del jugador
    drawRoundedRect(ctx, frameX, 34, 160, 186, 14);
    const frameGradient = ctx.createLinearGradient(frameX, 34, frameX, 220);
    frameGradient.addColorStop(0, canvasColorWithAlpha(color, "55"));
    frameGradient.addColorStop(1, canvasColorWithAlpha(color, "18"));
    ctx.fillStyle = frameGradient;
    ctx.fill();
    ctx.strokeStyle = canvasColorWithAlpha(color, "aa");
    ctx.lineWidth = 2;
    ctx.stroke();
    if (image) {
      const scale = Math.max(0.6, Math.min(1.4, photoScale / 100));
      const boxWidth = 150 * scale;
      const boxHeight = 176 * scale;
      ctx.save();
      drawRoundedRect(ctx, frameX, 34, 160, 186, 14);
      ctx.clip();
      drawContain(ctx, image, frameX + 80 - boxWidth / 2, 218 - boxHeight, boxWidth, boxHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "800 52px Arial";
      const initialsAlign = ctx.textAlign;
      ctx.textAlign = "center";
      ctx.fillText(info.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join(""), frameX + 80, 145);
      ctx.textAlign = initialsAlign;
    }
    if (club) {
      const crestX = side === "left" ? frameX + 128 : frameX - 14;
      ctx.save();
      ctx.beginPath();
      ctx.arc(crestX + 23, 195, 27, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
      drawContain(ctx, club, crestX, 172, 46, 46);
    }

    // Chip de rol del jugador en su color
    ctx.font = "800 11px Arial";
    const chipText = label;
    const chipWidth = ctx.measureText(chipText).width + 26;
    const chipX = side === "left" ? textX : textX - chipWidth;
    drawRoundedRect(ctx, chipX, 44, chipWidth, 24, 12);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    const chipAlign = ctx.textAlign;
    ctx.textAlign = "center";
    ctx.fillText(chipText, chipX + chipWidth / 2, 60);
    ctx.textAlign = chipAlign;

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 27px Arial";
    ctx.fillText(fitText(ctx, info.name.toUpperCase(), 420), textX, 104);
    ctx.fillStyle = "rgba(255,255,255,.78)";
    ctx.font = "700 15px Arial";
    ctx.fillText(fitText(ctx, profile.club || info.team, 400), textX, 131);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "600 12px Arial";
    ctx.fillText(fitText(ctx, formatPlayerPositions(profile.position || info.position), 420), textX, 154);
    ctx.fillText(tf("{age} años · {passport}", { age: profile.age || info.age || "—", passport: profile.citizenship || info.passport }), textX, 175);
    const marketValue = profile.marketValue || t("VALOR N/D");
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 20px Arial";
    ctx.fillText(marketValue, textX, 205);
    if (transfermarktLogo) {
      const valueWidth = ctx.measureText(marketValue).width;
      const logoX = side === "left" ? textX + valueWidth + 14 : textX - valueWidth - 14 - 88;
      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, logoX, 188, 88, 22, 4);
      ctx.fill();
      drawContain(ctx, transfermarktLogo, logoX + 4, 190, 80, 18);
    }
  };

  ribbonPlayer("left", { name: target.player, team: target.team, position: target.position, age: target.age, passport: target.passport }, targetProfile, targetImage, targetClub, t("JUGADOR OBJETIVO"), targetColor, targetPhotoScale);
  ribbonPlayer("right", { name: candidate.name, team: candidate.team, position: candidate.position, age: candidate.age === null ? "—" : String(candidate.age), passport: candidate.passport }, candidateProfile, candidateImage, candidateClub, t("JUGADOR COMPARABLE"), candidateColor, candidatePhotoScale);

  // Estrella de similitud al centro, entre los dos nombres
  drawCanvasSimilarityStar(ctx, candidate.similarity, 800, 96, 44, theme);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.68)";
  ctx.font = "700 12px Arial";
  ctx.fillText(t("SIMILITUD"), 800, 160);
  ctx.font = "600 11px Arial";
  const headerLine = fitText(ctx, `${t("COMPARACIÓN DE JUGADORES")} · ${t("Percentiles posicionales").toUpperCase()} · ${t(sourceName).toUpperCase()}`, 560);
  ctx.fillText(headerLine, 812, 200);
  drawMagnifier(ctx, 812 - ctx.measureText(headerLine).width / 2 - 22, 196, 8, "rgba(255,255,255,.68)");
  ctx.textAlign = "left";

  // Radar a lo ancho, con radio generoso: la cinta liberó el espacio lateral.
  drawRadar(ctx, candidate.metrics, target.cohort, theme, 800, 615, candidate.metrics.length > 10 ? 235 : 260, targetColor, candidateColor, targetLabelColor, candidateLabelColor, targetLabelTransparency, candidateLabelTransparency);

  // Solo los grupos presentes en las métricas comparadas aparecen en la leyenda.
  const legendGroups = SIMILARITY_METRIC_GROUPS.filter((group) => candidate.metrics.some((metric) => similarityMetricGroup(metric, target.cohort).id === group.id));
  const legendItemWidth = 175;
  const legendStartX = 800 - legendGroups.length * legendItemWidth / 2;
  legendGroups.forEach((group, index) => {
    const x = legendStartX + index * legendItemWidth;
    ctx.fillStyle = group.color;
    drawRoundedRect(ctx, x, 992, 12, 12, 3);
    ctx.fill();
    ctx.fillStyle = theme.ink;
    ctx.font = "700 11px Arial";
    ctx.textAlign = "left";
    ctx.fillText(t(group.label).toUpperCase(), x + 20, 1002);
  });
  ctx.textAlign = "left";

  // Duelo métrica a métrica: etiqueta centrada sobre una barra a todo lo
  // ancho. El lado del jugador con mejor registro va saturado; el otro,
  // atenuado, con los valores en los extremos.
  candidate.metrics.slice(0, 7).forEach((metric, index) => {
    const labelY = 1046 + index * 56;
    const barTop = labelY + 10;
    const targetShare = metric.targetPercentile + metric.candidatePercentile > 0
      ? metric.targetPercentile / (metric.targetPercentile + metric.candidatePercentile)
      : 0.5;
    const winner = metric.targetPercentile > metric.candidatePercentile ? "target" : metric.candidatePercentile > metric.targetPercentile ? "candidate" : "tie";
    const metricLabel = metric.weight === 1
      ? t(metric.label)
      : `${t(metric.label)} · ${metric.weight === 0 ? t("SIN INFLUENCIA") : tf("PESO {p}%", { p: Math.round(metric.weight * 100) })}`;
    ctx.fillStyle = theme.ink;
    ctx.font = "700 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, metricLabel.toUpperCase(), 900), 800, labelY);

    const barX = 240;
    const barWidth = 1120;
    const splitX = barX + barWidth * targetShare;
    ctx.save();
    drawRoundedRect(ctx, barX, barTop, barWidth, 18, 9);
    ctx.clip();
    ctx.globalAlpha = winner === "candidate" ? 0.3 : 1;
    ctx.fillStyle = targetColor;
    ctx.fillRect(barX, barTop, barWidth * targetShare, 18);
    ctx.globalAlpha = winner === "target" ? 0.3 : 1;
    ctx.fillStyle = candidateColor;
    ctx.fillRect(splitX, barTop, barWidth * (1 - targetShare), 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.paper;
    ctx.fillRect(splitX - 1.5, barTop, 3, 18);
    ctx.restore();

    ctx.font = winner === "target" ? "800 15px Arial" : "700 13px Arial";
    ctx.fillStyle = winner === "target" ? targetColor : theme.muted;
    ctx.textAlign = "right";
    ctx.fillText(formatMetricValue(metric.targetValue, metric.key), barX - 16, barTop + 14);
    ctx.font = winner === "candidate" ? "800 15px Arial" : "700 13px Arial";
    ctx.fillStyle = winner === "candidate" ? candidateColor : theme.muted;
    ctx.textAlign = "left";
    ctx.fillText(formatMetricValue(metric.candidateValue, metric.key), barX + barWidth + 16, barTop + 14);
    ctx.textAlign = "left";
  });

  // La firma solo va en la lámina independiente; incrustada en el reporte,
  // la página ya firma por sí misma.
  if (!forReport) {
    ctx.strokeStyle = theme.line;
    ctx.beginPath();
    ctx.moveTo(70, 1466);
    ctx.lineTo(1530, 1466);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = "700 11px Arial";
    ctx.fillText(t("ELABORADO POR"), 70, 1500);
    ctx.fillStyle = theme.ink;
    ctx.font = "800 19px Arial";
    ctx.fillText("FELIPE ORMAZABAL", 70, 1527);
    ctx.fillStyle = theme.accent;
    ctx.font = "700 11px Arial";
    ctx.fillText("SCOUTING REPORT", 70, 1546);
    if (recipientLogo) drawContain(ctx, recipientLogo, 1170, 1484, 62, 62);
    ctx.fillStyle = theme.muted;
    ctx.font = "700 11px Arial";
    ctx.fillText(t("REPORTE GENERADO PARA"), 1250, 1503);
    ctx.fillStyle = theme.ink;
    ctx.font = "800 18px Arial";
    ctx.fillText(fitText(ctx, recipientName.toUpperCase(), 280), 1250, 1532);
  }
  return canvas.toDataURL("image/png");
}

export function SimilarityStudio({ rows, selectedIndex, sourceName, lang = "es", targets, theme, targetProfile, recipientName, recipientLogoUrl, onSelectTarget, onTargetProfileChange, onRecipientNameChange, onRecipientLogoChange, onOpenReports }: SimilarityStudioProps) {
  const [query, setQuery] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [minimumMinutes, setMinimumMinutes] = useState("500");
  const [passport, setPassport] = useState("");
  const [position, setPosition] = useState("");
  const [secondaryRole, setSecondaryRole] = useState("");
  const [side, setSide] = useState<"" | "left" | "right">("");
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [candidateProfileState, setCandidateProfileState] = useState<TransfermarktProfile>(() => createEmptyTransfermarktProfile());
  const [candidateProfileKey, setCandidateProfileKey] = useState("");
  const [profileBusy, setProfileBusy] = useState<ProfileSide | null>(null);
  const [backgroundBusy, setBackgroundBusy] = useState<ProfileSide | null>(null);
  const [backgroundOriginals, setBackgroundOriginals] = useState<Record<string, string>>({});
  const [profileStatus, setProfileStatus] = useState<Record<ProfileSide, string>>({ target: "", candidate: "" });
  const [targetColorChoice, setTargetColorChoice] = useState("");
  const [candidateColorChoice, setCandidateColorChoice] = useState("#e95b3f");
  const [targetLabelColorChoice, setTargetLabelColorChoice] = useState("");
  const [candidateLabelColorChoice, setCandidateLabelColorChoice] = useState("");
  const [targetLabelTransparency, setTargetLabelTransparency] = useState(82);
  const [candidateLabelTransparency, setCandidateLabelTransparency] = useState(82);
  const [targetPhotoScale, setTargetPhotoScale] = useState(100);
  const [candidatePhotoScale, setCandidatePhotoScale] = useState(100);
  const [metricWeights, setMetricWeights] = useState<SimilarityMetricWeights>({});
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const reportSheetRef = useRef<HTMLElement>(null);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => similarityOptions(rows), [rows]);
  const secondaryOptions = useMemo(() => secondaryRoleOptions(rows, position), [rows, position]);
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
    secondaryRole,
    side,
  }), [ageMax, ageMin, minimumMinutes, passport, position, query, secondaryRole, side]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => buildSimilaritySearch(rows, selectedIndex, filters, metricWeights), [filters, metricWeights, rows, selectedIndex, lang]);
  const candidates = search?.candidates ?? [];
  const activeMetricWeights = search?.target.metrics.filter((metric) => (metricWeights[metric.key] ?? 1) !== 1).length ?? 0;
  const selectedCandidate = candidates.find((candidate) => candidate.index === selectedCandidateIndex) ?? candidates[0] ?? null;
  const activeCandidateKey = selectedCandidate ? profileStorageKey(selectedCandidate.name) : "";
  const candidateProfile = candidateProfileKey === activeCandidateKey ? candidateProfileState : candidateProfileSeed(selectedCandidate);
  const targetColor = targetColorChoice || theme.accent;
  const candidateColor = candidateColorChoice || "#e95b3f";
  const targetLabelColor = targetLabelColorChoice || targetColor;
  const candidateLabelColor = candidateLabelColorChoice || candidateColor;
  const paletteColors = useMemo(() => [...new Set([theme.accent, theme.dark, ...PLAYER_PALETTE])], [theme.accent, theme.dark]);
  const reportRecipient = recipientName.trim() || t("Club destinatario");
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
    setMetricWeights({});
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
    setSecondaryRole("");
    setSide("");
  }

  function updateMetricWeight(key: string, percentage: number) {
    const weight = Math.max(0, Math.min(300, percentage)) / 100;
    setMetricWeights((current) => {
      if (weight === 1) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: weight };
    });
  }

  function resetMetricWeights() {
    setMetricWeights({});
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
    setProfileStatus((status) => ({ ...status, [side]: t("Leyendo datos e imágenes…") }));
    try {
      const result = await fetchTransfermarktProfile(url);
      const populated = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== "" && value !== undefined));
      const next = { ...current, ...populated, sourceUrl: url } as TransfermarktProfile;
      saveProfile(side, playerName, next);
      clearBackgroundOriginal(playerName);
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto, escudo y datos cargados.") }));
    } catch (error) {
      setProfileStatus((status) => ({ ...status, [side]: error instanceof Error ? error.message : t("No se pudo extraer el perfil.") }));
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
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto aplicada desde el enlace. Puedes quitarle el fondo con IA.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("Ingresa un enlace de imagen válido que comience con http:// o https://.") }));
    }
  }

  async function loadPlayerImage(side: ProfileSide, file?: File) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    if (!playerName || !file) return;
    if (!file.type.startsWith("image/")) {
      setProfileStatus((status) => ({ ...status, [side]: t("Selecciona un archivo de imagen PNG, WEBP o JPG.") }));
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      clearBackgroundOriginal(playerName);
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Foto cargada desde el ordenador. Puedes quitarle el fondo con IA.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("No se pudo leer la imagen seleccionada.") }));
    }
  }

  async function removePlayerBackground(side: ProfileSide) {
    const current = side === "target" ? targetProfile : candidateProfile;
    const playerName = side === "target" ? search?.target.player ?? "" : selectedCandidate?.name ?? "";
    const source = current.playerImage.trim();
    if (!playerName || !source) {
      setProfileStatus((status) => ({ ...status, [side]: t("Primero extrae o carga una foto del jugador.") }));
      return;
    }
    setBackgroundBusy(side);
    setProfileStatus((status) => ({ ...status, [side]: t("Preparando el modelo de IA… La primera vez puede tardar.") }));
    try {
      const result = await removePlayerImageBackground({
        playerImage: source,
        onProgress: (key, currentProgress, total) => {
          const percent = total > 0 ? Math.min(100, Math.round(currentProgress / total * 100)) : 0;
          setProfileStatus((status) => ({ ...status, [side]: percent ? tf("Descargando modelo IA · {p}%", { p: percent }) : tf("Preparando {k}…", { k: t(key) }) }));
        },
      });
      const dataUrl = await blobToDataUrl(result);
      const storageKey = profileStorageKey(playerName);
      setBackgroundOriginals((originals) => originals[storageKey] ? originals : { ...originals, [storageKey]: source });
      saveProfile(side, playerName, { ...current, playerImage: dataUrl });
      setProfileStatus((status) => ({ ...status, [side]: t("✓ Fondo eliminado. La foto transparente ya está aplicada al reporte.") }));
    } catch {
      setProfileStatus((status) => ({ ...status, [side]: t("No se pudo eliminar el fondo. Reintenta o utiliza otra imagen.") }));
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
    setProfileStatus((status) => ({ ...status, [side]: t("✓ Imagen original restaurada.") }));
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
      setExportStatus(t("No se pudo descargar esa imagen. Revisa el enlace de Transfermarkt."));
    }
  }

  async function createImage(forReport = false) {
    if (!search?.target || !selectedCandidate) return "";
    return comparisonImage(search.target, selectedCandidate, sourceName, theme, targetProfile, candidateProfile, reportRecipient, recipientLogoUrl.trim(), targetColor, candidateColor, targetLabelColor, candidateLabelColor, targetLabelTransparency, candidateLabelTransparency, forReport, targetPhotoScale, candidatePhotoScale);
  }

  async function exportAssetDataUrl(url: string) {
    if (url.startsWith("data:image/")) return url;
    let parsed: URL;
    try {
      parsed = new URL(url, window.location.href);
    } catch {
      return false;
    }
    const candidates = parsed.protocol === "blob:" || parsed.origin === window.location.origin
      ? [parsed.href]
      : canvasImageCandidates(parsed.href);
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) continue;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) continue;
        return await blobToDataUrl(blob);
      } catch { /* Se intenta el siguiente proxy o fuente disponible. */ }
    }
    return false;
  }

  async function captureReportNode(reportSheet: HTMLElement, scale: number) {
    await document.fonts?.ready;
    await Promise.all(Array.from(reportSheet.querySelectorAll("img")).map(async (image) => {
      try {
        await Promise.race([
          image.decode?.() ?? Promise.resolve(),
          new Promise<void>((resolve) => window.setTimeout(resolve, 10_000)),
        ]);
      } catch { /* La captura conserva el espacio aunque una fuente externa falle. */ }
    }));
    const { domToPng } = await import("modern-screenshot");
    return domToPng(reportSheet, {
      scale,
      backgroundColor: theme.paper,
      timeout: 30_000,
      fetchFn: exportAssetDataUrl,
      fetch: { bypassingCache: true },
      features: { restoreScrollPosition: true },
    });
  }

  async function captureVisibleReport() {
    const reportSheet = reportSheetRef.current;
    if (!reportSheet) throw new Error("report-not-ready");
    return captureReportNode(reportSheet, 2);
  }

  async function downloadComparison() {
    setExportBusy(true);
    try {
      const image = await captureVisibleReport();
      if (!image || !selectedCandidate || !search?.target) return;
      const link = document.createElement("a");
      link.href = image;
      link.download = `${safeFileName(`${t("similitud")}-${search.target.player}-${selectedCandidate.name}`)}.png`;
      link.click();
      setExportStatus(t("✓ PNG exportado exactamente como aparece en el reporte."));
    } catch {
      setExportStatus(t("No se pudo exportar el reporte. Revisa que las imágenes estén disponibles."));
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadComparisonPdf() {
    setExportBusy(true);
    try {
      const image = await captureVisibleReport();
      if (!image || !selectedCandidate || !search?.target || !reportSheetRef.current) return;
      const { jsPDF } = await import("jspdf");
      const reportWidth = reportSheetRef.current.offsetWidth;
      const reportHeight = reportSheetRef.current.offsetHeight;
      const pdf = new jsPDF({
        orientation: reportWidth > reportHeight ? "landscape" : "portrait",
        unit: "px",
        format: [reportWidth, reportHeight],
        compress: true,
        hotfixes: ["px_scaling"],
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      pdf.save(`${safeFileName(`${t("similitud")}-${search.target.player}-${selectedCandidate.name}`)}.pdf`);
      setExportStatus(t("✓ PDF exportado exactamente como aparece en el reporte."));
    } catch {
      setExportStatus(t("No se pudo exportar el reporte. Revisa que las imágenes estén disponibles."));
    } finally {
      setExportBusy(false);
    }
  }

  async function addComparisonToReport() {
    setExportBusy(true);
    try {
      const html = reportContentRef.current?.outerHTML ?? "";
      const image = html ? "" : await createImage(true);
      if ((!html && !image) || !selectedCandidate || !search?.target) return;
      window.localStorage.setItem("fos-scout-similarity-comparison-v1", JSON.stringify({
        html,
        image,
        format: html ? "native-dom-v1" : "legacy-image",
        title: tf("Similitud · {a} vs. {b}", { a: search.target.player, b: selectedCandidate.name }),
        createdAt: Date.now(),
      }));
      setExportStatus(t("✓ Página 2 creada en calidad nativa, con texto y radar vectoriales."));
      onOpenReports();
    } catch {
      setExportStatus(t("No se pudo guardar la comparación. Descárgala como PNG y súbela manualmente."));
    } finally {
      setExportBusy(false);
    }
  }

  return <div className="page-content similarity-page similarity-report-theme" style={reportThemeStyle(theme)}>
    <section className="page-heading">
      <div><span className="kicker">Player similarity report</span><h1>{t("Compara perfiles con el")} <span>{t("mismo lenguaje del reporte.")}</span></h1><p>{t("Ranking, radar superpuesto, imágenes de Transfermarkt y una lámina lista para presentar.")}</p><div className="heading-chips"><span>{t("Radar P0–P100")}</span><span>Transfermarkt</span><span>{t("Exportación PNG / PDF")}</span></div></div>
      <div className="heading-actions"><button className="button secondary" onClick={onOpenReports}><BarChart3 size={16} /> {t("Volver al reporte")}</button></div>
    </section>

    {!rows.length || !search ? <section className="dataset-onboarding similarity-empty"><span className="dataset-step">{t("SECCIÓN DE SIMILITUD")}</span><span className="dataset-icon"><Search size={30} /></span><h2>{t("Primero carga una base de datos")}</h2><p>{t("La comparación usa la base activa, ya sea una liga, temporada o combinación.")}</p><button className="button primary" onClick={onOpenReports}>{t("Ir a cargar datos")}</button></section> : <>
      <section className="similarity-target-bar">
        <div className="similarity-target-copy"><span>{t("JUGADOR OBJETIVO")}</span><b>{search.target.player}</b><small>{tf("{team} · {pos} · {age} años", { team: search.target.team, pos: search.target.position, age: search.target.age })}</small></div>
        <div className="similarity-target-selectors">
          <label><span>{t("1 · Club")}</span><select value={selectedTargetTeam} onChange={(event) => chooseTargetTeam(event.target.value)}>{targetTeams.map((team) => <option key={team} value={team}>{team}</option>)}</select></label>
          <label><span>{t("2 · Jugador")}</span><select value={selectedIndex} onChange={(event) => chooseTarget(Number(event.target.value))}>{targetPlayers.map((target) => <option key={`${target.index}-${target.player}`} value={target.index}>{target.player}</option>)}</select></label>
        </div>
        <div className="similarity-model-badge"><Sparkles size={16} /><span><b>{t("BASELINE ESTADÍSTICO")}</b><small>{t("Percentiles + contexto de edad y rol")}</small></span></div>
      </section>

      <section className="similarity-weight-panel">
        <header>
          <div><span>{t("PONDERACIÓN PERSONALIZADA")}</span><h2>{t("Importancia de las métricas")}</h2><p>{t("100% mantiene el peso normal. Sube una métrica para que influya más en el ranking o llévala a 0% para excluirla.")}</p></div>
          <button type="button" onClick={resetMetricWeights} disabled={!activeMetricWeights}><RotateCcw size={14} /> {t("Restablecer pesos")}</button>
        </header>
        <div className="similarity-weight-grid">
          {search.target.metrics.map((metric) => {
            const weight = metricWeights[metric.key] ?? 1;
            const percentage = Math.round(weight * 100);
            const group = similarityMetricGroup(metric, search.target.cohort);
            return <label className={weight !== 1 ? "weighted" : ""} style={{ "--metric-weight-color": group.color } as CSSProperties} key={metric.key}>
              <span><i /><b>{t(metric.label)}</b><output>{percentage === 0 ? t("Sin influencia") : `${percentage}%`}</output></span>
              <input type="range" min="0" max="300" step="25" value={percentage} onChange={(event) => updateMetricWeight(metric.key, Number(event.target.value))} aria-label={tf("Peso de {m}: {p}%", { m: t(metric.label), p: percentage })} />
              <small><span>0%</span><span>{t("Neutral 100%")}</span><span>{t("Máx. 300%")}</span></small>
            </label>;
          })}
        </div>
      </section>

      <div className="similarity-workspace">
        <aside className="similarity-filter-panel">
          <div className="similarity-panel-title"><div><Search size={17} /><span><b>{t("Red de filtros")}</b><small>{tf("{n} coincidencias", { n: candidates.length })}</small></span></div><button onClick={resetFilters} aria-label={t("Restablecer filtros")}><RotateCcw size={14} /></button></div>
          <label><span>{t("Buscar jugador o club")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Escribe un nombre…")} /></label>
          <div className="similarity-age-fields"><label><span>{t("Edad mínima")}</span><input type="number" min="14" max="50" value={ageMin} onChange={(event) => setAgeMin(event.target.value)} placeholder={t("Todas")} /></label><label><span>{t("Edad máxima")}</span><input type="number" min="14" max="50" value={ageMax} onChange={(event) => setAgeMax(event.target.value)} placeholder={t("Todas")} /></label></div>
          <label><span>{t("Mínimo de minutos")}</span><input type="number" min="0" step="100" value={minimumMinutes} onChange={(event) => setMinimumMinutes(event.target.value)} /></label>
          <label><span>{t("Pasaporte · principal o secundario")}</span><select value={passport} onChange={(event) => setPassport(event.target.value)}><option value="">{t("Todos los pasaportes")}</option>{options.passports.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>{t("Rol principal")}</span><select value={position} onChange={(event) => { setPosition(event.target.value); setSecondaryRole(""); }}><option value="">{t("Todos los roles")}</option>{options.positions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>{t("Rol secundario · según el primer filtro")}</span><select value={secondaryRole} onChange={(event) => setSecondaryRole(event.target.value)} disabled={!secondaryOptions.length}><option value="">{t("Cualquiera")}</option>{secondaryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>{t("Lado del campo · prefijo L / R")}</span><select value={side} onChange={(event) => setSide(event.target.value as "" | "left" | "right")}><option value="">{t("Cualquiera")}</option><option value="left">{t("Izquierdo (L)")}</option><option value="right">{t("Derecho (R)")}</option></select></label>
          <div className="similarity-method-note"><b>{t("Motor actual: baseline")}</b><p>{t("Esta comparación es explicable y funciona con Excel agregados. RisingBALLER–Wyscout podrá reemplazar el vector cuando existan datos por partido.")}</p></div>
          <div className="similarity-recipient-editor">
            <span>{t("REPORTE GENERADO PARA")}</span>
            <input value={recipientName} onChange={(event) => onRecipientNameChange(event.target.value)} placeholder={t("Nombre del club")} aria-label={t("Nombre del club destinatario")} />
            <input type="url" value={recipientLogoUrl} onChange={(event) => onRecipientLogoChange(event.target.value)} placeholder="https://logo-del-club.png" aria-label={t("Link del logo del club destinatario")} />
            <small>{recipientLogoReady ? t("✓ Logo aplicado a la comparación.") : t("El logo es independiente de los clubes comparados.")}</small>
          </div>
        </aside>

        <main className="similarity-results">
          <section className="similarity-ranking-card">
            <div className="similarity-results-head"><div><span>{t("LISTADO DE JUGADORES")}</span><h2>{t("Ranking de similitud")}</h2></div><small>{activeMetricWeights ? tf("{n} métrica{s} con peso personalizado", { n: activeMetricWeights, s: activeMetricWeights === 1 ? "" : "s" }) : t("Todas las métricas tienen peso neutral")}</small></div>
            {candidates.length ? <div className="similarity-table-wrap"><table className="similarity-table"><thead><tr><th>#</th><th>{t("Jugador")}</th><th>{t("Posiciones")}</th><th>{t("Edad")}</th><th>{t("Minutos")}</th><th>{t("Pasaporte")}</th><th>{t("Similitud")}</th><th /></tr></thead><tbody>{candidates.slice(0, 150).map((candidate, index) => <tr key={candidate.index} className={selectedCandidate?.index === candidate.index ? "selected" : ""}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{candidate.name}</b><small>{candidate.team}</small></td><td><PositionRoles positions={candidate.positions} /></td><td>{candidate.age ?? "—"}</td><td>{Math.round(candidate.minutes).toLocaleString(numberLocale())}</td><td>{candidate.passport}</td><td><span className="similarity-score-pill">{candidate.similarity}%</span></td><td><button onClick={() => chooseCandidate(candidate)}>{t("Comparar")}</button></td></tr>)}</tbody></table></div> : <div className="similarity-no-results"><Search size={24} /><b>{t("No hay jugadores con estos filtros")}</b><span>{t("Reduce los requisitos de edad, minutos, pasaporte o posición.")}</span></div>}
          </section>

          {selectedCandidate && <>
            <section className="similarity-enrichment-grid">
              <ProfileEnrichment side="target" label={t("Jugador objetivo")} player={search.target.player} color={targetColor} profile={targetProfile} busy={profileBusy === "target"} backgroundBusy={backgroundBusy === "target"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(search.target.player)])} status={profileStatus.target} onExtract={(url) => extractProfile("target", url)} onImageUrl={(url) => applyPlayerImageUrl("target", url)} onImageFile={(file) => loadPlayerImage("target", file)} onRemoveBackground={() => removePlayerBackground("target")} onRestoreBackground={() => restorePlayerBackground("target")} onDownload={downloadAsset} />
              <ProfileEnrichment side="candidate" label={t("Jugador comparable")} player={selectedCandidate.name} color={candidateColor} profile={candidateProfile} busy={profileBusy === "candidate"} backgroundBusy={backgroundBusy === "candidate"} locked={profileBusy !== null || backgroundBusy !== null} canRestore={Boolean(backgroundOriginals[profileStorageKey(selectedCandidate.name)])} status={profileStatus.candidate} onExtract={(url) => extractProfile("candidate", url)} onImageUrl={(url) => applyPlayerImageUrl("candidate", url)} onImageFile={(file) => loadPlayerImage("candidate", file)} onRemoveBackground={() => removePlayerBackground("candidate")} onRestoreBackground={() => restorePlayerBackground("candidate")} onDownload={downloadAsset} />
            </section>

            <section className="similarity-color-panel">
              <div className="similarity-color-heading"><span>{t("PALETA DE COMPARACIÓN")}</span><b>{t("Personaliza jugadores y labels")}</b><small>{t("Define el color del jugador, el color del label de percentil y la transparencia de su fondo.")}</small></div>
              <PalettePicker label={t("Jugador objetivo")} player={search.target.player} color={targetColor} labelColor={targetLabelColor} labelTransparency={targetLabelTransparency} photoScale={targetPhotoScale} colors={paletteColors} onChange={setTargetColorChoice} onLabelColorChange={setTargetLabelColorChoice} onLabelTransparencyChange={setTargetLabelTransparency} onPhotoScaleChange={setTargetPhotoScale} />
              <PalettePicker label={t("Jugador comparable")} player={selectedCandidate.name} color={candidateColor} labelColor={candidateLabelColor} labelTransparency={candidateLabelTransparency} photoScale={candidatePhotoScale} colors={paletteColors} onChange={setCandidateColorChoice} onLabelColorChange={setCandidateLabelColorChoice} onLabelTransparencyChange={setCandidateLabelTransparency} onPhotoScaleChange={setCandidatePhotoScale} />
            </section>

            <section ref={reportSheetRef} className="similarity-report-sheet">
              <div ref={reportContentRef} className="similarity-report-main">
                <header className="similarity-report-header duel-header">
                  <div className="duel-header-player left" style={{ "--player-color": targetColor } as CSSProperties}><span>{t("JUGADOR OBJETIVO")}</span><b>{search.target.player}</b></div>
                  <div className="duel-header-center"><SimilarityStarScore similarity={selectedCandidate.similarity} /><small><span className="report-lupa"><Search size={9} /></span> {t("COMPARACIÓN DE JUGADORES")} · {tf("Percentiles posicionales · {src}", { src: t(sourceName) })}</small></div>
                  <div className="duel-header-player right" style={{ "--player-color": candidateColor } as CSSProperties}><span>{t("JUGADOR COMPARABLE")}</span><b>{selectedCandidate.name}</b></div>
                </header>
                <div className="similarity-report-body">
                  <div className="similarity-showdown">
                    <ComparisonPlayer profile={targetProfile} name={search.target.player} team={search.target.team} position={search.target.position} age={search.target.age} passport={search.target.passport} label={t("JUGADOR OBJETIVO")} color={targetColor} photoScale={targetPhotoScale} />
                    <div className="similarity-radar-column"><ComparisonRadar metrics={selectedCandidate.metrics} metricCohort={search.target.cohort} targetName={search.target.player} candidateName={selectedCandidate.name} targetColor={targetColor} candidateColor={candidateColor} targetLabelColor={targetLabelColor} candidateLabelColor={candidateLabelColor} targetLabelTransparency={targetLabelTransparency} candidateLabelTransparency={candidateLabelTransparency} /><MetricGroupLegend metrics={selectedCandidate.metrics} cohort={search.target.cohort} /></div>
                    <ComparisonPlayer profile={candidateProfile} name={selectedCandidate.name} team={selectedCandidate.team} position={selectedCandidate.position} age={selectedCandidate.age === null ? "—" : String(selectedCandidate.age)} passport={selectedCandidate.passport} label={t("JUGADOR COMPARABLE")} color={candidateColor} photoScale={candidatePhotoScale} />
                  </div>
                  <div className="similarity-metric-section"><div className="similarity-metric-head"><span style={{ color: targetColor }}>{search.target.player}</span><b>{t("COMPARATIVA MÉTRICA A MÉTRICA")}</b><span style={{ color: candidateColor }}>{selectedCandidate.name}</span></div><div className="metric-comparison-list">{selectedCandidate.metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} targetName={search.target.player} candidateName={selectedCandidate.name} targetColor={targetColor} candidateColor={candidateColor} />)}</div></div>
                </div>
              </div>
              <footer className="dossier-footer similarity-report-footer"><p>{tf("Percentiles P0–P100 · métricas comunes {n}% · {w}.", { n: selectedCandidate.coverage, w: activeMetricWeights ? tf("{n} ponderaciones personalizadas activas", { n: activeMetricWeights }) : t("pesos métricos uniformes") })}</p><div className="report-signatures"><div className="report-author"><span>{t("ELABORADO POR")}</span><b>FELIPE ORMAZABAL</b><small>SCOUTING REPORT</small></div><div className="report-recipient">{recipientLogoReady ? <ReportImage src={recipientLogoUrl.trim()} alt={reportRecipient} className="dossier-footer-club-logo" /> : <span className="dossier-footer-club-fallback">{reportRecipient.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<div><span>{t("REPORTE GENERADO PARA")}</span><b>{reportRecipient}</b></div></div></div></footer>
            </section>

            <div className="comparison-actions"><button className="button secondary" onClick={() => void downloadComparison()} disabled={exportBusy}><ArrowDownToLine size={16} /> {exportBusy ? t("Preparando…") : t("Descargar PNG")}</button><button className="button secondary" onClick={() => void downloadComparisonPdf()} disabled={exportBusy}><Printer size={16} /> {exportBusy ? t("Preparando…") : t("Descargar PDF")}</button><button className="button primary" onClick={() => void addComparisonToReport()} disabled={exportBusy}><ImageIcon size={16} /> {t("Usar como Página 2 · calidad nativa")}</button></div>
            {exportStatus && <p className="similarity-export-status" aria-live="polite">{exportStatus}</p>}
          </>}
        </main>
      </div>
    </>}
  </div>;
}

function SimilarityStarScore({ similarity }: { similarity: number }) {
  const percentage = Math.min(Math.max(Math.round(similarity), 0), 100);
  const glow = similarityStarGlow(percentage);
  const isNearHundred = percentage >= 95;
  const reduceMotion = useReducedMotion();

  return <div className="similarity-star-score" role="img" aria-label={tf("{p}% de similitud", { p: percentage })}>
    <div className="similarity-star-visual">
      <motion.svg
        viewBox="-2 -2 28 28"
        aria-hidden="true"
        initial={false}
        animate={{
          filter: `drop-shadow(0 0 ${2 + glow * 22}px rgba(250,204,21,${Math.min(1, glow * 1.1)})) drop-shadow(0 0 ${1 + glow * 8}px rgba(255,240,158,${glow * .85}))`,
          scale: !reduceMotion && isNearHundred ? [1, 1.07, 1] : 1,
        }}
        transition={{
          filter: { duration: .45, ease: "easeOut" },
          scale: { duration: 1.25, repeat: !reduceMotion && isNearHundred ? Infinity : 0, ease: "easeInOut" },
        }}
      >
        <motion.path
          d={STAR_PATH}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ fill: similarityStarColor(percentage) }}
          transition={{ duration: .55, ease: "easeOut" }}
        />
      </motion.svg>
      <span className="similarity-star-number"><b>{percentage}</b><small>%</small></span>
    </div>
    <span className="similarity-star-label">{t("similitud")}</span>
  </div>;
}

function ProfileEnrichment({ side, label, player, color, profile, busy, backgroundBusy, locked, canRestore, status, onExtract, onImageUrl, onImageFile, onRemoveBackground, onRestoreBackground, onDownload }: { side: ProfileSide; label: string; player: string; color: string; profile: TransfermarktProfile; busy: boolean; backgroundBusy: boolean; locked: boolean; canRestore: boolean; status: string; onExtract: (url: string) => void; onImageUrl: (url: string) => void; onImageFile: (file?: File) => void; onRemoveBackground: () => void; onRestoreBackground: () => void; onDownload: (src: string, name: string) => void }) {
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
  return <article className="similarity-enrichment-card" style={{ "--player-color": color } as CSSProperties}>
    <div className="enrichment-profile-preview">{profile.playerImage ? <ReportImage src={profile.playerImage} alt={player} className="enrichment-player-image" /> : <span>{player.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}{profile.clubLogo && <ReportImage src={profile.clubLogo} alt={profile.club || t("Club")} className="enrichment-club-logo" />}</div>
    <div className="enrichment-profile-copy">
      <span>{label}</span><b>{player}</b><small>{profile.club || t("Agrega Transfermarkt para cargar club, foto y escudo")}</small>
      <ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="enrichment-transfermarkt-logo" />
      <form key={`${side}-${player}-${profile.sourceUrl}`} onSubmit={submit}><input name="transfermarktUrl" type="url" required defaultValue={profile.sourceUrl} placeholder="https://www.transfermarkt.com/..." aria-label={tf("Link de Transfermarkt de {p}", { p: player })} /><button type="submit" disabled={locked}><Sparkles size={13} /> {busy ? t("Extrayendo…") : t("Extraer imágenes")}</button></form>
      <form className="enrichment-image-source" key={`${side}-${player}-${remotePlayerImage || "local"}`} onSubmit={submitImageUrl}>
        <span>{t("FOTO DEL JUGADOR · LINK O ARCHIVO")}</span>
        <input name="playerImageUrl" type="url" required defaultValue={remotePlayerImage} placeholder="https://imagen-del-jugador.png" aria-label={tf("Link directo de la foto de {p}", { p: player })} />
        <button type="submit" disabled={locked}>{t("Usar link")}</button>
        <label><Upload size={12} /><span>{t("Ordenador")}</span><input type="file" accept="image/png,image/webp,image/jpeg" hidden disabled={locked} onChange={(event) => { onImageFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </form>
      {status && <p aria-live="polite">{status}</p>}
      <div className="enrichment-background-tools"><button type="button" onClick={onRemoveBackground} disabled={locked || !profile.playerImage}><Sparkles size={12} /> {backgroundBusy ? t("Quitando fondo…") : t("Quitar fondo solo a la foto")}</button>{canRestore && <button className="restore" type="button" onClick={onRestoreBackground} disabled={locked}>{t("Restaurar original")}</button>}</div>
      <small className="enrichment-background-note">{t("El escudo conserva siempre su fondo original.")}</small>
      <div className="enrichment-downloads"><button type="button" disabled={!profile.playerImage || backgroundBusy} onClick={() => onDownload(profile.playerImage, `${player}-${t("foto")}`)}>{t("⇩ Foto")}</button><button type="button" disabled={!profile.clubLogo || backgroundBusy} onClick={() => onDownload(profile.clubLogo, `${profile.club || player}-${t("escudo")}`)}>{t("⇩ Escudo")}</button></div>
    </div>
  </article>;
}

function ComparisonPlayer({ profile, name, team, position, age, passport, label, color, photoScale = 100 }: { profile: TransfermarktProfile; name: string; team: string; position: string; age: string; passport: string; label: string; color: string; photoScale?: number }) {
  return <article className="comparison-player-card" style={{ "--player-color": color } as CSSProperties}><header><span>{label}</span>{profile.clubLogo ? <ReportImage src={profile.clubLogo} alt={profile.club || team} className="comparison-club-logo" /> : <span className="comparison-club-fallback">{team.slice(0, 2).toUpperCase()}</span>}</header><div className="comparison-player-portrait">{profile.playerImage ? <span className="comparison-player-photo-frame" style={{ "--photo-scale": photoScale / 100 } as CSSProperties}><ReportImage src={profile.playerImage} alt={name} className="comparison-player-image" /></span> : <span>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}</div><div className="comparison-player-copy"><h3>{name}</h3><b>{profile.club || team}</b><p>{formatPlayerPositions(profile.position || position)}</p><small>{tf("{age} años · {passport}", { age: profile.age || age, passport: profile.citizenship || passport })}</small>{profile.marketValue && <strong className="comparison-market-value"><span>{profile.marketValue}</span><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="comparison-transfermarkt-logo" /></strong>}</div></article>;
}

function PalettePicker({ label, player, color, labelColor, labelTransparency, photoScale = 100, colors, onChange, onLabelColorChange, onLabelTransparencyChange, onPhotoScaleChange }: { label: string; player: string; color: string; labelColor: string; labelTransparency: number; photoScale?: number; colors: string[]; onChange: (color: string) => void; onLabelColorChange: (color: string) => void; onLabelTransparencyChange: (value: number) => void; onPhotoScaleChange?: (value: number) => void }) {
  const labelOpacity = `${100 - labelTransparency}%`;
  return <div className="similarity-palette-picker">
    <div><span>{label}</span><b><i style={{ backgroundColor: color }} />{player}</b></div>
    <div className="similarity-palette-swatches">{colors.map((option) => <button key={option} type="button" className={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en") ? "selected" : ""} style={{ "--swatch": option } as CSSProperties} aria-label={tf("Asignar color {c} a {p}", { c: option, p: player })} aria-pressed={option.toLocaleLowerCase("en") === color.toLocaleLowerCase("en")} onClick={() => onChange(option)}><span /></button>)}<label><span>{t("Personalizado")}</span><input type="color" value={color} onChange={(event) => onChange(event.target.value)} aria-label={tf("Color personalizado para {p}", { p: player })} /></label></div>
    <div className="similarity-percentile-style">
      <span>{t("LABEL DE PERCENTIL")}</span>
      <output style={{ "--label-preview-color": labelColor, "--label-preview-opacity": labelOpacity } as CSSProperties}>P85</output>
      <label className="label-color-control"><span>{t("Color")}</span><input type="color" value={labelColor} onChange={(event) => onLabelColorChange(event.target.value)} aria-label={tf("Color del label de percentil de {p}", { p: player })} /></label>
      <label className="label-transparency-control"><span>{t("Transparencia del fondo")} <b>{labelTransparency}%</b></span><input type="range" min="0" max="100" step="1" value={labelTransparency} onChange={(event) => onLabelTransparencyChange(Number(event.target.value))} aria-label={tf("Transparencia del label de percentil de {p}", { p: player })} /></label>
    </div>
    {onPhotoScaleChange && <label className="photo-scale-control"><span>{t("Tamaño de la foto")} <b>{photoScale}%</b></span><input type="range" min="60" max="140" step="5" value={photoScale} onChange={(event) => onPhotoScaleChange(Number(event.target.value))} aria-label={tf("Tamaño de la foto de {p}", { p: player })} /></label>}
  </div>;
}

function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Las imágenes provienen de Transfermarkt o de un enlace elegido por el usuario.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

function PositionRoles({ positions }: { positions: PlayerPosition[] }) {
  if (!positions.length) return <span>—</span>;
  return <div className="position-role-list">{positions.map((position, index) => <span key={`${position.code}-${index}`}><em>{index === 0 ? t("1ª") : index === 1 ? t("2ª") : index === 2 ? t("3ª") : tf("{n}ª", { n: index + 1 })}</em><b>{position.role}</b><small>{position.code}</small></span>)}</div>;
}

function MetricGroupLegend({ metrics, cohort }: { metrics: SimilarityMetricComparison[]; cohort: string }) {
  // Solo se listan los grupos con métricas presentes en este radar.
  const present = SIMILARITY_METRIC_GROUPS.filter((group) => metrics.some((metric) => similarityMetricGroup(metric, cohort).id === group.id));
  return <div className="similarity-metric-group-legend" aria-label={t("Leyenda de grupos métricos")}>
    {present.map((group) => <span key={group.id}><i style={{ "--metric-group-color": group.color } as CSSProperties} /><b>{t(group.label)}</b></span>)}
  </div>;
}

function MetricComparison({ metric, targetName, candidateName, targetColor, candidateColor }: { metric: SimilarityMetricComparison; targetName: string; candidateName: string; targetColor: string; candidateColor: string }) {
  // Duelo con una sola barra compartida: cada lado ocupa su proporción de
  // percentil y el jugador con mejor registro queda saturado; el otro,
  // atenuado. Los nombres viven solo en el encabezado de la sección.
  const targetValue = formatMetricValue(metric.targetValue, metric.key);
  const candidateValue = formatMetricValue(metric.candidateValue, metric.key);
  const total = metric.targetPercentile + metric.candidatePercentile;
  const targetShare = total > 0 ? (metric.targetPercentile / total) * 100 : 50;
  const winner = metric.targetPercentile > metric.candidatePercentile ? "target" : metric.candidatePercentile > metric.targetPercentile ? "candidate" : "tie";
  return <div className={`metric-duel winner-${winner}`} style={{ "--target-color": targetColor, "--candidate-color": candidateColor, "--target-share": `${targetShare}%` } as CSSProperties} aria-label={`${t(metric.label)} — ${targetName}: ${targetValue}; ${candidateName}: ${candidateValue}`}>
    <div className="metric-duel-head"><span>{t(metric.label)}</span>{metric.weight !== 1 && <small>{metric.weight === 0 ? t("Sin influencia") : tf("Peso {p}%", { p: Math.round(metric.weight * 100) })}</small>}</div>
    <div className="metric-duel-row">
      <b className={`duel-value target ${winner === "target" ? "win" : ""}`}>{targetValue}</b>
      <div className="metric-duel-bar"><i className="duel-side target" /><i className="duel-side candidate" /></div>
      <b className={`duel-value candidate ${winner === "candidate" ? "win" : ""}`}>{candidateValue}</b>
    </div>
  </div>;
}
