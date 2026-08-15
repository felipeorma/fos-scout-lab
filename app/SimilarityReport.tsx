"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { ComparisonRadar } from "./ComparisonRadar";
import { Search } from "./Icons";
import { formatPlayerPositions } from "@/lib/positions";
import { framePhotoTransform, opaqueBounds } from "@/lib/photoFraming";
import { similarityMetricDensity } from "@/lib/reportPageLayout";
import { formatCell } from "@/lib/scouting";
import { type SimilarityMetricComparison } from "@/lib/similarity";
import { SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { t, tDefault, tf } from "@/lib/i18n";
import { type TransfermarktProfile } from "@/lib/transfermarkt";

const TRANSFERMARKT_LOGO = process.env.NEXT_PUBLIC_GITHUB_PAGES === "true"
  ? "/fos-scout-lab/tm_logo.svg"
  : "/tm_logo.svg";
const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
const STAR_DIM = [56, 66, 88];
const STAR_GOLD = [250, 204, 21];
const STAR_INCANDESCENT = [255, 240, 158];

export type SimilarityReportPlayer = {
  profile: TransfermarktProfile;
  name: string;
  team: string;
  position: string;
  age: string;
  passport: string;
  color: string;
  labelColor: string;
  labelTransparency: number;
  photoScale: number;
  /** cómo encaja la foto en su marco: completa, recortada o encuadre automático */
  photoFit?: "auto" | "contain" | "cover";
};

export type SimilarityReportPayload = {
  version: 2;
  sourceName: string;
  metricCohort: string;
  similarity: number;
  target: SimilarityReportPlayer;
  candidate: SimilarityReportPlayer;
  metrics: SimilarityMetricComparison[];
};

export function isSimilarityReportPayload(value: unknown): value is SimilarityReportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SimilarityReportPayload>;
  const validPlayer = (player: unknown) => {
    if (!player || typeof player !== "object") return false;
    const item = player as Partial<SimilarityReportPlayer>;
    return typeof item.name === "string"
      && typeof item.team === "string"
      && typeof item.position === "string"
      && typeof item.age === "string"
      && typeof item.passport === "string"
      && typeof item.color === "string"
      && typeof item.labelColor === "string"
      && typeof item.labelTransparency === "number"
      && typeof item.photoScale === "number"
      && Boolean(item.profile && typeof item.profile === "object");
  };
  return payload.version === 2
    && typeof payload.sourceName === "string"
    && typeof payload.metricCohort === "string"
    && typeof payload.similarity === "number"
    && validPlayer(payload.target)
    && validPlayer(payload.candidate)
    && Array.isArray(payload.metrics);
}

export function similarityStarColor(percentage: number) {
  const blend = (from: number[], to: number[], amount: number) =>
    `rgb(${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount)).join(", ")})`;
  if (percentage <= 70) return blend(STAR_DIM, STAR_GOLD, percentage / 70);
  return blend(STAR_GOLD, STAR_INCANDESCENT, (percentage - 70) / 30);
}

export function similarityStarGlow(percentage: number) {
  return Math.pow(percentage / 100, 2.4);
}

function formatMetricValue(value: number, key: string) {
  return `${formatCell(value)}${key.includes("%") ? "%" : ""}`;
}

function ReportImage({ src, alt, className, style }: { src: string; alt: string; className: string; style?: CSSProperties }) {
  // Images come from Transfermarkt or from a source selected by the user.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} />;
}

function SimilarityStarScore({ similarity }: { similarity: number }) {
  const percentage = Math.min(Math.max(Math.round(similarity), 0), 100);
  const glow = similarityStarGlow(percentage);
  const isNearHundred = percentage >= 95;
  const reduceMotion = useReducedMotion();
  const id = useId().replace(/:/g, "");
  const starTop = 1.75;
  const starHeight = 19.5;
  const fillHeight = starHeight * percentage / 100;
  const fillTop = starTop + starHeight - fillHeight;
  const starColor = similarityStarColor(percentage);

  return <div
    className="similarity-star-score"
    role="img"
    aria-label={tf("{p}% de similitud", { p: percentage })}
    style={{
      "--similarity-glow": glow,
    } as CSSProperties}
  >
    <div className="similarity-star-visual">
      <motion.svg
        viewBox="-3 -3 30 30"
        aria-hidden="true"
        initial={false}
        animate={{
          filter: `drop-shadow(0 0 ${1 + glow * 18}px rgba(250,204,21,${Math.min(.94, .14 + glow * .8)})) drop-shadow(0 0 ${glow * 7}px rgba(255,248,202,${glow * .72}))`,
          scale: !reduceMotion && isNearHundred ? [1, 1.07, 1] : 1,
        }}
        transition={{
          filter: { duration: .45, ease: "easeOut" },
          scale: { duration: 1.25, repeat: !reduceMotion && isNearHundred ? Infinity : 0, ease: "easeInOut" },
        }}
      >
        <defs>
          <linearGradient id={`${id}-star-fill`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={starColor} />
            <stop offset="68%" stopColor={starColor} />
            <stop offset="100%" stopColor={percentage >= 90 ? "#fffbe4" : "#fde68a"} />
          </linearGradient>
          <clipPath id={`${id}-star-progress`}>
            <rect x="0" y={fillTop} width="24" height={fillHeight} />
          </clipPath>
        </defs>
        <path className="similarity-star-track" d={STAR_PATH} />
        <path
          className="similarity-star-fill"
          d={STAR_PATH}
          fill={`url(#${id}-star-fill)`}
          clipPath={`url(#${id}-star-progress)`}
        />
        <path className="similarity-star-outline" d={STAR_PATH} />
      </motion.svg>
      <span className="similarity-star-number"><b>{percentage}</b><small>%</small></span>
    </div>
    <span className="similarity-star-label">{t("similitud")}</span>
  </div>;
}

/**
 * Encuadra la foto midiendo dónde está realmente el jugador dentro del lienzo.
 * Si la imagen no se puede leer (otro origen sin CORS), se deja el encuadre
 * clásico y la foto sigue viéndose.
 */
function PlayerPortrait({ src, alt, photoScale, fit = "auto" }: { src: string; alt: string; photoScale: number; fit?: "auto" | "contain" | "cover" }) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frame = frameRef.current;
    if (!src || !frame || fit !== "auto") return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const box = opaqueBounds(data, canvas.width, canvas.height);
        if (!box) return;
        const rect = frame.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const { scale, translateX, translateY } = framePhotoTransform(box, rect.width, rect.height, photoScale / 100);
        if (cancelled) return;
        setStyle({
          width: canvas.width,
          height: canvas.height,
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: "0 0",
        });
      } catch { /* imagen de otro origen: encuadre clásico */ }
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src, photoScale, fit]);

  return <span ref={frameRef} className={`comparison-player-photo-frame fit-${fit} ${style ? "is-framed" : ""}`} style={style ? undefined : { "--photo-scale": photoScale / 100 } as CSSProperties}>
    <ReportImage src={src} alt={alt} className="comparison-player-image" style={style ?? undefined} />
  </span>;
}

function HeaderPlayer({ player, label, side }: { player: SimilarityReportPlayer; label: string; side: "left" | "right" }) {
  const { profile, name, team, position, age, passport, color, photoScale, photoFit } = player;
  return <div className={`duel-header-player ${side}`} style={{ "--player-color": color } as CSSProperties}>
    <div className="duel-header-photo">
      <span className="duel-header-glow" aria-hidden="true" />
      {profile.clubLogo && <ReportImage src={profile.clubLogo} alt={profile.club || team} className="duel-header-crest" />}
      {profile.number && <b className="duel-header-number">#{profile.number}</b>}
      {profile.playerImage
        ? <PlayerPortrait key={`${profile.playerImage.slice(-40)}-${photoScale}-${photoFit ?? "auto"}`} src={profile.playerImage} alt={name} photoScale={photoScale} fit={photoFit ?? "auto"} />
        : <span className="duel-header-initials">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}
    </div>
    <div className="duel-header-copy">
      <span className="duel-header-role">{label}</span>
      <b>{name}</b>
      {!profile.clubLogo && <em className="duel-header-club"><span>{profile.club || team}</span></em>}
      <small>{formatPlayerPositions(profile.position || position)}</small>
      <small>{tf("{age} años · {passport}", { age: profile.age || age, passport: profile.citizenship || passport })}</small>
      {profile.marketValue && <strong className="duel-header-value">{profile.marketValue}<ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="duel-header-tm" /></strong>}
    </div>
  </div>;
}

function MetricGroupLegend({ metrics, cohort }: { metrics: SimilarityMetricComparison[]; cohort: string }) {
  const present = SIMILARITY_METRIC_GROUPS.filter((group) => metrics.some((metric) => similarityMetricGroup(metric, cohort).id === group.id));
  return <div className="similarity-metric-group-legend" aria-label={t("Leyenda de grupos métricos")}>
    {present.map((group) => <span key={group.id}><i style={{ "--metric-group-color": group.color } as CSSProperties} /><b>{t(group.label)}</b></span>)}
  </div>;
}

function MetricComparison({ metric, cohort, targetName, candidateName, targetColor, candidateColor }: { metric: SimilarityMetricComparison; cohort: string; targetName: string; candidateName: string; targetColor: string; candidateColor: string }) {
  const targetValue = formatMetricValue(metric.targetValue, metric.key);
  const candidateValue = formatMetricValue(metric.candidateValue, metric.key);
  const total = metric.targetPercentile + metric.candidatePercentile;
  const targetShare = total > 0 ? (metric.targetPercentile / total) * 100 : 50;
  const winner = metric.targetPercentile > metric.candidatePercentile ? "target" : metric.candidatePercentile > metric.targetPercentile ? "candidate" : "tie";
  // Las métricas llegan agrupadas por categoría; el filete del color de su
  // grupo hace visible dónde termina una y empieza la siguiente sin gastar
  // alto de hoja.
  const group = similarityMetricGroup(metric, cohort);
  return <div className={`metric-duel winner-${winner}`} style={{ "--target-color": targetColor, "--candidate-color": candidateColor, "--target-share": `${targetShare}%`, "--metric-group-color": group.color } as CSSProperties} aria-label={`${t(metric.label)} - ${targetName}: ${targetValue}; ${candidateName}: ${candidateValue}`}>
    <div className="metric-duel-head"><span>{t(metric.label)}</span>{metric.weight !== 1 && <small>{metric.weight === 0 ? t("Sin influencia") : tf("Peso {p}%", { p: Math.round(metric.weight * 100) })}</small>}</div>
    <div className="metric-duel-row">
      <b className={`duel-value target ${winner === "target" ? "win" : ""}`}>{targetValue}</b>
      <div className="metric-duel-bar"><i className="duel-side target" /><i className="duel-side candidate" /></div>
      <b className={`duel-value candidate ${winner === "candidate" ? "win" : ""}`}>{candidateValue}</b>
    </div>
  </div>;
}

export function SimilarityReportMain({ payload }: { payload: SimilarityReportPayload }) {
  const { target, candidate, metrics } = payload;
  return <div className="similarity-report-main" data-metric-density={similarityMetricDensity(metrics.length)}>
    <header className="similarity-report-header duel-header">
      <HeaderPlayer player={target} label={t("JUGADOR OBJETIVO")} side="left" />
      <div className="duel-header-center"><SimilarityStarScore similarity={payload.similarity} /><small><span className="report-lupa"><Search size={9} /></span> {t("COMPARACIÓN DE JUGADORES")} · {tf("Percentiles posicionales · {src}", { src: tDefault(payload.sourceName) })}</small></div>
      <HeaderPlayer player={candidate} label={t("JUGADOR COMPARABLE")} side="right" />
    </header>
    <div className="similarity-report-body">
      <div className="similarity-showdown radar-only">
        <div className="similarity-radar-column">
          <ComparisonRadar metrics={metrics} metricCohort={payload.metricCohort} targetName={target.name} candidateName={candidate.name} targetColor={target.color} candidateColor={candidate.color} targetLabelColor={target.labelColor} candidateLabelColor={candidate.labelColor} targetLabelTransparency={target.labelTransparency} candidateLabelTransparency={candidate.labelTransparency} />
          <MetricGroupLegend metrics={metrics} cohort={payload.metricCohort} />
        </div>
      </div>
      <div className="similarity-metric-section">
        <div className="similarity-metric-head"><span style={{ color: target.color }}>{target.name}</span><b>{t("COMPARATIVA MÉTRICA A MÉTRICA")}</b><span style={{ color: candidate.color }}>{candidate.name}</span></div>
        <div className="metric-comparison-list">{metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} cohort={payload.metricCohort} targetName={target.name} candidateName={candidate.name} targetColor={target.color} candidateColor={candidate.color} />)}</div>
      </div>
    </div>
  </div>;
}
