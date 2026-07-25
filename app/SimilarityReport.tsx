"use client";

import { motion, useReducedMotion } from "framer-motion";
import { type CSSProperties, useId } from "react";
import { ComparisonRadar } from "./ComparisonRadar";
import { Search } from "./Icons";
import { formatPlayerPositions } from "@/lib/positions";
import { formatCell } from "@/lib/scouting";
import { type SimilarityMetricComparison } from "@/lib/similarity";
import { SIMILARITY_METRIC_GROUPS, similarityMetricGroup } from "@/lib/similarityMetricGroups";
import { t, tf } from "@/lib/i18n";
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

function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Images come from Transfermarkt or from a source selected by the user.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
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

function ComparisonPlayer({ player, label }: { player: SimilarityReportPlayer; label: string }) {
  const { profile, name, team, position, age, passport, color, photoScale } = player;
  return <article className="comparison-player-card" style={{ "--player-color": color } as CSSProperties}>
    <header>
      <span>{label}</span>
      {profile.clubLogo
        ? <ReportImage src={profile.clubLogo} alt={profile.club || team} className="comparison-club-logo" />
        : <span className="comparison-club-fallback">{team.slice(0, 2).toUpperCase()}</span>}
    </header>
    <div className="comparison-player-portrait">
      {profile.playerImage
        ? <span className="comparison-player-photo-frame" style={{ "--photo-scale": photoScale / 100 } as CSSProperties}><ReportImage src={profile.playerImage} alt={name} className="comparison-player-image" /></span>
        : <span>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>}
    </div>
    <div className="comparison-player-copy">
      <h3>{name}</h3>
      <b>{profile.club || team}</b>
      <p>{formatPlayerPositions(profile.position || position)}</p>
      <small>{tf("{age} años · {passport}", { age: profile.age || age, passport: profile.citizenship || passport })}</small>
      {profile.marketValue && <strong className="comparison-market-value"><span>{profile.marketValue}</span><ReportImage src={TRANSFERMARKT_LOGO} alt="Transfermarkt" className="comparison-transfermarkt-logo" /></strong>}
    </div>
  </article>;
}

function MetricGroupLegend({ metrics, cohort }: { metrics: SimilarityMetricComparison[]; cohort: string }) {
  const present = SIMILARITY_METRIC_GROUPS.filter((group) => metrics.some((metric) => similarityMetricGroup(metric, cohort).id === group.id));
  return <div className="similarity-metric-group-legend" aria-label={t("Leyenda de grupos métricos")}>
    {present.map((group) => <span key={group.id}><i style={{ "--metric-group-color": group.color } as CSSProperties} /><b>{t(group.label)}</b></span>)}
  </div>;
}

function MetricComparison({ metric, targetName, candidateName, targetColor, candidateColor }: { metric: SimilarityMetricComparison; targetName: string; candidateName: string; targetColor: string; candidateColor: string }) {
  const targetValue = formatMetricValue(metric.targetValue, metric.key);
  const candidateValue = formatMetricValue(metric.candidateValue, metric.key);
  const total = metric.targetPercentile + metric.candidatePercentile;
  const targetShare = total > 0 ? (metric.targetPercentile / total) * 100 : 50;
  const winner = metric.targetPercentile > metric.candidatePercentile ? "target" : metric.candidatePercentile > metric.targetPercentile ? "candidate" : "tie";
  return <div className={`metric-duel winner-${winner}`} style={{ "--target-color": targetColor, "--candidate-color": candidateColor, "--target-share": `${targetShare}%` } as CSSProperties} aria-label={`${t(metric.label)} - ${targetName}: ${targetValue}; ${candidateName}: ${candidateValue}`}>
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
  return <div className="similarity-report-main">
    <header className="similarity-report-header duel-header">
      <div className="duel-header-player left" style={{ "--player-color": target.color } as CSSProperties}><span>{t("JUGADOR OBJETIVO")}</span><b>{target.name}</b></div>
      <div className="duel-header-center"><SimilarityStarScore similarity={payload.similarity} /><small><span className="report-lupa"><Search size={9} /></span> {t("COMPARACIÓN DE JUGADORES")} · {tf("Percentiles posicionales · {src}", { src: t(payload.sourceName) })}</small></div>
      <div className="duel-header-player right" style={{ "--player-color": candidate.color } as CSSProperties}><span>{t("JUGADOR COMPARABLE")}</span><b>{candidate.name}</b></div>
    </header>
    <div className="similarity-report-body">
      <div className="similarity-showdown">
        <ComparisonPlayer player={target} label={t("JUGADOR OBJETIVO")} />
        <div className="similarity-radar-column">
          <ComparisonRadar metrics={metrics} metricCohort={payload.metricCohort} targetName={target.name} candidateName={candidate.name} targetColor={target.color} candidateColor={candidate.color} targetLabelColor={target.labelColor} candidateLabelColor={candidate.labelColor} targetLabelTransparency={target.labelTransparency} candidateLabelTransparency={candidate.labelTransparency} />
          <MetricGroupLegend metrics={metrics} cohort={payload.metricCohort} />
        </div>
        <ComparisonPlayer player={candidate} label={t("JUGADOR COMPARABLE")} />
      </div>
      <div className="similarity-metric-section">
        <div className="similarity-metric-head"><span style={{ color: target.color }}>{target.name}</span><b>{t("COMPARATIVA MÉTRICA A MÉTRICA")}</b><span style={{ color: candidate.color }}>{candidate.name}</span></div>
        <div className="metric-comparison-list">{metrics.map((metric) => <MetricComparison key={metric.key} metric={metric} targetName={target.name} candidateName={candidate.name} targetColor={target.color} candidateColor={candidate.color} />)}</div>
      </div>
    </div>
  </div>;
}
