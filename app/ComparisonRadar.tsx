"use client";

import type { SimilarityMetricComparison } from "@/lib/similarity";
import { similarityMetricGroup } from "@/lib/similarityMetricGroups";
import type { CSSProperties } from "react";

const WIDTH = 800;
const HEIGHT = 700;
const CENTER_X = 400;
const CENTER_Y = 350;
const RADIUS = 205;

function point(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / total;
  return { x: CENTER_X + Math.cos(angle) * radius, y: CENTER_Y + Math.sin(angle) * radius, angle };
}

function polygon(metrics: SimilarityMetricComparison[], field: "targetPercentile" | "candidatePercentile") {
  return metrics.map((metric, index) => {
    const radius = RADIUS * Math.max(0, Math.min(100, metric[field])) / 100;
    const value = point(index, metrics.length, radius);
    return `${value.x.toFixed(1)},${value.y.toFixed(1)}`;
  }).join(" ");
}

function arcPath(start: number, end: number, radius: number) {
  const startPoint = { x: CENTER_X + Math.cos(start) * radius, y: CENTER_Y + Math.sin(start) * radius };
  const endPoint = { x: CENTER_X + Math.cos(end) * radius, y: CENTER_Y + Math.sin(end) * radius };
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

function shortName(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts.at(-1)}` : value;
}

export function ComparisonRadar({ metrics, targetName, candidateName, targetColor, candidateColor, targetLabelColor, candidateLabelColor, targetLabelTransparency, candidateLabelTransparency }: { metrics: SimilarityMetricComparison[]; targetName: string; candidateName: string; targetColor: string; candidateColor: string; targetLabelColor: string; candidateLabelColor: string; targetLabelTransparency: number; candidateLabelTransparency: number }) {
  if (metrics.length < 3) return null;
  const step = Math.PI * 2 / metrics.length;
  const labelRadius = 278;
  const target = shortName(targetName);
  const candidate = shortName(candidateName);
  const targetLabelOpacity = `${100 - Math.max(0, Math.min(100, targetLabelTransparency))}%`;
  const candidateLabelOpacity = `${100 - Math.max(0, Math.min(100, candidateLabelTransparency))}%`;

  return <div className="comparison-radar-wrap" style={{ "--comparison-target": targetColor, "--comparison-candidate": candidateColor, "--comparison-target-label": targetLabelColor, "--comparison-candidate-label": candidateLabelColor, "--comparison-target-label-opacity": targetLabelOpacity, "--comparison-candidate-label-opacity": candidateLabelOpacity } as CSSProperties}>
    <div className="comparison-radar-legend" aria-hidden="true"><span className="target"><i />{target}</span><span className="candidate"><i />{candidate}</span></div>
    <svg className="comparison-radar" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="comparison-radar-title comparison-radar-description">
      <title id="comparison-radar-title">Radar comparativo de {targetName} y {candidateName}</title>
      <desc id="comparison-radar-description">Comparación de percentiles P0 a P100. {targetName} aparece con círculos y {candidateName} con cuadrados.</desc>
      {[25, 50, 75, 100].map((level) => <polygon key={level} className="comparison-radar-grid" points={metrics.map((_, index) => { const value = point(index, metrics.length, RADIUS * level / 100); return `${value.x},${value.y}`; }).join(" ")} />)}
      {metrics.map((metric, index) => { const edge = point(index, metrics.length, RADIUS); return <line key={metric.key} className="comparison-radar-axis" x1={CENTER_X} y1={CENTER_Y} x2={edge.x} y2={edge.y} />; })}
      {metrics.map((metric, index) => {
        const start = -Math.PI / 2 + index * step - step * .43;
        const end = -Math.PI / 2 + index * step + step * .43;
        return <path key={`ring-${metric.key}`} d={arcPath(start, end, RADIUS + 18)} fill="none" stroke={similarityMetricGroup(metric).color} className="comparison-radar-group" />;
      })}
      <polygon className="comparison-radar-area target" points={polygon(metrics, "targetPercentile")} />
      <polygon className="comparison-radar-area candidate" points={polygon(metrics, "candidatePercentile")} />
      {metrics.map((metric, index) => {
        const targetPoint = point(index, metrics.length, RADIUS * metric.targetPercentile / 100);
        const candidatePoint = point(index, metrics.length, RADIUS * metric.candidatePercentile / 100);
        const label = point(index, metrics.length, labelRadius);
        const anchor = Math.cos(label.angle) > .22 ? "start" : Math.cos(label.angle) < -.22 ? "end" : "middle";
        const labelX = label.x;
        const badgeWidth = 39;
        const badgeGap = 5;
        const badgesWidth = badgeWidth * 2 + badgeGap;
        const badgesX = anchor === "start" ? labelX : anchor === "end" ? labelX - badgesWidth : labelX - badgesWidth / 2;
        const badgesY = label.y;
        return <g key={`values-${metric.key}`}>
          <circle className="comparison-radar-dot target" cx={targetPoint.x} cy={targetPoint.y} r="5" />
          <rect className="comparison-radar-dot candidate" x={candidatePoint.x - 4.5} y={candidatePoint.y - 4.5} width="9" height="9" rx="1.5" />
          <text className="comparison-radar-label" x={labelX} y={label.y - 7} textAnchor={anchor}>{metric.label}</text>
          <g className="comparison-radar-percentile" aria-label={`${targetName}: percentil ${metric.targetPercentile}; ${candidateName}: percentil ${metric.candidatePercentile}`}>
            <g className="target">
              <rect x={badgesX} y={badgesY} width={badgeWidth} height="18" rx="9" />
              <text x={badgesX + badgeWidth / 2} y={badgesY + 12.5} textAnchor="middle">P{metric.targetPercentile}</text>
            </g>
            <g className="candidate">
              <rect x={badgesX + badgeWidth + badgeGap} y={badgesY} width={badgeWidth} height="18" rx="3" />
              <text x={badgesX + badgeWidth + badgeGap + badgeWidth / 2} y={badgesY + 12.5} textAnchor="middle">P{metric.candidatePercentile}</text>
            </g>
          </g>
        </g>;
      })}
    </svg>
  </div>;
}
